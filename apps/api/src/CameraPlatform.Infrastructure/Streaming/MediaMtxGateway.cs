using System.Net;
using System.Net.Http.Json;
using CameraPlatform.Application.Abstractions;

namespace CameraPlatform.Infrastructure.Streaming;

public sealed class MediaMtxOptions
{
    public const string Section = "MediaMtx";

    public Uri? ApiUrl { get; set; }
    public string ApiUser { get; set; } = "platform";
    public string ApiPassword { get; set; } = "";
}

/// <summary>
/// Cliente de la API de control de MediaMTX (v3). Cada cámara ocupa dos paths: <c>streamKey</c>, con el
/// video tal como llega (lo lee la visión), y <c>streamKey_web</c>, apto para WebRTC (lo lee el navegador),
/// que publica <c>web-stream.sh</c> mientras la cámara está en línea. El guion bajo no es válido en un
/// stream key, así que el path web nunca choca con otra cámara.
/// </summary>
public sealed class MediaMtxGateway(HttpClient http) : IStreamingGateway
{
    private const string Publisher = "publisher";
    private const string WebSuffix = "_web";

    private static string WebPath(string streamKey) => streamKey + WebSuffix;

    public async Task<IReadOnlyDictionary<string, string?>> ListPathsAsync(CancellationToken ct)
    {
        var list = await http.GetFromJsonAsync<PathConfList>("v3/config/paths/list?itemsPerPage=1000", ct);
        return list!.Items
            .Where(p => !p.Name.EndsWith(WebSuffix, StringComparison.Ordinal))
            .ToDictionary(p => p.Name, p => p.Source == Publisher ? null : p.Source);
    }

    public async Task UpsertPathAsync(string streamKey, string? sourceUrl, CancellationToken ct)
    {
        // Primero el destino, para que exista cuando la cámara entre en línea y arranque web-stream.sh.
        await PutPathAsync(WebPath(streamKey), new { source = Publisher }, ct);

        var runOnAvailable = $"sh /web-stream.sh {streamKey} {WebPath(streamKey)}";
        object conf = sourceUrl is null
            ? new { source = Publisher, runOnAvailable, runOnAvailableRestart = true }
            // TCP evita pérdidas y problemas de NAT; conexión permanente para detectar caídas y reconectar solo.
            : new { source = sourceUrl, rtspTransport = "tcp", sourceOnDemand = false, runOnAvailable, runOnAvailableRestart = true };
        await PutPathAsync(streamKey, conf, ct);
    }

    public async Task DeletePathAsync(string streamKey, CancellationToken ct)
    {
        await DeleteConfAsync(streamKey, ct);
        await DeleteConfAsync(WebPath(streamKey), ct);
    }

    public async Task<StreamStatus?> GetStatusAsync(string streamKey, CancellationToken ct)
    {
        var camera = await GetRuntimeAsync(streamKey, ct);
        return camera is null ? null : ToStatus(camera, await GetRuntimeAsync(WebPath(streamKey), ct));
    }

    public async Task<IReadOnlyDictionary<string, StreamStatus>> ListStatusesAsync(CancellationToken ct)
    {
        var list = await http.GetFromJsonAsync<PathRuntimeList>("v3/paths/list?itemsPerPage=1000", ct);
        var byName = list!.Items.ToDictionary(p => p.Name);
        return byName.Values
            .Where(p => !p.Name.EndsWith(WebSuffix, StringComparison.Ordinal))
            .ToDictionary(p => p.Name, p => ToStatus(p, byName.GetValueOrDefault(WebPath(p.Name))));
    }

    private async Task PutPathAsync(string name, object conf, CancellationToken ct)
    {
        using var added = await http.PostAsJsonAsync($"v3/config/paths/add/{Uri.EscapeDataString(name)}", conf, ct);
        if (added.StatusCode == HttpStatusCode.BadRequest && (await ErrorOf(added, ct)).Contains("already exists"))
        {
            using var replaced =
                await http.PostAsJsonAsync($"v3/config/paths/replace/{Uri.EscapeDataString(name)}", conf, ct);
            await EnsureSuccess(replaced, ct);
            return;
        }
        await EnsureSuccess(added, ct);
    }

    private async Task DeleteConfAsync(string name, CancellationToken ct)
    {
        using var res = await http.DeleteAsync($"v3/config/paths/delete/{Uri.EscapeDataString(name)}", ct);
        if (res.StatusCode == HttpStatusCode.NotFound) return;
        await EnsureSuccess(res, ct);
    }

    private async Task<PathRuntime?> GetRuntimeAsync(string name, CancellationToken ct)
    {
        using var res = await http.GetAsync($"v3/paths/get/{Uri.EscapeDataString(name)}", ct);
        if (res.StatusCode == HttpStatusCode.NotFound) return null;
        await EnsureSuccess(res, ct);
        return await res.Content.ReadFromJsonAsync<PathRuntime>(ct);
    }

    /// <summary>Video y tráfico del path de la cámara; espectadores, los del path web (los navegadores).</summary>
    private static StreamStatus ToStatus(PathRuntime camera, PathRuntime? web)
    {
        var video = camera.Tracks2?.FirstOrDefault(t => t.CodecProps?.Width is not null);
        return new StreamStatus(
            camera.Available,
            camera.Available ? camera.AvailableTime : null,
            video?.Codec,
            video?.CodecProps?.Width,
            video?.CodecProps?.Height,
            web?.Readers?.Count ?? 0,
            camera.BytesReceived);
    }

    private static async Task EnsureSuccess(HttpResponseMessage res, CancellationToken ct)
    {
        if (res.IsSuccessStatusCode) return;
        throw new HttpRequestException(
            $"MediaMTX respondió {(int)res.StatusCode}: {await ErrorOf(res, ct)}", null, res.StatusCode);
    }

    private static async Task<string> ErrorOf(HttpResponseMessage res, CancellationToken ct)
    {
        try
        {
            return (await res.Content.ReadFromJsonAsync<ApiError>(ct))?.Error ?? "";
        }
        catch (System.Text.Json.JsonException)
        {
            return "";
        }
    }

    private sealed record PathConfList(List<PathConfItem> Items);

    private sealed record PathConfItem(string Name, string Source);

    private sealed record PathRuntimeList(List<PathRuntime> Items);

    private sealed record PathRuntime(
        string Name,
        bool Available,
        DateTimeOffset? AvailableTime,
        List<Track>? Tracks2,
        List<object>? Readers,
        long BytesReceived);

    private sealed record Track(string Codec, CodecProps? CodecProps);

    private sealed record CodecProps(int? Width, int? Height);

    private sealed record ApiError(string? Error);
}
