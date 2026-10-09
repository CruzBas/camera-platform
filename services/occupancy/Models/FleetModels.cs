namespace Innova.Occupancy.Api.Models;

/// <summary>
/// One bus during one clock hour. Only the time the bus was in service counts toward the loads.
/// </summary>
/// <param name="Hour">Start of the hour (UTC; Costa Rica hours start at the same moments).</param>
/// <param name="RouteId">Route the bus ran during the hour, when it reported one.</param>
/// <param name="Source">Where its latest count in the hour came from.</param>
/// <param name="AveragePercent">Load averaged over the time in service.</param>
/// <param name="SecondsByBand">Seconds in service at each load: 0–9 %, 10–19 % … 90–99 %, 100 % or more.</param>
public sealed record HourlyUsage(
    DateTimeOffset Hour,
    string? RouteId,
    SensorSource? Source,
    int ServiceSeconds,
    int Boardings,
    int Alightings,
    int AveragePercent,
    int PeakPercent,
    IReadOnlyList<int> SecondsByBand);

/// <param name="RouteId">The route the bus is registered on.</param>
public sealed record BusHourlyUsage(string VehicleId, string? RouteId, int? Capacity, IReadOnlyList<HourlyUsage> Hours);

public sealed record FleetHourlyUsage(DateTimeOffset From, DateTimeOffset To, IReadOnlyList<BusHourlyUsage> Buses);
