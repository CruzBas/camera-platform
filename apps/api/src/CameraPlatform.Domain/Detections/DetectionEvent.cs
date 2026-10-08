namespace CameraPlatform.Domain.Detections;

/// <summary>
/// Episodio de detección: empieza cuando aparece el objeto y se extiende mientras siga visible.
/// Una persona frente a la cámara durante 5 minutos es un solo evento, no cientos.
/// </summary>
public sealed class DetectionEvent
{
    public const string PersonDetected = "person_detected";

    private DetectionEvent()
    {
    }

    public Guid Id { get; private set; }
    public Guid CameraId { get; private set; }
    public string Type { get; private set; } = "";
    public DateTimeOffset StartedAt { get; private set; }
    public DateTimeOffset LastSeenAt { get; private set; }
    public float MaxConfidence { get; private set; }
    public int MaxCount { get; private set; }

    public static DetectionEvent Start(Guid cameraId, string type, DateTimeOffset at, float confidence, int count) =>
        new()
        {
            Id = Guid.CreateVersion7(),
            CameraId = cameraId,
            Type = type,
            StartedAt = at,
            LastSeenAt = at,
            MaxConfidence = confidence,
            MaxCount = count,
        };

    /// <summary>Sigue abierto si la última detección fue hace como mucho <paramref name="gap"/>.</summary>
    public bool IsOngoingAt(DateTimeOffset at, TimeSpan gap) => at - LastSeenAt <= gap;

    public void Extend(DateTimeOffset at, float confidence, int count)
    {
        if (at > LastSeenAt) LastSeenAt = at;
        MaxConfidence = Math.Max(MaxConfidence, confidence);
        MaxCount = Math.Max(MaxCount, count);
    }
}
