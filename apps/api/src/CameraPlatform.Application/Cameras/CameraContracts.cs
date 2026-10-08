namespace CameraPlatform.Application.Cameras;

public static class SourceTypes
{
    /// <summary>El gateway se conecta a la cámara por RTSP (TENVIS y cámaras IP).</summary>
    public const string Rtsp = "rtsp";

    /// <summary>Un proceso publica el video en el gateway (webcam de la Mac, pruebas).</summary>
    public const string Push = "push";
}

public sealed record CameraDto(
    Guid Id,
    string Name,
    string StreamKey,
    string SourceType,
    string? SourceUrlMasked,
    string? Route,
    int? Capacity,
    DateTimeOffset CreatedAt);

public sealed record CreateCameraRequest(
    string Name,
    string StreamKey,
    string SourceType,
    string? SourceUrl,
    string? Route = null,
    int? Capacity = null);

/// <summary>Si la fuente sigue siendo RTSP y <see cref="SourceUrl"/> viene vacío, se conserva la URL guardada.</summary>
public sealed record UpdateCameraRequest(
    string Name,
    string SourceType,
    string? SourceUrl,
    string? Route = null,
    int? Capacity = null);

public sealed record CameraStatusDto(StreamStatusDto Stream, AnalysisStatusDto Analysis);

public sealed record CameraStatusSummaryDto(Guid CameraId, StreamStatusDto Stream, AnalysisStatusDto Analysis);

public sealed record StreamStatusDto(
    bool Configured,
    bool Online,
    DateTimeOffset? OnlineSince,
    string? Codec,
    int? Width,
    int? Height,
    int Viewers);

public sealed record AnalysisStatusDto(bool Active, DateTimeOffset? LastFrameAt, double? Fps, double? InferenceMs);
