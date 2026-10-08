namespace CameraPlatform.Application.Detections;

/// <summary>Resultado del análisis de un frame, enviado por el servicio de visión.</summary>
public sealed record DetectionFrame(
    DateTimeOffset CapturedAt,
    int Width,
    int Height,
    double InferenceMs,
    IReadOnlyList<Detection> Detections);

/// <param name="Box">[x1, y1, x2, y2] normalizado entre 0 y 1 respecto al frame.</param>
public sealed record Detection(string Label, float Confidence, float[] Box);

public sealed record DetectionEventDto(
    Guid Id,
    Guid CameraId,
    string CameraName,
    string Type,
    DateTimeOffset StartedAt,
    DateTimeOffset LastSeenAt,
    float MaxConfidence,
    int MaxCount);
