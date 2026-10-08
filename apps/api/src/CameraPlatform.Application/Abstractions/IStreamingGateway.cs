namespace CameraPlatform.Application.Abstractions;

/// <summary>
/// Gateway de video (MediaMTX). Cada cámara es un path identificado por su stream key.
/// <c>sourceUrl</c> null significa que el path recibe video publicado (push) en lugar de leer RTSP.
/// </summary>
public interface IStreamingGateway
{
    Task<IReadOnlyDictionary<string, string?>> ListPathsAsync(CancellationToken ct);
    Task UpsertPathAsync(string streamKey, string? sourceUrl, CancellationToken ct);
    Task DeletePathAsync(string streamKey, CancellationToken ct);

    /// <summary>Estado en vivo del path, o null si el gateway no lo tiene configurado.</summary>
    Task<StreamStatus?> GetStatusAsync(string streamKey, CancellationToken ct);

    /// <summary>Estado en vivo de todos los paths configurados, por stream key.</summary>
    Task<IReadOnlyDictionary<string, StreamStatus>> ListStatusesAsync(CancellationToken ct);
}

public sealed record StreamStatus(
    bool Online,
    DateTimeOffset? OnlineSince,
    string? Codec,
    int? Width,
    int? Height,
    int Viewers,
    long BytesReceived);
