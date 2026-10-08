using CameraPlatform.Application.Detections;

namespace CameraPlatform.Application.Abstractions;

/// <summary>Empuja novedades al dashboard sin que tenga que consultar.</summary>
public interface IRealtimeNotifier
{
    /// <summary>Detecciones del último frame analizado, para dibujar las cajas sobre el video.</summary>
    Task DetectionsAsync(Guid cameraId, DetectionFrame frame, CancellationToken ct);

    Task EventStartedAsync(DetectionEventDto detectionEvent, CancellationToken ct);
}
