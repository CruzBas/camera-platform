namespace Innova.Occupancy.Api.Configuration;

public sealed class OccupancyApiOptions
{
    public const string SectionName = "OccupancyApi";

    /// <summary>A bus that has not reported for this long is shown as stale (not live).</summary>
    public int StaleAfterSeconds { get; set; } = 60;

    /// <summary>How long occupancy history is kept in memory for the history endpoint.</summary>
    public int HistoryRetentionHours { get; set; } = 24;

    /// <summary>Most door events kept per bus; older ones are dropped.</summary>
    public int MaxEventsPerVehicle { get; set; } = 2000;

    /// <summary>
    /// Upper bounds (percent of capacity, exclusive) for each occupancy level. Only total capacity is
    /// known, so these approximate seated vs standing space; tune them per fleet.
    /// </summary>
    public OccupancyThresholds Thresholds { get; set; } = new();
}

public sealed class OccupancyThresholds
{
    public int ManySeatsAvailableBelow { get; set; } = 50;

    public int FewSeatsAvailableBelow { get; set; } = 80;

    public int StandingRoomOnlyBelow { get; set; } = 95;

    public int CrushedStandingRoomOnlyBelow { get; set; } = 100;
}

public sealed class IngestionOptions
{
    public const string SectionName = "Ingestion";

    /// <summary>
    /// Per-bus device keys (vehicle id → key) checked on the X-Device-Key header. When empty,
    /// observations are accepted without a key, which is only meant for local development.
    /// </summary>
    public Dictionary<string, string> DeviceKeys { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class FleetOptions
{
    public const string SectionName = "Fleet";

    /// <summary>Registered buses and their capacity; raw data from unregistered buses is rejected.</summary>
    public string RegistryFile { get; set; } = "MockData/coronado-fleet.json";
}

public sealed class MockFleetOptions
{
    public const string SectionName = "MockFleet";

    /// <summary>Simulates a few buses so client apps can be built before real devices report.</summary>
    public bool Enabled { get; set; }

    public int IntervalSeconds { get; set; } = 5;

    /// <summary>Fleet and corridor definitions for the simulation, relative to the content root.</summary>
    public string FleetFile { get; set; } = "MockData/coronado-fleet.json";

    /// <summary>Minutes simulated at startup so buses already carry realistic loads and history.</summary>
    public int WarmUpMinutes { get; set; } = 60;

    /// <summary>
    /// Costa Rica time of day (e.g. "05:00") from which the startup replay simulates today, so a
    /// restarted API still has the whole day for GET /fleet/hourly. The per-bus history and events
    /// endpoints still start at <see cref="WarmUpMinutes"/>. A startup before this time replays the
    /// previous service day instead. Empty, or an override hour, replay only the warm-up.
    /// </summary>
    public string? BackfillFrom { get; set; }

    /// <summary>
    /// Costa Rica time of day (e.g. "07:30") whose demand the fleet follows regardless of the clock,
    /// to show rush hour at any time. Empty follows the real clock.
    /// </summary>
    public string? TimeOfDayOverride { get; set; }
}
