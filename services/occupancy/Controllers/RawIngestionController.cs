using Innova.Occupancy.Api.Ingestion;
using Innova.Occupancy.Api.Vehicles;
using Microsoft.AspNetCore.Mvc;

namespace Innova.Occupancy.Api.Controllers;

/// <summary>
/// Receives raw sensor data and vision results from an OnboardComputerApp. All calculations
/// happen here; the result is served by the read endpoints in <see cref="VehiclesController"/>.
/// </summary>
[ApiController]
[Route("api/v1/vehicles")]
[Produces("application/json")]
public sealed class RawIngestionController(
    RawAggregator aggregator,
    FleetRegistry fleet,
    DoorCounterAdapterRegistry doorCounterAdapters,
    DeviceAuthorizer authorizer,
    TimeProvider time) : ControllerBase
{
    private const int MaximumGpsSentences = 2000;
    private const int MaximumDoorEvents = 1000;
    private const int MaximumVisionFrames = 1000;
    private const int MaximumDetectionsPerFrame = 300;
    private static readonly TimeSpan MaximumClockSkew = TimeSpan.FromMinutes(5);

    /// <summary>
    /// One message per send interval (and when doors close): GPS as NMEA 0183, door-counter
    /// events in a named format, and vision inference results. Messages are processed once per
    /// sequence number, so resending after a network error is safe.
    /// </summary>
    [HttpPost("{vehicleId}/raw")]
    [Consumes("application/json")]
    [RequestSizeLimit(2_000_000)]
    [ProducesResponseType<RawMessageAccepted>(StatusCodes.Status202Accepted)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public IActionResult PostRaw(
        string vehicleId,
        [FromBody] RawVehicleMessage message,
        [FromHeader(Name = DeviceAuthorizer.Header)] string? deviceKey)
    {
        if (!VehicleId.TryNormalize(vehicleId, out var id))
        {
            return Problem(
                title: "Vehicle ids are letters, digits and hyphens, up to 32 characters (for example SJB-8754).",
                statusCode: StatusCodes.Status400BadRequest);
        }

        if (!authorizer.IsAuthorized(id, deviceKey))
        {
            return Problem(
                title: $"A valid {DeviceAuthorizer.Header} header is required for this bus.",
                statusCode: StatusCodes.Status401Unauthorized);
        }

        if (fleet.CapacityOf(id) is not { } capacity)
        {
            return Problem(
                title: $"Bus {id} is not registered in the fleet, so its capacity is unknown.",
                statusCode: StatusCodes.Status404NotFound);
        }

        if (Validate(message) is { } error)
        {
            return Problem(title: error, statusCode: StatusCodes.Status400BadRequest);
        }

        IReadOnlyList<DoorSignal> doorSignals = [];
        if (message.DoorCounter is { } doorCounter)
        {
            if (doorCounterAdapters.Find(doorCounter.Format) is not { } adapter)
            {
                return Problem(
                    title: $"Unsupported door-counter format '{doorCounter.Format}'. Supported: {string.Join(", ", doorCounterAdapters.Formats)}.",
                    statusCode: StatusCodes.Status400BadRequest);
            }

            try
            {
                doorSignals = adapter.Read(doorCounter.Events);
            }
            catch (FormatException exception)
            {
                return Problem(title: exception.Message, statusCode: StatusCodes.Status400BadRequest);
            }
        }

        (IReadOnlyList<GpsFix> fixes, int rejected) = message.Gps is { } gps
            ? NmeaParser.Parse(gps.Sentences, message.SentAt)
            : (Array.Empty<GpsFix>(), 0);

        var accepted = aggregator.Apply(id, capacity, message, fixes, rejected, doorSignals, VisionReading.From(message.Vision));
        return Accepted(accepted);
    }

    private string? Validate(RawVehicleMessage message)
    {
        if (message.SentAt == default)
        {
            return "sentAt is required.";
        }

        if (message.SentAt > time.GetUtcNow() + MaximumClockSkew)
        {
            return "sentAt is in the future; check the onboard computer's clock.";
        }

        if (message.Gps is null && message.DoorCounter is null && message.Vision is null)
        {
            return "a message must include gps, doorCounter or vision.";
        }

        if (message.Gps is { } gps &&
            (!string.Equals(gps.Format, NmeaParser.Format, StringComparison.OrdinalIgnoreCase) ||
             gps.Sentences is null || gps.Sentences.Count > MaximumGpsSentences))
        {
            return $"gps must use format {NmeaParser.Format} with at most {MaximumGpsSentences} sentences.";
        }

        if (message.DoorCounter is { Events: null } || message.DoorCounter?.Events.Count > MaximumDoorEvents)
        {
            return $"doorCounter needs an events list of at most {MaximumDoorEvents} events.";
        }

        if (message.Vision is { } vision)
        {
            if (vision.Frames is null || vision.Frames.Count > MaximumVisionFrames)
            {
                return $"vision needs a frames list of at most {MaximumVisionFrames} frames.";
            }

            foreach (var frame in vision.Frames)
            {
                if (frame.Detections is null || frame.Detections.Count > MaximumDetectionsPerFrame ||
                    frame.Detections.Any(detection => detection.Box is not { Count: 4 } || detection.Score is < 0 or > 1))
                {
                    return $"each vision frame needs up to {MaximumDetectionsPerFrame} detections, each with a score from 0 to 1 and a box [x1, y1, x2, y2].";
                }
            }
        }

        return null;
    }
}
