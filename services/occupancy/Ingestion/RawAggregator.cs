using System.Collections.Concurrent;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Vehicles;

namespace Innova.Occupancy.Api.Ingestion;

/// <summary>
/// Turns raw messages into the same observations the read endpoints serve: GPS fixes become the
/// position, door-counter events become door events and a running count, and the vision results
/// cross-check that count.
/// </summary>
public sealed class RawAggregator(VehicleStateStore store, TimeProvider time)
{
    /// <summary>A bus that sent raw data this recently is driven by it instead of the simulator.</summary>
    public static readonly TimeSpan RawDataTakeover = TimeSpan.FromMinutes(2);

    private readonly ConcurrentDictionary<string, VehicleRawState> _vehicles = new(StringComparer.Ordinal);

    public RawMessageAccepted Apply(
        string vehicleId,
        int capacity,
        RawVehicleMessage message,
        IReadOnlyList<GpsFix> fixes,
        int rejectedSentences,
        IReadOnlyList<DoorSignal> doorSignals,
        VisionReading? vision)
    {
        var state = _vehicles.GetOrAdd(vehicleId, _ => new VehicleRawState());
        lock (state)
        {
            // OnboardComputerApps resend after network errors; counting a message twice would
            // double its boardings, so anything at or below the last sequence is ignored.
            if (message.Sequence <= state.LastSequence)
            {
                return new RawMessageAccepted(vehicleId, message.Sequence, true, 0, 0, 0, 0, state.PassengerCount);
            }

            state.LastSequence = message.Sequence;
            state.LastRawAt = time.GetUtcNow();

            var completed = new List<DoorEventReport>();
            foreach (var signal in doorSignals)
            {
                state.HasDoorCounter = true;
                switch (signal.Type)
                {
                    case DoorSignalType.Opened:
                        state.OpenDoors[signal.Door] = new OpenDoor(signal.At);
                        break;
                    case DoorSignalType.Count:
                        // A door can open in one message and close in the next.
                        var open = state.OpenDoors.GetValueOrDefault(signal.Door) ?? new OpenDoor(signal.At);
                        state.OpenDoors[signal.Door] = open with { In = open.In + signal.In, Out = open.Out + signal.Out };
                        state.PassengerCount = Math.Max(0, (state.PassengerCount ?? 0) + signal.In - signal.Out);
                        break;
                    case DoorSignalType.Closed when state.OpenDoors.Remove(signal.Door, out var closing):
                        completed.Add(new DoorEventReport(signal.Door, closing.In, closing.Out, closing.OpenedAt, signal.At));
                        break;
                }
            }

            var source = SensorSource.DoorCounter3D;
            if (vision is not null)
            {
                // The camera cannot see more people than are on board, so a door count below
                // what it sees has drifted and is raised; a camera-only bus uses its count.
                if (!state.HasDoorCounter || vision.People > (state.PassengerCount ?? 0))
                {
                    state.PassengerCount = vision.People;
                    source = SensorSource.CabinCamera;
                }
            }

            var latestFix = fixes.Count > 0 ? fixes[^1] : null;
            var timestamp = new[]
                {
                    message.SentAt,
                    latestFix?.Time ?? DateTimeOffset.MinValue,
                    doorSignals.Count > 0 ? doorSignals[^1].At : DateTimeOffset.MinValue,
                    vision?.At ?? DateTimeOffset.MinValue
                }
                .Max();

            store.Apply(vehicleId, new VehicleObservation(
                timestamp,
                latestFix is null ? null : new GeoLocation(latestFix.Lat, latestFix.Lon, latestFix.SpeedKmh, latestFix.HeadingDeg),
                state.PassengerCount is { } count && state.HasAnyCount(vision)
                    ? new OccupancyReading(count, capacity, source)
                    : null,
                completed,
                new DeviceStatusReport(vision is null ? null : true, null)));

            return new RawMessageAccepted(
                vehicleId,
                message.Sequence,
                false,
                fixes.Count,
                rejectedSentences,
                completed.Count,
                message.Vision?.Frames.Count ?? 0,
                state.PassengerCount);
        }
    }

    public bool HasRecentRawData(string vehicleId, DateTimeOffset now) =>
        _vehicles.TryGetValue(vehicleId, out var state) && now - state.LastRawAt < RawDataTakeover;

    private sealed record OpenDoor(DateTimeOffset OpenedAt, int In = 0, int Out = 0);

    private sealed class VehicleRawState
    {
        public long LastSequence { get; set; } = long.MinValue;
        public DateTimeOffset LastRawAt { get; set; }
        public int? PassengerCount { get; set; }
        public bool HasDoorCounter { get; set; }
        public Dictionary<int, OpenDoor> OpenDoors { get; } = [];

        public bool HasAnyCount(VisionReading? vision) => HasDoorCounter || vision is not null;
    }
}
