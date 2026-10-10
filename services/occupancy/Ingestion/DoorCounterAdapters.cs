namespace Innova.Occupancy.Api.Ingestion;

public enum DoorSignalType
{
    Opened,
    Count,
    Closed
}

/// <summary>A door-counter event in a vendor-neutral shape.</summary>
public sealed record DoorSignal(int Door, DoorSignalType Type, DateTimeOffset At, int In, int Out);

/// <summary>
/// Door counters have no universal output format, so each format gets an adapter. Supporting a
/// real counter means adding an adapter for its format; nothing else changes.
/// </summary>
public interface IDoorCounterAdapter
{
    string Format { get; }

    IReadOnlyList<DoorSignal> Read(IReadOnlyList<RawDoorCounterEvent> events);
}

/// <summary>The team's assumed APC format: DOOR_OPENED, COUNT (in/out) and DOOR_CLOSED per door.</summary>
public sealed class ApcDoorEventsV1Adapter : IDoorCounterAdapter
{
    public string Format => "apc-door-events-v1";

    public IReadOnlyList<DoorSignal> Read(IReadOnlyList<RawDoorCounterEvent> events) =>
        events.Select(item =>
        {
            if (item.Door < 1)
            {
                throw new FormatException("door must be 1 or greater.");
            }

            return item.Type switch
            {
                "DOOR_OPENED" => new DoorSignal(item.Door, DoorSignalType.Opened, item.At, 0, 0),
                "DOOR_CLOSED" => new DoorSignal(item.Door, DoorSignalType.Closed, item.At, 0, 0),
                "COUNT" when item.In is >= 0 && item.Out is >= 0 =>
                    new DoorSignal(item.Door, DoorSignalType.Count, item.At, item.In.Value, item.Out.Value),
                "COUNT" => throw new FormatException("COUNT events need non-negative 'in' and 'out'."),
                _ => throw new FormatException($"Unknown door-counter event type '{item.Type}'.")
            };
        })
        .OrderBy(signal => signal.At)
        .ToArray();
}

public sealed class DoorCounterAdapterRegistry(IEnumerable<IDoorCounterAdapter> adapters)
{
    private readonly Dictionary<string, IDoorCounterAdapter> _adapters =
        adapters.ToDictionary(adapter => adapter.Format, StringComparer.OrdinalIgnoreCase);

    public IReadOnlyCollection<string> Formats => _adapters.Keys;

    public IDoorCounterAdapter? Find(string format) => _adapters.GetValueOrDefault(format);
}
