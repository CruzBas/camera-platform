using System.Globalization;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Transit;
using Microsoft.AspNetCore.Mvc;

namespace Innova.Occupancy.Api.Controllers;

/// <summary>
/// Trip planning on the Coronado line: which bus to take from where the rider is to where they go,
/// from live bus positions and occupancy.
/// </summary>
[ApiController]
[Route("api/v1/trips")]
public sealed class TripsController(TripPlanner planner) : ControllerBase
{
    /// <summary>
    /// Options from <paramref name="from"/> to <paramref name="to"/>, each "lat,lon", best first: walk to a
    /// stop, the specific bus to catch (with its occupancy), an optional transfer, and the arrival time.
    /// </summary>
    [HttpGet("plan")]
    [ProducesResponseType<TripPlan>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<TripPlan> Plan(
        [FromQuery] string from,
        [FromQuery] string to,
        [FromQuery] double walkKmh = 4.5,
        [FromQuery] double maxWalkMeters = 1000,
        [FromQuery] int marginSeconds = 60)
    {
        if (!TryParsePoint(from, out var origin) || !TryParsePoint(to, out var destination))
        {
            return Problem(title: "'from' and 'to' must be \"lat,lon\", for example from=9.9581,-84.0393.", statusCode: StatusCodes.Status400BadRequest);
        }

        if (walkKmh is < 1 or > 8 || maxWalkMeters is < 100 or > 3000 || marginSeconds is < 0 or > 600)
        {
            return Problem(
                title: "walkKmh must be 1–8, maxWalkMeters 100–3000 and marginSeconds 0–600.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        return Ok(planner.Plan(new TripRequest(origin, destination, walkKmh, maxWalkMeters, TimeSpan.FromSeconds(marginSeconds))));
    }

    private static bool TryParsePoint(string? value, out GeoPoint point)
    {
        point = new GeoPoint(0, 0);
        var parts = value?.Split(',');
        if (parts is not [var lat, var lon] ||
            !double.TryParse(lat, NumberStyles.Float, CultureInfo.InvariantCulture, out var latitude) ||
            !double.TryParse(lon, NumberStyles.Float, CultureInfo.InvariantCulture, out var longitude) ||
            latitude is < -90 or > 90 || longitude is < -180 or > 180)
        {
            return false;
        }

        point = new GeoPoint(latitude, longitude);
        return true;
    }
}
