using CameraPlatform.Application.Abstractions;
using CameraPlatform.Application.Detections;
using CameraPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace CameraPlatform.Tests;

internal static class TestDb
{
    public static AppDbContext Create() =>
        new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options,
            new EphemeralDataProtectionProvider());
}

internal sealed class FakeGateway : IStreamingGateway
{
    public Dictionary<string, string?> Paths { get; } = new();
    public bool Fail { get; set; }
    public StreamStatus? Status { get; set; }

    public Task<IReadOnlyDictionary<string, string?>> ListPathsAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<string, string?>>(new Dictionary<string, string?>(Paths));

    public Task UpsertPathAsync(string streamKey, string? sourceUrl, CancellationToken ct)
    {
        if (Fail) throw new HttpRequestException("gateway caído");
        Paths[streamKey] = sourceUrl;
        return Task.CompletedTask;
    }

    public Task DeletePathAsync(string streamKey, CancellationToken ct)
    {
        if (Fail) throw new HttpRequestException("gateway caído");
        Paths.Remove(streamKey);
        return Task.CompletedTask;
    }

    public Task<StreamStatus?> GetStatusAsync(string streamKey, CancellationToken ct) =>
        Task.FromResult(Paths.ContainsKey(streamKey) ? Status : null);

    public Task<IReadOnlyDictionary<string, StreamStatus>> ListStatusesAsync(CancellationToken ct) =>
        Task.FromResult<IReadOnlyDictionary<string, StreamStatus>>(
            Status is null ? new() : Paths.Keys.ToDictionary(k => k, _ => Status));
}

internal sealed class FakeNotifier : IRealtimeNotifier
{
    public List<(Guid CameraId, DetectionFrame Frame)> Frames { get; } = [];
    public List<DetectionEventDto> Started { get; } = [];

    public Task DetectionsAsync(Guid cameraId, DetectionFrame frame, CancellationToken ct)
    {
        Frames.Add((cameraId, frame));
        return Task.CompletedTask;
    }

    public Task EventStartedAsync(DetectionEventDto detectionEvent, CancellationToken ct)
    {
        Started.Add(detectionEvent);
        return Task.CompletedTask;
    }
}
