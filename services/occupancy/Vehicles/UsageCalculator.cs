using Innova.Occupancy.Api.Models;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>
/// One occupancy reading as stored; <see cref="RouteId"/> is null while the bus is parked.
/// <see cref="Backfill"/> readings were simulated at startup and only count toward fleet totals.
/// </summary>
public sealed record HistoryEntry(DateTimeOffset Time, int PassengerCount, int Capacity, SensorSource Source, string? RouteId, bool Backfill = false);

/// <summary>
/// Turns a bus's readings into hourly totals: how long it was in service, how full it ran and how
/// many people boarded. Money is left to the clients, which hold the fares and costs.
/// </summary>
public static class UsageCalculator
{
    /// <summary>
    /// A reading stands for the time until the next one, but never longer than this: a longer gap
    /// means the bus stopped reporting, and that time is not counted.
    /// </summary>
    public static readonly TimeSpan MaximumReadingSpan = TimeSpan.FromSeconds(60);

    /// <summary>Loads in 10 % bands: 0–9 %, 10–19 % … 90–99 %, and 100 % or more.</summary>
    public const int Bands = 11;

    /// <param name="history">Readings inside [from, to), oldest first.</param>
    /// <param name="events">Door events that closed inside [from, to).</param>
    public static IReadOnlyList<HourlyUsage> Hourly(
        IReadOnlyList<HistoryEntry> history,
        IReadOnlyList<VehicleDoorEvent> events,
        DateTimeOffset from,
        DateTimeOffset to)
    {
        var hours = new SortedDictionary<DateTimeOffset, Accumulator>();
        Accumulator HourOf(DateTimeOffset moment)
        {
            var start = new DateTimeOffset(moment.UtcTicks - (moment.UtcTicks % TimeSpan.TicksPerHour), TimeSpan.Zero);
            if (!hours.TryGetValue(start, out var hour))
            {
                hours[start] = hour = new Accumulator();
            }

            return hour;
        }

        for (var index = 0; index < history.Count; index++)
        {
            var entry = history[index];
            var next = index + 1 < history.Count ? history[index + 1].Time : to;
            var end = Min(next, entry.Time + MaximumReadingSpan, to);

            // A reading can straddle the hour; each hour gets its own share of the time.
            for (var start = entry.Time; start < end;)
            {
                var hourEnd = new DateTimeOffset(start.UtcTicks - (start.UtcTicks % TimeSpan.TicksPerHour), TimeSpan.Zero).AddHours(1);
                var sliceEnd = Min(end, hourEnd, to);
                HourOf(start).Add(entry, (sliceEnd - start).TotalSeconds);
                start = sliceEnd;
            }
        }

        foreach (var item in events)
        {
            var hour = HourOf(item.ClosedAt);
            hour.Boardings += item.Boardings;
            hour.Alightings += item.Alightings;
        }

        return hours.Select(pair => pair.Value.ToUsage(pair.Key)).ToArray();
    }

    private static DateTimeOffset Min(DateTimeOffset first, DateTimeOffset second, DateTimeOffset third) =>
        new[] { first, second, third }.Min();

    /// <summary>A parked bus or one that only sends simulated data without a trip is not in service.</summary>
    private static bool InService(HistoryEntry entry) =>
        entry.RouteId is not null || entry.Source != SensorSource.Simulated;

    private sealed class Accumulator
    {
        private readonly double[] _secondsByBand = new double[Bands];
        private double _serviceSeconds;
        private double _percentSeconds;
        private int _peakPercent;
        private string? _routeId;
        private SensorSource? _source;

        public int Boardings { get; set; }

        public int Alightings { get; set; }

        public void Add(HistoryEntry entry, double seconds)
        {
            _routeId = entry.RouteId ?? _routeId;
            _source = entry.Source;
            if (!InService(entry) || seconds <= 0)
            {
                return;
            }

            var percent = entry.Capacity <= 0 ? 0 : entry.PassengerCount * 100d / entry.Capacity;
            _serviceSeconds += seconds;
            _percentSeconds += percent * seconds;
            _peakPercent = Math.Max(_peakPercent, (int)Math.Round(percent));
            _secondsByBand[Math.Clamp((int)(percent / 10), 0, Bands - 1)] += seconds;
        }

        public HourlyUsage ToUsage(DateTimeOffset hour) => new(
            hour,
            _routeId,
            _source,
            (int)Math.Round(_serviceSeconds),
            Boardings,
            Alightings,
            _serviceSeconds > 0 ? (int)Math.Round(_percentSeconds / _serviceSeconds) : 0,
            _peakPercent,
            _secondsByBand.Select(seconds => (int)Math.Round(seconds)).ToArray());
    }
}
