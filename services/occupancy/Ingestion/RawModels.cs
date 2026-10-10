namespace Innova.Occupancy.Api.Ingestion;

/// <summary>
/// What an OnboardComputerApp sends every few seconds: each part keeps its source's own raw
/// format, and the Occupancy API does all the calculations.
/// </summary>
public sealed record RawVehicleMessage(
    long Sequence,
    DateTimeOffset SentAt,
    RawGps? Gps,
    RawDoorCounter? DoorCounter,
    RawVision? Vision);

/// <summary>GPS receiver output as NMEA 0183 sentences ($GPRMC, $GPGGA…).</summary>
public sealed record RawGps(string Format, IReadOnlyList<string> Sentences);

/// <summary>Door-counter output; <see cref="Format"/> selects the adapter that reads it.</summary>
public sealed record RawDoorCounter(string Format, IReadOnlyList<RawDoorCounterEvent> Events);

/// <summary>An event in the apc-door-events-v1 format: DOOR_OPENED, COUNT or DOOR_CLOSED.</summary>
public sealed record RawDoorCounterEvent(int Door, string Type, DateTimeOffset At, int? In = null, int? Out = null);

/// <summary>Results returned by the vision inference API for one camera; never images.</summary>
public sealed record RawVision(string Model, string Camera, IReadOnlyList<RawVisionFrame> Frames);

public sealed record RawVisionFrame(DateTimeOffset At, IReadOnlyList<RawVisionDetection> Detections);

/// <summary>Box is [x1, y1, x2, y2] in pixels of the camera frame.</summary>
public sealed record RawVisionDetection(int TrackId, string Class, double Score, IReadOnlyList<double> Box);

public sealed record RawMessageAccepted(
    string VehicleId,
    long Sequence,
    bool Duplicate,
    int GpsFixes,
    int GpsSentencesRejected,
    int DoorEventsCompleted,
    int VisionFrames,
    int? PassengerCount);
