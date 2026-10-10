using CameraPlatform.Application.Abstractions;
using CameraPlatform.Domain;
using CameraPlatform.Domain.Detections;
using Microsoft.EntityFrameworkCore;

namespace CameraPlatform.Application.Detections;

public sealed class DetectionService(
    IAppDbContext db,
    IRealtimeNotifier notifier,
    AnalysisMonitor analysis,
    TimeProvider clock)
{
    /// <summary>Sin ver a la persona durante este tiempo, la siguiente aparición abre un evento nuevo.</summary>
    public static readonly TimeSpan PresenceGap = TimeSpan.FromSeconds(10);

    public const int MaxEventsPage = 200;
    private const int MaxDetectionsPerFrame = 100;
    private static bool IsPassengerLabel(string label) =>
        label is "person" or "sitting" or "standing";

    /// <summary>Procesa un frame analizado. Devuelve false si la cámara no existe.</summary>
    public async Task<bool> IngestAsync(Guid cameraId, DetectionFrame frame, CancellationToken ct)
    {
        Validate(frame);
        var cameraName = await db.Cameras.Where(c => c.Id == cameraId).Select(c => c.Name).FirstOrDefaultAsync(ct);
        if (cameraName is null) return false;

        analysis.Record(cameraId, frame.InferenceMs);
        await notifier.DetectionsAsync(cameraId, frame, ct);

        var persons = frame.Detections.Where(d => IsPassengerLabel(d.Label)).ToList();
        if (persons.Count == 0) return true;

        // Hora del servidor: el reloj del servicio de visión no define la línea de tiempo de los eventos.
        var now = clock.GetUtcNow();
        var confidence = persons.Max(p => p.Confidence);
        var latest = await db.DetectionEvents
            .Where(e => e.CameraId == cameraId && e.Type == DetectionEvent.PersonDetected)
            .OrderByDescending(e => e.LastSeenAt)
            .FirstOrDefaultAsync(ct);

        if (latest is not null && latest.IsOngoingAt(now, PresenceGap))
        {
            latest.Extend(now, confidence, persons.Count);
            await db.SaveChangesAsync(ct);
            return true;
        }

        var started = DetectionEvent.Start(cameraId, DetectionEvent.PersonDetected, now, confidence, persons.Count);
        db.DetectionEvents.Add(started);
        await db.SaveChangesAsync(ct);
        await notifier.EventStartedAsync(ToDto(started, cameraName), ct);
        return true;
    }

    public async Task<IReadOnlyList<DetectionEventDto>> ListAsync(Guid? cameraId, int limit, CancellationToken ct)
    {
        limit = Math.Clamp(limit, 1, MaxEventsPage);
        var query = from e in db.DetectionEvents.AsNoTracking()
            join c in db.Cameras.AsNoTracking() on e.CameraId equals c.Id
            where cameraId == null || e.CameraId == cameraId
            orderby e.StartedAt descending
            select new { Event = e, CameraName = c.Name };

        var rows = await query.Take(limit).ToListAsync(ct);
        return rows.Select(r => ToDto(r.Event, r.CameraName)).ToList();
    }

    private static void Validate(DetectionFrame frame)
    {
        var errors = new Dictionary<string, string[]>();
        if (frame.Width <= 0 || frame.Height <= 0) errors["size"] = ["Dimensiones del frame inválidas."];
        if (frame.InferenceMs < 0) errors["inferenceMs"] = ["Debe ser positivo."];
        if (frame.Detections is null || frame.Detections.Count > MaxDetectionsPerFrame)
        {
            errors["detections"] = [$"Se esperan entre 0 y {MaxDetectionsPerFrame} detecciones."];
        }
        else if (frame.Detections.Any(d =>
                     string.IsNullOrEmpty(d.Label) || d.Label.Length > 50
                     || d.Confidence is < 0 or > 1
                     || d.Box is not { Length: 4 } || d.Box.Any(v => v is < 0 or > 1)))
        {
            errors["detections"] = ["Cada detección necesita etiqueta, confianza 0–1 y caja normalizada [x1, y1, x2, y2]."];
        }
        ValidationException.ThrowIfAny(errors);
    }

    private static DetectionEventDto ToDto(DetectionEvent e, string cameraName) =>
        new(e.Id, e.CameraId, cameraName, e.Type, e.StartedAt, e.LastSeenAt, e.MaxConfidence, e.MaxCount);
}
