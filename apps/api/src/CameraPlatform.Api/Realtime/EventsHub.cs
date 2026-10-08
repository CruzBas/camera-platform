using CameraPlatform.Application.Abstractions;
using CameraPlatform.Application.Detections;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace CameraPlatform.Api.Realtime;

/// <summary>
/// Canal en tiempo real del dashboard.
/// Mensajes del servidor: <c>eventStarted(event)</c> a todos los usuarios y
/// <c>detections(cameraId, frame)</c> solo a quienes observan esa cámara (<see cref="WatchCamera"/>).
/// </summary>
[Authorize]
public sealed class EventsHub : Hub
{
    public Task WatchCamera(Guid cameraId) => Groups.AddToGroupAsync(Context.ConnectionId, CameraGroup(cameraId));

    public Task UnwatchCamera(Guid cameraId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, CameraGroup(cameraId));

    public static string CameraGroup(Guid cameraId) => $"camera:{cameraId}";
}

public sealed class SignalRNotifier(IHubContext<EventsHub> hub) : IRealtimeNotifier
{
    public Task DetectionsAsync(Guid cameraId, DetectionFrame frame, CancellationToken ct) =>
        hub.Clients.Group(EventsHub.CameraGroup(cameraId)).SendAsync("detections", cameraId, frame, ct);

    public Task EventStartedAsync(DetectionEventDto detectionEvent, CancellationToken ct) =>
        hub.Clients.All.SendAsync("eventStarted", detectionEvent, ct);
}
