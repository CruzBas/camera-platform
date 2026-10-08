using System.Collections.Concurrent;
using CameraPlatform.Application.Cameras;

namespace CameraPlatform.Application.Detections;

/// <summary>
/// Estado en memoria del análisis por cámara (ritmo de frames analizados, tiempo de inferencia).
/// Es información operativa y efímera: no se persiste.
/// </summary>
public sealed class AnalysisMonitor(TimeProvider clock)
{
    private static readonly TimeSpan InactiveAfter = TimeSpan.FromSeconds(5);
    private const double Smoothing = 0.2;

    private readonly ConcurrentDictionary<Guid, Sample> _samples = new();

    public void Record(Guid cameraId, double inferenceMs)
    {
        var now = clock.GetUtcNow();
        _samples.AddOrUpdate(cameraId,
            _ => new Sample(now, null, inferenceMs),
            (_, prev) =>
            {
                var interval = (now - prev.LastFrameAt).TotalSeconds;
                double? fps = interval > 0 ? 1 / interval : prev.Fps;
                return new Sample(now, Smooth(prev.Fps, fps), Smooth(prev.InferenceMs, inferenceMs)!.Value);
            });
    }

    public AnalysisStatusDto GetStatus(Guid cameraId)
    {
        if (!_samples.TryGetValue(cameraId, out var s)) return new AnalysisStatusDto(false, null, null, null);
        var active = clock.GetUtcNow() - s.LastFrameAt <= InactiveAfter;
        return new AnalysisStatusDto(active, s.LastFrameAt, active ? s.Fps : null, active ? s.InferenceMs : null);
    }

    public void Forget(Guid cameraId) => _samples.TryRemove(cameraId, out _);

    private static double? Smooth(double? previous, double? current) =>
        previous is null || current is null ? current ?? previous : previous + Smoothing * (current - previous);

    private sealed record Sample(DateTimeOffset LastFrameAt, double? Fps, double InferenceMs);
}
