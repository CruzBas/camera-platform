using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Transit;
using Innova.Occupancy.Api.Vehicles;
using Microsoft.AspNetCore.Mvc;

namespace Innova.Occupancy.Api.Controllers;

/// <summary>
/// Totals over the whole fleet, built only from what the buses reported. Fares and operating
/// costs are not known here; operator dashboards apply them to these totals.
/// </summary>
[ApiController]
[Route("api/v1/fleet")]
[Produces("application/json")]
public sealed class FleetController(VehicleStateStore store, FleetRegistry fleet, TimeProvider time) : ControllerBase
{
    private static readonly TimeSpan MaximumRange = TimeSpan.FromHours(24);

    /// <summary>
    /// Per bus and per hour: time in service, load (average, peak and time in each 10 % band) and
    /// boardings. Defaults to today in Costa Rica, from midnight until now.
    /// </summary>
    [HttpGet("hourly")]
    [ProducesResponseType<FleetHourlyUsage>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    public ActionResult<FleetHourlyUsage> GetHourly([FromQuery] DateTimeOffset? from, [FromQuery] DateTimeOffset? to)
    {
        var end = to ?? time.GetUtcNow();
        var start = from ?? StartOfDay(end);
        if (start >= end || end - start > MaximumRange)
        {
            return Problem(
                title: "'from' must be before 'to', and the range can be at most 24 hours.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var buses = store.GetHourlyUsage(start, end)
            .Select(bus => new BusHourlyUsage(bus.VehicleId, fleet.RouteOf(bus.VehicleId), fleet.CapacityOf(bus.VehicleId), bus.Hours))
            .ToArray();
        return Ok(new FleetHourlyUsage(start, end, buses));
    }

    private static DateTimeOffset StartOfDay(DateTimeOffset moment)
    {
        var local = moment.ToOffset(TransitTiming.CostaRicaOffset);
        return new DateTimeOffset(local.Date, TransitTiming.CostaRicaOffset);
    }
}
