using CameraPlatform.Application.Cameras;
using CameraPlatform.Domain;
using CameraPlatform.Domain.Cameras;
using CameraPlatform.Domain.Detections;

namespace CameraPlatform.Tests;

public class DomainTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 7, 19, 30, 0, TimeSpan.Zero);

    [Fact]
    public void Camera_accepts_rtsp_and_push_sources()
    {
        var rtsp = Camera.Create(" TENVIS ", "tenvis", " rtsp://admin:pw@192.168.1.50:554/11 ", T0);
        Assert.Equal("TENVIS", rtsp.Name);
        Assert.Equal("rtsp://admin:pw@192.168.1.50:554/11", rtsp.SourceUrl);

        var push = Camera.Create("Mac", "mac", null, T0);
        Assert.Null(push.SourceUrl);
    }

    [Theory]
    [InlineData("", "tenvis", null, "name")]
    [InlineData("TENVIS", "Con Mayúsculas", null, "streamKey")]
    [InlineData("TENVIS", "-tenvis", null, "streamKey")]
    [InlineData("TENVIS", "tenvis", "http://192.168.1.50/11", "sourceUrl")]
    [InlineData("TENVIS", "tenvis", "no es una url", "sourceUrl")]
    public void Camera_rejects_invalid_input(string name, string streamKey, string? sourceUrl, string field)
    {
        var ex = Assert.Throws<ValidationException>(() => Camera.Create(name, streamKey, sourceUrl, T0));
        Assert.Contains(field, ex.Errors.Keys);
    }

    [Fact]
    public void Camera_stores_trimmed_route_and_capacity_and_rejects_invalid_values()
    {
        var bus = Camera.Create("Unidad 101", "bus-101", null, T0, "  San José – Guadalupe ", 40);
        Assert.Equal("San José – Guadalupe", bus.Route);
        Assert.Equal(40, bus.Capacity);

        bus.Update("Unidad 101", null, " ", null);
        Assert.Null(bus.Route);
        Assert.Null(bus.Capacity);

        var ex = Assert.Throws<ValidationException>(() =>
            Camera.Create("Unidad 101", "bus-101", null, T0, new string('x', Camera.RouteMaxLength + 1), 0));
        Assert.Contains("route", ex.Errors.Keys);
        Assert.Contains("capacity", ex.Errors.Keys);
    }

    [Fact]
    public void Detection_event_stays_open_within_gap_and_tracks_maximums()
    {
        var e = DetectionEvent.Start(Guid.NewGuid(), DetectionEvent.PersonDetected, T0, 0.6f, 1);
        var gap = TimeSpan.FromSeconds(10);

        Assert.True(e.IsOngoingAt(T0.AddSeconds(10), gap));
        e.Extend(T0.AddSeconds(5), 0.9f, 2);
        e.Extend(T0.AddSeconds(8), 0.7f, 1);

        Assert.Equal(T0.AddSeconds(8), e.LastSeenAt);
        Assert.Equal(0.9f, e.MaxConfidence);
        Assert.Equal(2, e.MaxCount);
        Assert.True(e.IsOngoingAt(T0.AddSeconds(18), gap));
        Assert.False(e.IsOngoingAt(T0.AddSeconds(19), gap));
    }

    [Theory]
    [InlineData("rtsp://admin:secreto@10.0.0.5:554/11", "rtsp://admin:***@10.0.0.5:554/11")]
    [InlineData("rtsp://10.0.0.5:554/11", "rtsp://10.0.0.5:554/11")]
    [InlineData("rtsp://admin:p%40ss@10.0.0.5/live/ch0", "rtsp://admin:***@10.0.0.5/live/ch0")]
    public void Source_url_mask_hides_password(string url, string expected) =>
        Assert.Equal(expected, SourceUrls.Mask(url));
}
