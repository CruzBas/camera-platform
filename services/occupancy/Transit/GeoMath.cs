using Innova.Occupancy.Api.Models;

namespace Innova.Occupancy.Api.Transit;

/// <summary>Flat-earth (equirectangular) geometry: accurate enough over a few kilometers.</summary>
public static class GeoMath
{
    private const double MetersPerDegreeLat = 110_540;
    private const double MetersPerDegreeLonAtEquator = 111_320;

    public static double DistanceMeters(GeoLocation first, GeoLocation second)
    {
        var (dx, dy) = Offset(first, second);
        return Math.Sqrt((dx * dx) + (dy * dy));
    }

    /// <summary>Compass bearing from one point to another, in degrees clockwise from north.</summary>
    public static double BearingDeg(GeoLocation from, GeoLocation to)
    {
        var (east, north) = Offset(from, to);
        return ((Math.Atan2(east, north) * 180 / Math.PI) + 360) % 360;
    }

    /// <summary>The point at <paramref name="fraction"/> (0..1) of the way from one point to another.</summary>
    public static GeoLocation Interpolate(GeoLocation from, GeoLocation to, double fraction) =>
        new(
            Math.Round(from.Lat + ((to.Lat - from.Lat) * fraction), 6),
            Math.Round(from.Lon + ((to.Lon - from.Lon) * fraction), 6));

    /// <summary>How far along the segment (0..1) the closest point to <paramref name="point"/> is.</summary>
    public static double ProjectOntoSegment(GeoLocation point, GeoLocation start, GeoLocation end)
    {
        var (sx, sy) = Offset(start, end);
        var (px, py) = Offset(start, point);
        var lengthSquared = (sx * sx) + (sy * sy);
        return lengthSquared <= 0 ? 0 : Math.Clamp(((px * sx) + (py * sy)) / lengthSquared, 0, 1);
    }

    private static (double East, double North) Offset(GeoLocation from, GeoLocation to)
    {
        var meanLat = (from.Lat + to.Lat) / 2 * Math.PI / 180;
        return (
            (to.Lon - from.Lon) * Math.Cos(meanLat) * MetersPerDegreeLonAtEquator,
            (to.Lat - from.Lat) * MetersPerDegreeLat);
    }
}
