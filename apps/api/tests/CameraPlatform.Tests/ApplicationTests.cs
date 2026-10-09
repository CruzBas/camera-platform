using CameraPlatform.Application.Cameras;
using CameraPlatform.Application.Detections;
using CameraPlatform.Domain;
using CameraPlatform.Domain.Cameras;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Time.Testing;

namespace CameraPlatform.Tests;

public class CameraServiceTests
{
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 7, 19, 30, 0, TimeSpan.Zero));
    private readonly FakeGateway _gateway = new();

    private CameraService Service(Infrastructure.Persistence.AppDbContext db) =>
        new(db, _gateway, new AnalysisMonitor(_clock), _clock, NullLogger<CameraService>.Instance);

    [Fact]
    public async Task Create_persists_camera_configures_gateway_and_masks_credentials()
    {
        using var db = TestDb.Create();
        var dto = await Service(db).CreateAsync(
            new CreateCameraRequest("TENVIS", "tenvis", SourceTypes.Rtsp, "rtsp://admin:pw@192.168.1.50:554/11"), default);

        Assert.Equal("rtsp://admin:***@192.168.1.50:554/11", dto.SourceUrlMasked);
        Assert.Equal("rtsp://admin:pw@192.168.1.50:554/11", _gateway.Paths["tenvis"]);
        Assert.Equal(1, await db.Cameras.CountAsync());
    }

    [Fact]
    public async Task Create_succeeds_when_gateway_is_down()
    {
        using var db = TestDb.Create();
        _gateway.Fail = true;

        await Service(db).CreateAsync(new CreateCameraRequest("Mac", "mac", SourceTypes.Push, null), default);

        Assert.Equal(1, await db.Cameras.CountAsync());
    }

    [Fact]
    public async Task Create_rejects_duplicate_stream_key_and_missing_rtsp_url()
    {
        using var db = TestDb.Create();
        var service = Service(db);
        await service.CreateAsync(new CreateCameraRequest("Mac", "mac", SourceTypes.Push, null), default);

        var duplicate = await Assert.ThrowsAsync<ValidationException>(() =>
            service.CreateAsync(new CreateCameraRequest("Otra", "mac", SourceTypes.Push, null), default));
        Assert.Contains("streamKey", duplicate.Errors.Keys);

        var missingUrl = await Assert.ThrowsAsync<ValidationException>(() =>
            service.CreateAsync(new CreateCameraRequest("TENVIS", "tenvis", SourceTypes.Rtsp, " "), default));
        Assert.Contains("sourceUrl", missingUrl.Errors.Keys);
    }

    [Fact]
    public async Task Update_keeps_stored_url_when_none_is_sent_and_can_switch_to_push()
    {
        using var db = TestDb.Create();
        var service = Service(db);
        var created = await service.CreateAsync(
            new CreateCameraRequest("TENVIS", "tenvis", SourceTypes.Rtsp, "rtsp://admin:pw@192.168.1.50/11"), default);

        var renamed = await service.UpdateAsync(created.Id,
            new UpdateCameraRequest("Entrada", SourceTypes.Rtsp, null), default);
        Assert.Equal("Entrada", renamed!.Name);
        Assert.Equal("rtsp://admin:pw@192.168.1.50/11", _gateway.Paths["tenvis"]);

        await service.UpdateAsync(created.Id, new UpdateCameraRequest("Entrada", SourceTypes.Push, null), default);
        Assert.Null(_gateway.Paths["tenvis"]);
    }

    [Fact]
    public async Task Delete_removes_camera_and_gateway_path()
    {
        using var db = TestDb.Create();
        var service = Service(db);
        var created = await service.CreateAsync(new CreateCameraRequest("Mac", "mac", SourceTypes.Push, null), default);

        Assert.True(await service.DeleteAsync(created.Id, default));
        Assert.False(await service.DeleteAsync(created.Id, default));
        Assert.Empty(_gateway.Paths);
    }

    [Fact]
    public async Task Status_reports_unconfigured_stream_when_gateway_lacks_path()
    {
        using var db = TestDb.Create();
        db.Cameras.Add(Camera.Create("Mac", "mac", null, _clock.GetUtcNow()));
        await db.SaveChangesAsync();
        var id = (await db.Cameras.SingleAsync()).Id;

        var status = await Service(db).GetStatusAsync(id, default);

        Assert.False(status!.Stream.Configured);
        Assert.False(status.Analysis.Active);
        Assert.Null(await Service(db).GetStatusAsync(Guid.NewGuid(), default));
    }
}

public class FleetStatusTests
{
    [Fact]
    public async Task Fleet_status_reports_each_camera_with_one_gateway_call()
    {
        using var db = TestDb.Create();
        var clock = new FakeTimeProvider(DateTimeOffset.UtcNow);
        db.Cameras.AddRange(Camera.Create("SJB-16959", "mac", null, clock.GetUtcNow()),
            Camera.Create("SJB-18600", "sjb-18600", null, clock.GetUtcNow()));
        await db.SaveChangesAsync();
        var gateway = new FakeGateway
        {
            Status = new Application.Abstractions.StreamStatus(true, clock.GetUtcNow(), "H264", 1280, 720, 1, 100),
        };
        gateway.Paths["mac"] = null;
        var service = new CameraService(db, gateway, new AnalysisMonitor(clock), clock,
            NullLogger<CameraService>.Instance);

        var fleet = await service.GetFleetStatusAsync(default);

        var byName = fleet.ToDictionary(f => db.Cameras.Single(c => c.Id == f.CameraId).StreamKey);
        Assert.True(byName["mac"].Stream.Online);
        Assert.False(byName["sjb-18600"].Stream.Configured);
    }
}

public class StreamingReconcilerTests
{
    [Fact]
    public async Task Reconcile_adds_missing_fixes_changed_and_removes_orphans()
    {
        using var db = TestDb.Create();
        var now = DateTimeOffset.UtcNow;
        db.Cameras.AddRange(
            Camera.Create("Mac", "mac", null, now),
            Camera.Create("TENVIS", "tenvis", "rtsp://admin:nuevo@192.168.1.50/11", now));
        await db.SaveChangesAsync();

        var gateway = new FakeGateway();
        gateway.Paths["tenvis"] = "rtsp://admin:viejo@192.168.1.50/11";
        gateway.Paths["huerfano"] = null;

        await new StreamingReconciler(db, gateway, NullLogger<StreamingReconciler>.Instance).ReconcileAsync(default);

        Assert.Equal(2, gateway.Paths.Count);
        Assert.Null(gateway.Paths["mac"]);
        Assert.Equal("rtsp://admin:nuevo@192.168.1.50/11", gateway.Paths["tenvis"]);
    }
}

public class DetectionServiceTests
{
    private readonly FakeTimeProvider _clock = new(new DateTimeOffset(2026, 10, 7, 19, 30, 0, TimeSpan.Zero));
    private readonly FakeNotifier _notifier = new();

    private static DetectionFrame Frame(params Detection[] detections) =>
        new(DateTimeOffset.UtcNow, 1280, 720, 42, detections);

    private static Detection Person(float confidence = 0.9f) => new("person", confidence, [0.1f, 0.1f, 0.5f, 0.9f]);

    private async Task<(Infrastructure.Persistence.AppDbContext Db, DetectionService Service, Guid CameraId)> Setup()
    {
        var db = TestDb.Create();
        var camera = Camera.Create("Mac", "mac", null, _clock.GetUtcNow());
        db.Cameras.Add(camera);
        await db.SaveChangesAsync();
        return (db, new DetectionService(db, _notifier, new AnalysisMonitor(_clock), _clock), camera.Id);
    }

    [Fact]
    public async Task Continuous_presence_is_one_event_and_a_gap_starts_another()
    {
        var (db, service, cameraId) = await Setup();
        using var _ = db;

        await service.IngestAsync(cameraId, Frame(Person(0.7f)), default);
        _clock.Advance(TimeSpan.FromSeconds(5));
        await service.IngestAsync(cameraId, Frame(Person(0.95f), Person(0.8f)), default);
        _clock.Advance(TimeSpan.FromSeconds(5));
        await service.IngestAsync(cameraId, Frame(), default);

        var only = Assert.Single(await db.DetectionEvents.ToListAsync());
        Assert.Equal(0.95f, only.MaxConfidence);
        Assert.Equal(2, only.MaxCount);
        Assert.Single(_notifier.Started);
        Assert.Equal("Mac", _notifier.Started[0].CameraName);
        Assert.Equal(3, _notifier.Frames.Count);

        _clock.Advance(DetectionService.PresenceGap);
        await service.IngestAsync(cameraId, Frame(Person()), default);

        Assert.Equal(2, await db.DetectionEvents.CountAsync());
        Assert.Equal(2, _notifier.Started.Count);
    }

    [Fact]
    public async Task Frames_without_people_only_update_overlay()
    {
        var (db, service, cameraId) = await Setup();
        using var _ = db;

        Assert.True(await service.IngestAsync(cameraId, Frame(new Detection("car", 0.9f, [0, 0, 1, 1])), default));

        Assert.Empty(await db.DetectionEvents.ToListAsync());
        Assert.Single(_notifier.Frames);
    }

    [Fact]
    public async Task Passenger_events_accept_sitting_and_standing_labels()
    {
        var (db, service, cameraId) = await Setup();
        using var _ = db;

        await service.IngestAsync(cameraId, Frame(new Detection("sitting", 0.85f, [0, 0, 1, 1])), default);
        _clock.Advance(TimeSpan.FromSeconds(5));
        await service.IngestAsync(cameraId, Frame(new Detection("standing", 0.92f, [0, 0, 1, 1])), default);

        var events = await db.DetectionEvents.ToListAsync();
        var ev = Assert.Single(events);
        Assert.Equal(0.92f, ev.MaxConfidence);
        Assert.Equal(1, ev.MaxCount);
    }

    [Fact]
    public async Task Unknown_camera_and_invalid_frames_are_rejected()
    {
        var (db, service, cameraId) = await Setup();
        using var _ = db;

        Assert.False(await service.IngestAsync(Guid.NewGuid(), Frame(Person()), default));
        await Assert.ThrowsAsync<ValidationException>(() =>
            service.IngestAsync(cameraId, Frame(new Detection("person", 1.5f, [0, 0, 1, 1])), default));
        await Assert.ThrowsAsync<ValidationException>(() =>
            service.IngestAsync(cameraId, Frame(new Detection("person", 0.9f, [0, 0, 2])), default));
        Assert.Empty(_notifier.Frames);
    }

    [Fact]
    public async Task List_returns_newest_first_with_camera_name()
    {
        var (db, service, cameraId) = await Setup();
        using var _ = db;
        await service.IngestAsync(cameraId, Frame(Person()), default);
        _clock.Advance(TimeSpan.FromMinutes(1));
        await service.IngestAsync(cameraId, Frame(Person()), default);

        var events = await service.ListAsync(cameraId, 10, default);

        Assert.Equal(2, events.Count);
        Assert.True(events[0].StartedAt > events[1].StartedAt);
        Assert.All(events, e => Assert.Equal("Mac", e.CameraName));
    }
}
