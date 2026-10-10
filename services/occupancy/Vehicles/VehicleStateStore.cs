using System.Collections.Concurrent;
using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Models;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>
/// Latest state, door events and occupancy history per bus, kept in memory. A database can replace
/// this later behind the same methods; everything is lost on restart until then.
/// </summary>
public sealed class VehicleStateStore(IOptions<OccupancyApiOptions> options, TimeProvider time)
{
    private readonly OccupancyApiOptions _options = options.Value;
    private readonly ConcurrentDictionary<string, VehicleRecord> _vehicles = new(StringComparer.Ordinal);

    /// <param name="backfill">
    /// Simulated history from before the API started. It only feeds the fleet totals; the
    /// per-bus history and events endpoints never return it, so their answers stay as they were.
    /// </param>
    public void Apply(string vehicleId, VehicleObservation observation, bool backfill = false)
    {
        var receivedAt = time.GetUtcNow();
        var record = _vehicles.GetOrAdd(vehicleId, id => new VehicleRecord(id));

        lock (record)
        {
            if (backfill)
            {
                // Hours before startup are only history: the bus's current state stays untouched,
                // so clients never see an earlier hour's position while the replay runs.
                AddHistory(record, observation, backfill: true);
                Trim(record, receivedAt);
                return;
            }

            record.LastSeen = receivedAt;
            if (observation.Device is { } device)
            {
                record.CameraOnline = device.CameraOnline ?? record.CameraOnline;
                record.Firmware = device.Firmware ?? record.Firmware;
            }

            // Messages can arrive out of order over a mobile network; an older one must not
            // overwrite a newer position or count, but its events and history still count.
            var isLatest = record.AsOf is null || observation.Timestamp >= record.AsOf;
            if (isLatest)
            {
                record.AsOf = observation.Timestamp;
                record.Location = observation.Location ?? record.Location;
                record.Trip = observation.Trip;
            }

            if (observation.Occupancy is { } reading)
            {
                if (isLatest)
                {
                    var percent = OccupancyClassifier.Percent(reading.PassengerCount, reading.Capacity);
                    record.Occupancy = new OccupancySnapshot(
                        reading.PassengerCount,
                        reading.Capacity,
                        percent,
                        OccupancyClassifier.Classify(reading.PassengerCount, percent, _options.Thresholds),
                        reading.Source,
                        observation.Timestamp);
                }
            }

            AddHistory(record, observation, backfill: false);
            Trim(record, receivedAt);
        }
    }

    private static void AddHistory(VehicleRecord record, VehicleObservation observation, bool backfill)
    {
        if (observation.Occupancy is { } reading)
        {
            record.History.Add(new HistoryEntry(
                observation.Timestamp,
                reading.PassengerCount,
                reading.Capacity,
                reading.Source,
                observation.Trip?.RouteId,
                backfill));
        }

        var doorEvents = observation.DoorEvents ?? [];
        for (var index = 0; index < doorEvents.Count; index++)
        {
            var doorEvent = doorEvents[index];
            var isLastInMessage = index == doorEvents.Count - 1;
            (backfill ? record.BackfillEvents : record.Events).Add(new VehicleDoorEvent(
                doorEvent.Door,
                doorEvent.Boardings,
                doorEvent.Alightings,
                observation.Location,
                doorEvent.OpenedAt,
                doorEvent.ClosedAt,
                isLastInMessage ? observation.Occupancy?.PassengerCount : null));
        }
    }

    public IReadOnlyList<VehicleState> List() =>
        _vehicles.Values
            .Select(Snapshot)
            .OfType<VehicleState>()
            .OrderBy(state => state.VehicleId, StringComparer.Ordinal)
            .ToArray();

    public VehicleState? Get(string vehicleId) =>
        _vehicles.TryGetValue(vehicleId, out var record) ? Snapshot(record) : null;

    public IReadOnlyList<VehicleDoorEvent>? GetEvents(string vehicleId, DateTimeOffset? since)
    {
        if (!_vehicles.TryGetValue(vehicleId, out var record))
        {
            return null;
        }

        lock (record)
        {
            return record.Events
                .Where(item => since is null || item.ClosedAt > since)
                .OrderBy(item => item.ClosedAt)
                .ToArray();
        }
    }

    public IReadOnlyList<OccupancyHistoryPoint>? GetHistory(
        string vehicleId,
        DateTimeOffset from,
        DateTimeOffset to,
        TimeSpan interval)
    {
        if (!_vehicles.TryGetValue(vehicleId, out var record))
        {
            return null;
        }

        HistoryEntry[] entries;
        lock (record)
        {
            entries = record.History
                .Where(entry => !entry.Backfill && entry.Time >= from && entry.Time < to)
                .OrderBy(entry => entry.Time)
                .ToArray();
        }

        // Each bucket reports the level at its end (last reading) and the peak inside it.
        return entries
            .GroupBy(entry => from + (interval * Math.Floor((entry.Time - from) / interval)))
            .Select(bucket =>
            {
                var last = bucket.Last();
                return new OccupancyHistoryPoint(
                    bucket.Key,
                    last.PassengerCount,
                    bucket.Max(entry => entry.PassengerCount),
                    last.Capacity,
                    OccupancyClassifier.Percent(last.PassengerCount, last.Capacity));
            })
            .ToArray();
    }

    /// <summary>Hourly service time, loads and boardings of every bus between two moments.</summary>
    public IReadOnlyList<(string VehicleId, IReadOnlyList<HourlyUsage> Hours)> GetHourlyUsage(DateTimeOffset from, DateTimeOffset to)
    {
        var result = new List<(string, IReadOnlyList<HourlyUsage>)>();
        foreach (var record in _vehicles.Values.OrderBy(record => record.VehicleId, StringComparer.Ordinal))
        {
            HistoryEntry[] history;
            VehicleDoorEvent[] events;
            lock (record)
            {
                history = record.History.Where(entry => entry.Time >= from && entry.Time < to).OrderBy(entry => entry.Time).ToArray();
                events = record.BackfillEvents.Concat(record.Events)
                    .Where(item => item.ClosedAt >= from && item.ClosedAt < to)
                    .ToArray();
            }

            result.Add((record.VehicleId, UsageCalculator.Hourly(history, events, from, to)));
        }

        return result;
    }

    private VehicleState? Snapshot(VehicleRecord record)
    {
        lock (record)
        {
            if (record.AsOf is not { } asOf)
            {
                return null;
            }

            var stale = time.GetUtcNow() - record.LastSeen > TimeSpan.FromSeconds(_options.StaleAfterSeconds);
            return new VehicleState(
                record.VehicleId,
                asOf,
                stale,
                record.Location,
                record.Trip,
                record.Occupancy,
                new DeviceHealth(!stale, record.LastSeen, record.CameraOnline, record.Firmware));
        }
    }

    private void Trim(VehicleRecord record, DateTimeOffset now)
    {
        // History arrives almost in order, so only scan it when its oldest entry has expired.
        var oldestKept = now - TimeSpan.FromHours(_options.HistoryRetentionHours);
        if (record.History.Count > 0 && record.History[0].Time < oldestKept)
        {
            record.History.RemoveAll(entry => entry.Time < oldestKept);
        }

        if (record.BackfillEvents.Count > 0 && record.BackfillEvents[0].ClosedAt < oldestKept)
        {
            record.BackfillEvents.RemoveAll(item => item.ClosedAt < oldestKept);
        }

        var excess = record.Events.Count - _options.MaxEventsPerVehicle;
        if (excess > 0)
        {
            record.Events.Sort((first, second) => first.ClosedAt.CompareTo(second.ClosedAt));
            record.Events.RemoveRange(0, excess);
        }
    }

    private sealed class VehicleRecord(string vehicleId)
    {
        public string VehicleId { get; } = vehicleId;
        public DateTimeOffset? AsOf { get; set; }
        public DateTimeOffset LastSeen { get; set; }
        public GeoLocation? Location { get; set; }
        public TripDescriptor? Trip { get; set; }
        public OccupancySnapshot? Occupancy { get; set; }
        public bool? CameraOnline { get; set; }
        public string? Firmware { get; set; }
        public List<VehicleDoorEvent> Events { get; } = [];
        public List<VehicleDoorEvent> BackfillEvents { get; } = [];
        public List<HistoryEntry> History { get; } = [];
    }
}
