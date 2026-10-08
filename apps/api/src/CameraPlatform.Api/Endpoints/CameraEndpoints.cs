using CameraPlatform.Application.Cameras;
using CameraPlatform.Application.Detections;

namespace CameraPlatform.Api.Endpoints;

public static class CameraEndpoints
{
    private const int DefaultEventsLimit = 50;

    public static void MapCameraEndpoints(this IEndpointRouteBuilder app)
    {
        var cameras = app.MapGroup("/api/cameras").RequireAuthorization();

        cameras.MapGet("/", (CameraService service, CancellationToken ct) => service.ListAsync(ct));

        cameras.MapGet("/status", (CameraService service, CancellationToken ct) => service.GetFleetStatusAsync(ct));

        cameras.MapGet("/{id:guid}", async (Guid id, CameraService service, CancellationToken ct) =>
            await service.GetAsync(id, ct) is { } camera ? Results.Ok(camera) : Results.NotFound());

        cameras.MapPost("/", async (CreateCameraRequest request, CameraService service, CancellationToken ct) =>
        {
            var camera = await service.CreateAsync(request, ct);
            return Results.Created($"/api/cameras/{camera.Id}", camera);
        });

        cameras.MapPut("/{id:guid}",
            async (Guid id, UpdateCameraRequest request, CameraService service, CancellationToken ct) =>
                await service.UpdateAsync(id, request, ct) is { } camera ? Results.Ok(camera) : Results.NotFound());

        cameras.MapDelete("/{id:guid}", async (Guid id, CameraService service, CancellationToken ct) =>
            await service.DeleteAsync(id, ct) ? Results.NoContent() : Results.NotFound());

        cameras.MapGet("/{id:guid}/status", async (Guid id, CameraService service, CancellationToken ct) =>
            await service.GetStatusAsync(id, ct) is { } status ? Results.Ok(status) : Results.NotFound());

        cameras.MapGet("/{id:guid}/events",
            async (Guid id, int? limit, CameraService service, DetectionService detections, CancellationToken ct) =>
                await service.GetAsync(id, ct) is null
                    ? Results.NotFound()
                    : Results.Ok(await detections.ListAsync(id, limit ?? DefaultEventsLimit, ct)));
    }

    public static void MapEventEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/events", (int? limit, DetectionService detections, CancellationToken ct) =>
                detections.ListAsync(null, limit ?? DefaultEventsLimit, ct))
            .RequireAuthorization();
    }
}
