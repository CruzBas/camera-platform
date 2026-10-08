using CameraPlatform.Application.Abstractions;
using CameraPlatform.Application.Detections;
using CameraPlatform.Domain;
using CameraPlatform.Domain.Cameras;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CameraPlatform.Application.Cameras;

public sealed class CameraService(
    IAppDbContext db,
    IStreamingGateway gateway,
    AnalysisMonitor analysis,
    TimeProvider clock,
    ILogger<CameraService> logger)
{
    public async Task<IReadOnlyList<CameraDto>> ListAsync(CancellationToken ct)
    {
        var cameras = await db.Cameras.AsNoTracking().OrderBy(c => c.Name).ToListAsync(ct);
        return cameras.Select(ToDto).ToList();
    }

    public async Task<CameraDto?> GetAsync(Guid id, CancellationToken ct)
    {
        var camera = await db.Cameras.AsNoTracking().FirstOrDefaultAsync(c => c.Id == id, ct);
        return camera is null ? null : ToDto(camera);
    }

    public async Task<CameraDto> CreateAsync(CreateCameraRequest request, CancellationToken ct)
    {
        var camera = Camera.Create(request.Name, request.StreamKey, SourceUrlFor(request.SourceType, request.SourceUrl, null),
            clock.GetUtcNow(), request.Route, request.Capacity);
        if (await db.Cameras.AnyAsync(c => c.StreamKey == camera.StreamKey, ct))
        {
            throw new ValidationException("streamKey", "Ya existe una cámara con esa clave de stream.");
        }

        db.Cameras.Add(camera);
        await db.SaveChangesAsync(ct);
        await SyncAsync(camera.StreamKey, () => gateway.UpsertPathAsync(camera.StreamKey, camera.SourceUrl, ct));
        return ToDto(camera);
    }

    public async Task<CameraDto?> UpdateAsync(Guid id, UpdateCameraRequest request, CancellationToken ct)
    {
        var camera = await db.Cameras.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (camera is null) return null;

        camera.Update(request.Name, SourceUrlFor(request.SourceType, request.SourceUrl, camera.SourceUrl),
            request.Route, request.Capacity);
        await db.SaveChangesAsync(ct);
        await SyncAsync(camera.StreamKey, () => gateway.UpsertPathAsync(camera.StreamKey, camera.SourceUrl, ct));
        return ToDto(camera);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var camera = await db.Cameras.FirstOrDefaultAsync(c => c.Id == id, ct);
        if (camera is null) return false;

        db.Cameras.Remove(camera);
        await db.SaveChangesAsync(ct);
        await SyncAsync(camera.StreamKey, () => gateway.DeletePathAsync(camera.StreamKey, ct));
        analysis.Forget(id);
        return true;
    }

    public async Task<CameraStatusDto?> GetStatusAsync(Guid id, CancellationToken ct)
    {
        var streamKey = await db.Cameras.Where(c => c.Id == id).Select(c => c.StreamKey).FirstOrDefaultAsync(ct);
        if (streamKey is null) return null;

        var stream = await gateway.GetStatusAsync(streamKey, ct);
        return new CameraStatusDto(ToStreamDto(stream), analysis.GetStatus(id));
    }

    /// <summary>Estado de todas las cámaras con una sola consulta al gateway (vista de flota).</summary>
    public async Task<IReadOnlyList<CameraStatusSummaryDto>> GetFleetStatusAsync(CancellationToken ct)
    {
        var cameras = await db.Cameras.AsNoTracking().Select(c => new { c.Id, c.StreamKey }).ToListAsync(ct);
        var streams = await gateway.ListStatusesAsync(ct);
        return cameras
            .Select(c => new CameraStatusSummaryDto(c.Id, ToStreamDto(streams.GetValueOrDefault(c.StreamKey)),
                analysis.GetStatus(c.Id)))
            .ToList();
    }

    private static StreamStatusDto ToStreamDto(StreamStatus? stream) =>
        stream is null
            ? new StreamStatusDto(false, false, null, null, null, null, 0)
            : new StreamStatusDto(true, stream.Online, stream.OnlineSince, stream.Codec, stream.Width, stream.Height,
                stream.Viewers);

    /// <summary>
    /// Traduce el tipo de fuente a la URL que se guarda. En RTSP sin URL nueva se conserva la actual,
    /// para que editar el nombre no obligue a reescribir la contraseña.
    /// </summary>
    private static string? SourceUrlFor(string sourceType, string? sourceUrl, string? currentUrl) =>
        sourceType switch
        {
            SourceTypes.Push => null,
            SourceTypes.Rtsp when !string.IsNullOrWhiteSpace(sourceUrl) => sourceUrl,
            SourceTypes.Rtsp when currentUrl is not null => currentUrl,
            SourceTypes.Rtsp => throw new ValidationException("sourceUrl", "La URL RTSP es obligatoria."),
            _ => throw new ValidationException("sourceType", $"Usa '{SourceTypes.Rtsp}' o '{SourceTypes.Push}'."),
        };

    /// <summary>
    /// La base de datos es la fuente de verdad: si el gateway no responde, el cambio queda guardado
    /// y <see cref="StreamingReconciler"/> lo aplica en la siguiente pasada.
    /// </summary>
    private async Task SyncAsync(string streamKey, Func<Task> apply)
    {
        try
        {
            await apply();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "No se pudo sincronizar el stream {StreamKey} con el gateway; se reintentará", streamKey);
        }
    }

    private static CameraDto ToDto(Camera c) =>
        new(c.Id, c.Name, c.StreamKey,
            c.SourceUrl is null ? SourceTypes.Push : SourceTypes.Rtsp,
            c.SourceUrl is null ? null : SourceUrls.Mask(c.SourceUrl),
            c.Route,
            c.Capacity,
            c.CreatedAt);
}
