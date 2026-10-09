namespace Innova.Occupancy.Api.Ingestion;

/// <summary>How many people one camera saw in a message window.</summary>
public sealed record VisionReading(DateTimeOffset At, int People, int Sitting, int Standing)
{
    /// <summary>
    /// Uses the median frame: single frames flicker (a person hidden for a moment, a false box),
    /// while the median over a few seconds is stable.
    /// </summary>
    public static VisionReading? From(RawVision? vision)
    {
        if (vision is not { Frames.Count: > 0 })
        {
            return null;
        }

        var ordered = vision.Frames.OrderBy(frame => frame.Detections.Count).ToArray();
        var median = ordered[ordered.Length / 2];
        return new VisionReading(
            vision.Frames.Max(frame => frame.At),
            median.Detections.Count,
            median.Detections.Count(detection => detection.Class.Equals("sitting", StringComparison.OrdinalIgnoreCase)),
            median.Detections.Count(detection => detection.Class.Equals("standing", StringComparison.OrdinalIgnoreCase)));
    }
}
