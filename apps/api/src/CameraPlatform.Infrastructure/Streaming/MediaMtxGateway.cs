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

/// <summary>Cliente de la API de control de MediaMTX (v3).</summary>
public sealed class MediaMtxGateway(HttpClient http) : IStreamingGateway
{
    private const string Publisher = "publisher";

    public async Task<IReadOnlyDictionary<string, string?>> ListPathsAsync(CancellationToken ct)
    {
        var list = await http.GetFromJsonAsync<PathConfList>("v3/config/paths/list?itemsPerPage=1000", ct);
        return list!.Items.ToDictionary(p => p.Name, p => p.Source == Publisher ? null : p.Source);
    }

    public async Task UpsertPathAsync(string streamKey, string? sourceUrl, CancellationToken ct)
    {
        object conf = sourceUrl is null
            ? new { source = Publisher }
            // TCP evita pérdidas y problemas de NAT; conexión permanente para detectar caídas y reconectar solo.
            : new { source = sourceUrl, rtspTransport = "tcp", sourceOnDemand = false };

        using var added = await http.PostAsJsonAsync($"v3/config/paths/add/{Uri.EscapeDataString(streamKey)}", conf, ct);
        if (added.StatusCode == HttpStatusCode.BadRequest && (await ErrorOf(added, ct)).Contains("already exists"))
        {
            using var replaced =
                await http.PostAsJsonAsync($"v3/config/paths/replace/{Uri.EscapeDataString(streamKey)}", conf, ct);
            await EnsureSuccess(replaced, ct);
            return;
        }
        await EnsureSuccess(added, ct);
    }

    public async Task DeletePathAsync(string streamKey, CancellationToken ct)
    {
        using var res = await http.DeleteAsync($"v3/config/paths/delete/{Uri.EscapeDataString(streamKey)}", ct);
        if (res.StatusCode == HttpStatusCode.NotFound) return;
        await EnsureSuccess(res, ct);
    }

    public async Task<StreamStatus?> GetStatusAsync(string streamKey, CancellationToken ct)
    {
        using var res = await http.GetAsync($"v3/paths/get/{Uri.EscapeDataString(streamKey)}", ct);
        if (res.StatusCode == HttpStatusCode.NotFound) return null;
        await EnsureSuccess(res, ct);

        return ToStatus((await res.Content.ReadFromJsonAsync<PathRuntime>(ct))!);
    }

    public async Task<IReadOnlyDictionary<string, StreamStatus>> ListStatusesAsync(CancellationToken ct)
    {
        var list = await http.GetFromJsonAsync<PathRuntimeList>("v3/paths/list?itemsPerPage=1000", ct);
        return list!.Items.ToDictionary(p => p.Name, ToStatus);
    }

    private static StreamStatus ToStatus(PathRuntime path)
    {
        var video = path.Tracks2?.FirstOrDefault(t => t.CodecProps?.Width is not null);
        return new StreamStatus(
            path.Available,
            path.Available ? path.AvailableTime : null,
            video?.Codec,
            video?.CodecProps?.Width,
            video?.CodecProps?.Height,
            path.Readers?.Count ?? 0,
            path.BytesReceived);
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
