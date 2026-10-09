using System.Globalization;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Vehicles;
using Microsoft.AspNetCore.Mvc;

namespace Innova.Occupancy.Api.Controllers;

/// <summary>
/// Serves only what the buses report after on-board processing of video and sensor data:
/// occupancy, door events and position. Routes, stops, fares and trips belong to other APIs.
/// </summary>
[ApiController]
[Route("api/v1/vehicles")]
[Produces("application/json")]
public sealed class VehiclesController(
    VehicleStateStore store,
    DeviceAuthorizer authorizer,
    TimeProvider time) : ControllerBase
{    private const int MaximumCapacity = 500;
    private static readonly TimeSpan MinimumInterval = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan MaximumRange = TimeSpan.FromDays(7);
    private static readonly TimeSpan MaximumClockSkew = TimeSpan.FromMinutes(5);

    /// <summary>Latest state of every bus that has reported.</summary>
    [HttpGet]
    [ProducesResponseType<VehicleList>(StatusCodes.Status200OK)]
    public ActionResult<VehicleList> List() => Ok(new VehicleList(store.List()));

    /// <summary>Latest state of one bus: occupancy, position and how fresh the data is.</summary>
    [HttpGet("{vehicleId}")]
    [ProducesResponseType<VehicleState>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<VehicleState> Get(string vehicleId)
    {
        if (!VehicleId.TryNormalize(vehicleId, out var id))
        {
            return InvalidVehicleId();
        }

        return store.Get(id) is { } state ? Ok(state) : UnknownVehicle(id);
    }

    /// <summary>Boarding and exit events per door, oldest first.</summary>
    [HttpGet("{vehicleId}/events")]
    [ProducesResponseType<VehicleEventList>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<VehicleEventList> GetEvents(string vehicleId, [FromQuery] DateTimeOffset? since)
    {
        if (!VehicleId.TryNormalize(vehicleId, out var id))
        {
            return InvalidVehicleId();
        }

        return store.GetEvents(id, since) is { } events
            ? Ok(new VehicleEventList(id, events))
            : UnknownVehicle(id);
    }

    /// <summary>Occupancy over time, grouped into intervals such as 30s, 5m or 1h.</summary>
    [HttpGet("{vehicleId}/history")]
    [ProducesResponseType<OccupancyHistory>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public ActionResult<OccupancyHistory> GetHistory(
        string vehicleId,
        [FromQuery] DateTimeOffset? from,
        [FromQuery] DateTimeOffset? to,
        [FromQuery] string interval = "5m")
    {
        if (!VehicleId.TryNormalize(vehicleId, out var id))
        {
            return InvalidVehicleId();
        }

        if (!TryParseInterval(interval, out var bucket) || bucket < MinimumInterval)
        {
            return Problem(
                title: "Interval must be a number followed by s, m or h, and at least 10s (for example 5m).",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var end = to ?? time.GetUtcNow();
        var start = from ?? end - TimeSpan.FromHours(1);
        if (start >= end || end - start > MaximumRange)
        {
            return Problem(
                title: "'from' must be before 'to', and the range can be at most 7 days.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        return store.GetHistory(id, start, end, bucket) is { } points
            ? Ok(new OccupancyHistory(id, start, end, interval, points))
            : UnknownVehicle(id);
    }

    /// <summary>
    /// Receives the processed result from a bus's on-board equipment. Only devices send here;
    /// each bus authenticates with its own key in the X-Device-Key header.
    /// </summary>
    [HttpPost("{vehicleId}/observations")]
    [Consumes("application/json")]
    [ProducesResponseType<ObservationAccepted>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public IActionResult PostObservation(
        string vehicleId,
        [FromBody] VehicleObservation observation,
        [FromHeader(Name = DeviceAuthorizer.Header)] string? deviceKey)
    {
        if (!VehicleId.TryNormalize(vehicleId, out var id))
        {
            return InvalidVehicleId();
        }

        if (!authorizer.IsAuthorized(id, deviceKey))
        {
            return Problem(
                title: $"A valid {DeviceAuthorizer.Header} header is required for this bus.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (Validate(observation) is { } error)
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        store.Apply(id, observation);
        return Accepted(new ObservationAccepted(id, time.GetUtcNow()));
    }

    private string? Validate(VehicleObservation observation)
    {
        if (observation.Timestamp == default)
        {
            return "timestamp is required.";
        }

        if (observation.Timestamp > time.GetUtcNow() + MaximumClockSkew)
        {
            return "timestamp is in the future; check the device clock.";
        }

        if (observation.Location is { } location &&
            (location.Lat is < -90 or > 90 || location.Lon is < -180 or > 180 || location.SpeedKmh < 0 ||
             location.HeadingDeg is < 0 or >= 360))
        {
            return "location must have lat in [-90, 90], lon in [-180, 180], a non-negative speedKmh and headingDeg in [0, 360).";
        }

        if (observation.Occupancy is { } occupancy &&
            (occupancy.PassengerCount < 0 || occupancy.Capacity is < 1 or > MaximumCapacity))
        {
            return $"occupancy needs passengerCount >= 0 and capacity between 1 and {MaximumCapacity}.";
        }

        foreach (var doorEvent in observation.DoorEvents ?? [])
        {
            if (doorEvent.Door < 1 || doorEvent.Boardings < 0 || doorEvent.Alightings < 0 ||
                doorEvent.ClosedAt < doorEvent.OpenedAt)
            {
                return "each door event needs door >= 1, non-negative counts and closedAt after openedAt.";
            }
        }

        return observation.Location is null && observation.Occupancy is null &&
               observation.DoorEvents is not { Count: > 0 } && observation.Device is null
            ? "an observation must include location, occupancy, doorEvents or device."
            : null;
    }

    private static bool TryParseInterval(string value, out TimeSpan interval)
    {
        interval = TimeSpan.Zero;
        if (value.Length < 2 ||
            !int.TryParse(value.AsSpan(0, value.Length - 1), NumberStyles.None, CultureInfo.InvariantCulture, out var amount) ||
            amount <= 0)
        {
            return false;
        }

        interval = char.ToLowerInvariant(value[^1]) switch
        {
            's' => TimeSpan.FromSeconds(amount),
            'm' => TimeSpan.FromMinutes(amount),
            'h' => TimeSpan.FromHours(amount),
            _ => TimeSpan.Zero
        };
        return interval > TimeSpan.Zero;
    }

    private ObjectResult InvalidVehicleId() => Problem(
        title: "Vehicle ids are letters, digits and hyphens, up to 32 characters (for example SJB-8754).",
        statusCode: StatusCodes.Status400BadRequest);

    private ObjectResult UnknownVehicle(string vehicleId) => Problem(
        title: $"Bus {vehicleId} has not reported any data.",
        statusCode: StatusCodes.Status404NotFound);
}
