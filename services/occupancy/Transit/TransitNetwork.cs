using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Vehicles.Simulation;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Transit;

/// <summary>
/// The Coronado routes from the fleet file, with fixed stops. Both the simulator (where buses stop)
/// and the trip planner (where riders board) use these stops.
/// </summary>
public sealed class TransitNetwork
{
    /// <summary>Stops of different routes this close together allow a transfer (the terminal, mainly).</summary>
    public const double TransferMeters = 150;

    public TransitNetwork(IOptions<FleetOptions> options, IHostEnvironment environment)
        : this(MockFleet.Load(Path.GetFullPath(options.Value.RegistryFile, environment.ContentRootPath)))
    {
    }

    public TransitNetwork(MockFleet fleet)
    {
        Routes = fleet.Routes.Select(TransitRoute.From).ToDictionary(route => route.RouteId, StringComparer.Ordinal);
        Transfers = Routes.Values
            .SelectMany(route => route.Stops)
            .SelectMany(stop => Routes.Values
                .Where(other => other.RouteId != stop.RouteId)
                .SelectMany(other => other.Stops)
                .Where(other => GeoMath.DistanceMeters(stop.Location, other.Location) <= TransferMeters)
                .Select(other => new TransferLink(stop, other, GeoMath.DistanceMeters(stop.Location, other.Location))))
            .ToArray();
    }

    public IReadOnlyDictionary<string, TransitRoute> Routes { get; }

    /// <summary>Pairs of stops on different routes within walking distance for a transfer.</summary>
    public IReadOnlyList<TransferLink> Transfers { get; }
}

public sealed record TransferLink(TransitStop From, TransitStop To, double Meters);

/// <summary>
/// Travel along a route's corridor. Corridors start in San José (trunk) or at the Coronado terminal
/// (feeders), so Inbound, toward point 0, is the morning-peak direction on every route.
/// </summary>
public enum TravelDirection
{
    Inbound,
    Outbound
}

public sealed record TransitStop(string StopId, string RouteId, int Index, string Name, double Meters, GeoLocation Location);

public sealed class TransitRoute
{
    /// <summary>Target spacing between stops; the actual spacing divides the route evenly.</summary>
    public const double StopSpacingMeters = 400;

    private readonly double[] _cumulative;

    private TransitRoute(string routeId, string name, bool trunk, IReadOnlyList<GeoLocation> points)
    {
        RouteId = routeId;
        Name = name;
        IsTrunk = trunk;
        Points = points.Select(point => new GeoLocation(point.Lat, point.Lon)).ToArray();
        _cumulative = new double[Points.Count];
        for (var index = 1; index < Points.Count; index++)
        {
            _cumulative[index] = _cumulative[index - 1] + GeoMath.DistanceMeters(Points[index - 1], Points[index]);
        }

        // "Ruta 142 · San José – San Isidro de Coronado" → San José … Terminal de Coronado;
        // "Ramal Cascajal" → Terminal de Coronado … Cascajal.
        var shortName = name.Split(" · ")[0].Trim();
        ShortName = shortName;
        StartName = trunk ? Ends(name).Start : "Terminal de Coronado";
        // "Ramal Cascajal" ends in Cascajal; a "Ramal 07 (por definir)" has no place name yet.
        var placeholder = shortName.EndsWith("(por definir)", StringComparison.Ordinal);
        EndName = trunk ? "Terminal de Coronado"
            : placeholder ? shortName.Replace(" (por definir)", "")
            : shortName.Replace("Ramal ", "");

        var count = Math.Max(1, (int)Math.Round(Length / StopSpacingMeters));
        Stops = Enumerable.Range(0, count + 1)
            .Select(index =>
            {
                var meters = Length * index / count;
                var stopName = index == 0 ? StartName
                    : index == count ? EndName
                    : $"{shortName} · Parada {index}";
                return new TransitStop($"{routeId}-{index:00}", routeId, index, stopName, meters, PointAt(meters));
            })
            .ToArray();
    }

    public string RouteId { get; }

    public string Name { get; }

    /// <summary>"Ruta 142" or "Ramal Cascajal".</summary>
    public string ShortName { get; }

    public bool IsTrunk { get; }

    public string StartName { get; }

    public string EndName { get; }

    public IReadOnlyList<GeoLocation> Points { get; }

    public double Length => _cumulative[^1];

    /// <summary>Ordered from point 0 (inbound end) to the outbound end.</summary>
    public IReadOnlyList<TransitStop> Stops { get; }

    public static TransitRoute From(MockRoute route) =>
        new(route.RouteId, route.Name, route.Kind == MockRouteKind.Trunk, route.Corridor);

    /// <summary>Where a bus going this way is headed, as shown on its sign.</summary>
    public string Headsign(TravelDirection direction) => direction == TravelDirection.Outbound ? EndName : StartName;

    /// <summary>The meters at the end of the line a bus going this way is heading to.</summary>
    public double EndOf(TravelDirection direction) => direction == TravelDirection.Outbound ? Length : 0;

    public GeoLocation PointAt(double meters)
    {
        meters = Math.Clamp(meters, 0, Length);
        var segment = Segment(meters);
        var span = _cumulative[segment + 1] - _cumulative[segment];
        var fraction = span <= 0 ? 0 : (meters - _cumulative[segment]) / span;
        return GeoMath.Interpolate(Points[segment], Points[segment + 1], fraction);
    }

    /// <summary>Compass heading of a bus at <paramref name="meters"/> travelling in a direction.</summary>
    public double HeadingAt(double meters, TravelDirection direction)
    {
        var segment = Segment(Math.Clamp(meters, 0, Length));
        var (from, to) = direction == TravelDirection.Outbound
            ? (Points[segment], Points[segment + 1])
            : (Points[segment + 1], Points[segment]);
        return Math.Round(GeoMath.BearingDeg(from, to), 1) % 360;
    }

    /// <summary>The closest point of the route to a GPS position: meters along it, and how far off it is.</summary>
    public (double Meters, double OffRouteMeters) Locate(GeoLocation position)
    {
        var best = (Meters: 0.0, OffRouteMeters: double.MaxValue);
        for (var segment = 0; segment < Points.Count - 1; segment++)
        {
            var fraction = GeoMath.ProjectOntoSegment(position, Points[segment], Points[segment + 1]);
            var projected = GeoMath.Interpolate(Points[segment], Points[segment + 1], fraction);
            var off = GeoMath.DistanceMeters(position, projected);
            if (off < best.OffRouteMeters)
            {
                best = (_cumulative[segment] + (fraction * (_cumulative[segment + 1] - _cumulative[segment])), off);
            }
        }

        return best;
    }

    /// <summary>Stops strictly between two positions on the route, excluding the ends.</summary>
    public int StopsBetween(double first, double second)
    {
        var (low, high) = first < second ? (first, second) : (second, first);
        return Stops.Count(stop => stop.Meters > low + 1 && stop.Meters < high - 1);
    }

    /// <summary>The route's shape between two positions, in travel order, for drawing a ride.</summary>
    public IReadOnlyList<GeoLocation> PathBetween(double from, double to)
    {
        var (low, high) = from < to ? (from, to) : (to, from);
        var path = new List<GeoLocation> { PointAt(low) };
        for (var index = 0; index < Points.Count; index++)
        {
            if (_cumulative[index] > low && _cumulative[index] < high)
            {
                path.Add(Points[index]);
            }
        }

        path.Add(PointAt(high));
        if (from > to)
        {
            path.Reverse();
        }

        return path;
    }

    private int Segment(double meters)
    {
        for (var index = 0; index < _cumulative.Length - 2; index++)
        {
            if (meters <= _cumulative[index + 1])
            {
                return index;
            }
        }

        return _cumulative.Length - 2;
    }

    private static (string Start, string End) Ends(string name)
    {
        var places = name.Split(" · ").ElementAtOrDefault(1)?.Split(" – ");
        return places is [var start, var end] ? (start.Trim(), end.Trim()) : ("Inicio", "Final");
    }
}
