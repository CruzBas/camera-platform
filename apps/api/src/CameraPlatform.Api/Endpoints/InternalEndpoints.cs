using System.Security.Cryptography;
using System.Text;
using CameraPlatform.Application.Abstractions;
using CameraPlatform.Application.Detections;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CameraPlatform.Api.Endpoints;

public sealed class VisionOptions
{
    public const string Section = "Vision";

    public string ApiKey { get; set; } = "";
}

/// <summary>Endpoints servicio a servicio para el servicio de visión, protegidos con una clave compartida.</summary>
public static class InternalEndpoints
{
    private const string ApiKeyHeader = "X-Api-Key";

    public sealed record VisionCameraDto(Guid Id, string StreamKey);

    public static void MapInternalEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/internal").AddEndpointFilter(RequireApiKey);

        group.MapGet("/cameras", async (IAppDbContext db, CancellationToken ct) =>
            await db.Cameras.AsNoTracking()
                .OrderBy(c => c.StreamKey)
                .Select(c => new VisionCameraDto(c.Id, c.StreamKey))
                .ToListAsync(ct));

        group.MapPost("/cameras/{id:guid}/detections",
            async (Guid id, DetectionFrame frame, DetectionService detections, CancellationToken ct) =>
                await detections.IngestAsync(id, frame, ct) ? Results.NoContent() : Results.NotFound());
    }

    private static async ValueTask<object?> RequireApiKey(EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        var expected = http.RequestServices.GetRequiredService<IOptions<VisionOptions>>().Value.ApiKey;
        var provided = http.Request.Headers[ApiKeyHeader].ToString();
        var valid = CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(provided),
            Encoding.UTF8.GetBytes(expected));
        return valid ? await next(context) : Results.Unauthorized();
    }
}
