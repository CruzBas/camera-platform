using CameraPlatform.Application.Cameras;

namespace CameraPlatform.Api.Hosting;

/// <summary>Reconcilia periódicamente las cámaras registradas con el gateway de streaming.</summary>
public sealed class StreamingSyncWorker(IServiceScopeFactory scopes, ILogger<StreamingSyncWorker> logger)
    : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromSeconds(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<StreamingReconciler>().ReconcileAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("No se pudo sincronizar con el gateway de streaming: {Error}", ex.Message);
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}
