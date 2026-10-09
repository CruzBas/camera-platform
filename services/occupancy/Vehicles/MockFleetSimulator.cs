using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Ingestion;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Transit;
using Innova.Occupancy.Api.Vehicles.Simulation;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>
/// Simulates the mock fleet in MockData so client apps can be built before real devices report.
/// Simulated buses go through the same store as real observations, marked with source SIMULATED.
/// </summary>
public sealed class MockFleetSimulator(
    VehicleStateStore store,
    RawAggregator rawData,
    IOptions<MockFleetOptions> options,
    IHostEnvironment environment,
    TimeProvider time,
    ILogger<MockFleetSimulator> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Value.Enabled)
        {
            return;
        }

        var path = Path.GetFullPath(options.Value.FleetFile, environment.ContentRootPath);
        var fleet = MockFleet.Load(path);
        var random = new Random(142);
        var buses = CreateBuses(fleet, random);

        // Out-of-service buses report once and then go silent, so apps can test stale data.
        foreach (var bus in fleet.Buses.Where(bus => bus.OutOfService))
        {
            var depot = fleet.Routes.First(route => route.RouteId == bus.RouteId).Corridor[0];
            store.Apply(bus.VehicleId, new VehicleObservation(
                time.GetUtcNow(),
                depot,
                new OccupancyReading(0, bus.Capacity, SensorSource.Simulated),
                null,
                new DeviceStatusReport(false, "sim-2.0")));
        }

        var interval = TimeSpan.FromSeconds(Math.Max(1, options.Value.IntervalSeconds));
        var hourOverride = TransitTiming.ParseTimeOfDay(options.Value.TimeOfDayOverride);

        // Replay the last minutes so loads, door events and history already look lived-in. Earlier
        // replayed hours (the day since BackfillFrom) only feed the fleet totals, so the per-bus
        // history and events endpoints answer exactly as they did before backfill existed.
        var start = time.GetUtcNow();
        var replayFrom = ReplayStart(start, options.Value, hourOverride);
        var warmUpFrom = start - TimeSpan.FromMinutes(Math.Max(0, options.Value.WarmUpMinutes));
        for (var moment = replayFrom; moment < start; moment += interval)
        {
            foreach (var bus in buses)
            {
                store.Apply(bus.VehicleId, bus.Step(moment, interval, random, hourOverride), backfill: moment < warmUpFrom);
            }
        }

        logger.LogInformation(
            "Mock fleet '{Operator}' started: {Active} buses running, {OutOfService} out of service, replayed since {ReplayFrom:HH:mm} Costa Rica time, demand hour {Hour}",
            fleet.Operator.Name,
            buses.Count,
            fleet.Buses.Count - buses.Count,
            replayFrom.ToOffset(TransitTiming.CostaRicaOffset),
            options.Value.TimeOfDayOverride is { Length: > 0 } fixedHour ? fixedHour : "from clock");

        using var timer = new PeriodicTimer(interval, time);
        do
        {
            var now = time.GetUtcNow();
            foreach (var bus in buses)
            {
                // A bus whose OnboardComputerApp is sending raw data is driven by that data.
                if (!rawData.HasRecentRawData(bus.VehicleId, now))
                {
                    store.Apply(bus.VehicleId, bus.Step(now, interval, random, hourOverride));
                }
            }
        }
        while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    /// <summary>
    /// Where the startup replay begins: the backfill hour of the current service day, or the
    /// warm-up minutes if earlier. Before the backfill hour (overnight) the service day is
    /// yesterday's, so a restart at 1 a.m. still has the day that just ended.
    /// </summary>
    public static DateTimeOffset ReplayStart(DateTimeOffset now, MockFleetOptions options, double? hourOverride)
    {
        var warmUp = now - TimeSpan.FromMinutes(Math.Max(0, options.WarmUpMinutes));
        if (hourOverride is not null || TransitTiming.ParseTimeOfDay(options.BackfillFrom, "MockFleet:BackfillFrom") is not { } backfillHour)
        {
            return warmUp;
        }

        var local = now.ToOffset(TransitTiming.CostaRicaOffset);
        var backfill = new DateTimeOffset(local.Date, TransitTiming.CostaRicaOffset).AddHours(backfillHour);
        if (backfill > now)
        {
            backfill = backfill.AddDays(-1);
        }

        return backfill < warmUp ? backfill : warmUp;
    }

    /// <summary>Spreads each route's buses evenly along its corridor, alternating directions.</summary>
    public static IReadOnlyList<SimulatedBus> CreateBuses(MockFleet fleet, Random random)
    {
        var routes = fleet.Routes.ToDictionary(route => route.RouteId, TransitRoute.From);
        return fleet.Buses
            .Where(bus => !bus.OutOfService)
            .GroupBy(bus => bus.RouteId)
            .SelectMany(group =>
            {
                var route = routes[group.Key];
                var onRoute = group.ToArray();
                return onRoute.Select((bus, index) => new SimulatedBus(
                    bus.VehicleId,
                    bus.Capacity,
                    route,
                    (index + 0.5) / onRoute.Length,
                    index % 2 == 0 ? TravelDirection.Inbound : TravelDirection.Outbound,
                    (int)(bus.Capacity * (0.1 + (random.NextDouble() * 0.3))),
                    (index + 0.5) / onRoute.Length));
            })
            .ToArray();
    }
}
