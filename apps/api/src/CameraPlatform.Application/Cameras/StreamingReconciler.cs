using CameraPlatform.Application.Abstractions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CameraPlatform.Application.Cameras;

/// <summary>
/// Lleva el gateway al estado de la base de datos: crea los paths que faltan, corrige los que cambiaron
/// y elimina los que ya no corresponden a ninguna cámara. Cubre reinicios de MediaMTX (que no persiste
/// los paths creados por API) y cambios que no se pudieron aplicar en su momento.
/// </summary>
public sealed class StreamingReconciler(IAppDbContext db, IStreamingGateway gateway, ILogger<StreamingReconciler> logger)
{
    public async Task ReconcileAsync(CancellationToken ct)
    {
        var desired = await db.Cameras.AsNoTracking().ToDictionaryAsync(c => c.StreamKey, c => c.SourceUrl, ct);
        var actual = await gateway.ListPathsAsync(ct);

        foreach (var (streamKey, sourceUrl) in desired)
        {
            if (actual.TryGetValue(streamKey, out var actualUrl) && actualUrl == sourceUrl) continue;
            logger.LogInformation("Configurando el stream {StreamKey} en el gateway", streamKey);
            await gateway.UpsertPathAsync(streamKey, sourceUrl, ct);
        }

        foreach (var streamKey in actual.Keys.Where(k => !desired.ContainsKey(k)))
        {
            logger.LogInformation("Eliminando del gateway el stream huérfano {StreamKey}", streamKey);
            await gateway.DeletePathAsync(streamKey, ct);
        }
    }
}
