using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Vehicles;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Transit;

public sealed record TripRequest(GeoPoint From, GeoPoint To, double WalkKmh, double MaxWalkMeters, TimeSpan Margin);

/// <summary>
/// Plans trips on the Coronado line from live bus positions: walk to a stop, ride a specific bus
/// (with at most one transfer, in practice at the Coronado terminal), walk to the destination. A bus
/// is only offered when the rider can walk to the stop, with a margin, before it gets there.
/// </summary>
public sealed class TripPlanner(
    TransitNetwork network,
    VehicleStateStore store,
    IOptions<MockFleetOptions> fleetOptions,
    TimeProvider time)
{
    /// <summary>Streets are not straight lines: walking distance is about this much longer.</summary>
    public const double WalkDetourFactor = 1.3;

    /// <summary>A bus farther than this from its route is not on it (detour, wrong trip data).</summary>
    public const double MaxOffRouteMeters = 200;

    /// <summary>Walking the whole way is offered up to this distance.</summary>
    public const double WalkOnlyMaxMeters = 2000;

    private const int MaxOptions = 5;
    private const int LaterBusesShown = 2;
    private const int PassesPerBus = 3;
    private static readonly TimeSpan MaxWait = TimeSpan.FromMinutes(60);
    private static readonly TimeSpan TransferPenalty = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan TightMargin = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan LongWait = TimeSpan.FromMinutes(20);

    /// <summary>Walking this much less does not make up for arriving later or changing buses.</summary>
    private const double WalkTolerance = 300;

    private readonly double? _hourOverride = TransitTiming.ParseTimeOfDay(fleetOptions.Value.TimeOfDayOverride);

    public TripPlan Plan(TripRequest request)
    {
        var now = time.GetUtcNow();
        var hour = TransitTiming.HourOfDay(now, _hourOverride);
        var context = new PlanContext(request, now, hour, LocateBuses(), request.WalkKmh * 1000 / 3600);
        var origin = new GeoLocation(request.From.Lat, request.From.Lon);
        var destination = new GeoLocation(request.To.Lat, request.To.Lon);

        var boardStops = StopsNear(origin, request.MaxWalkMeters);
        var alightStops = StopsNear(destination, request.MaxWalkMeters);
        var candidates = new List<TripOption>();

        var walkAll = WalkMeters(origin, destination);
        if (walkAll <= WalkOnlyMaxMeters)
        {
            var walk = Walk(context, Place("Origen", origin), Place("Destino", destination), walkAll, now);
            candidates.Add(Option(now, [walk], 0, []));
        }

        if (boardStops.Count == 0 || alightStops.Count == 0)
        {
            var where = boardStops.Count == 0 ? "El origen" : "El destino";
            return Result(request, now, candidates,
                $"{where} está a más de {request.MaxWalkMeters:0} m de cualquier parada de la línea de Coronado.");
        }

        // One bus: board and alight on the same route, in the direction that gets there.
        foreach (var (board, walkIn) in boardStops)
        {
            foreach (var (alight, walkOut) in alightStops.Where(stop => stop.Stop.RouteId == board.RouteId))
            {
                if (TryDirection(board, alight) is not { } direction)
                {
                    continue;
                }

                var arriveAtStop = now + WalkTime(context, walkIn);
                if (Ride(context, board, alight, direction, arriveAtStop) is not { } ride)
                {
                    continue;
                }

                var legs = new[]
                {
                    Walk(context, Place("Origen", origin), StopPlace(board), walkIn, now),
                    ride.Leg,
                    Walk(context, StopPlace(alight), Place("Destino", destination), walkOut, ride.Leg.ArriveAt)
                };
                candidates.Add(Option(now, legs, 0, ride.Warnings));
            }
        }

        // Two buses: ride to a transfer stop, change to another route, ride on.
        foreach (var (board, walkIn) in boardStops)
        {
            foreach (var transfer in network.Transfers.Where(link => link.From.RouteId == board.RouteId))
            {
                var onTransferRoute = alightStops.Where(stop => stop.Stop.RouteId == transfer.To.RouteId).ToArray();
                if (onTransferRoute.Length == 0 ||
                    TryDirection(board, transfer.From) is not { } firstDirection ||
                    Ride(context, board, transfer.From, firstDirection, now + WalkTime(context, walkIn)) is not { } first)
                {
                    continue;
                }

                var transferWalk = Walk(context, StopPlace(transfer.From), StopPlace(transfer.To), transfer.Meters, first.Leg.ArriveAt);
                foreach (var (alight, walkOut) in onTransferRoute)
                {
                    if (TryDirection(transfer.To, alight) is not { } secondDirection ||
                        Ride(context, transfer.To, alight, secondDirection, transferWalk.ArriveAt) is not { } second)
                    {
                        continue;
                    }

                    var legs = new List<TripLeg> { Walk(context, Place("Origen", origin), StopPlace(board), walkIn, now), first.Leg };
                    if (transfer.Meters >= 1)
                    {
                        legs.Add(transferWalk);
                    }

                    legs.Add(second.Leg);
                    legs.Add(Walk(context, StopPlace(alight), Place("Destino", destination), walkOut, second.Leg.ArriveAt));
                    candidates.Add(Option(now, legs, 1, [.. first.Warnings, .. second.Warnings]));
                }
            }
        }

        var hasBus = candidates.Any(option => option.Legs.Any(leg => leg.Type == LegType.Bus));
        return Result(request, now, candidates, hasBus ? null
            : context.Buses.Count == 0
                ? "No hay buses de la línea de Coronado en servicio en este momento (servicio de 5 a. m. a 11 p. m.)."
                : $"Ningún bus en servicio pasa por las paradas cercanas en los próximos {MaxWait.TotalMinutes:0} minutos.");
    }

    private TripPlan Result(TripRequest request, DateTimeOffset now, List<TripOption> candidates, string? message)
    {
        // Best option per way of travelling (same routes and directions); then drop any option another
        // one beats on everything (arrives no later, no more transfers, not much more walking).
        // Ranked by arrival; a transfer has to save a few minutes to beat a direct bus.
        var best = candidates
            .GroupBy(Signature)
            .Select(group => group.OrderBy(option => option.ArriveAt).First())
            .ToArray();
        var options = best
            .Where(option => !best.Any(other => other != option && Dominates(other, option)))
            .OrderBy(option => option.ArriveAt + (TransferPenalty * option.Transfers))
            .ThenBy(option => option.Transfers)
            .Take(MaxOptions)
            .ToArray();
        return new TripPlan(request.From, request.To, now, options, message);
    }

    private static bool Dominates(TripOption better, TripOption worse) =>
        better.ArriveAt <= worse.ArriveAt &&
        better.Transfers <= worse.Transfers &&
        WalkingMeters(better) <= WalkingMeters(worse) + WalkTolerance;

    private static int WalkingMeters(TripOption option) => option.Legs.Where(leg => leg.Type == LegType.Walk).Sum(leg => leg.Meters);

    private static string Signature(TripOption option) =>
        string.Join(">", option.Legs.Select(leg => leg.Bus is { } bus ? $"{bus.RouteId}:{bus.Direction}" : "walk"));

    /// <summary>Picks the first bus the rider can catch at <paramref name="board"/> and rides it to <paramref name="alight"/>.</summary>
    private RideResult? Ride(PlanContext context, TransitStop board, TransitStop alight, TravelDirection direction, DateTimeOffset atStop)
    {
        var route = network.Routes[board.RouteId];
        var readyAt = atStop + context.Request.Margin;
        var arrivals = context.Buses
            .Where(bus => bus.Route.RouteId == route.RouteId)
            .SelectMany(bus => Passes(context, bus, board.Meters, direction, readyAt).Select(arrival => (Bus: bus, Arrival: arrival)))
            .Where(item => item.Arrival.At <= readyAt + MaxWait)
            .OrderBy(item => item.Arrival.At)
            .ToArray();
        if (arrivals.Length == 0)
        {
            return null;
        }

        var (chosen, arrival) = arrivals[0];
        var speed = MetersPerSecond(route, context.Hour);
        var rideMeters = Math.Abs(alight.Meters - board.Meters);
        var stopsOnTheWay = route.StopsBetween(board.Meters, alight.Meters);
        var departs = arrival.At + TransitTiming.StopDwell;
        var arrives = departs + TimeSpan.FromSeconds((rideMeters / speed) + (stopsOnTheWay * TransitTiming.StopDwell.TotalSeconds));

        var state = chosen.State;
        var occupancy = state.Occupancy;
        var busNow = new BusNow(
            new GeoPoint(state.Location!.Lat, state.Location.Lon),
            state.Location.SpeedKmh,
            state.Location.HeadingDeg,
            occupancy?.PassengerCount,
            occupancy?.Capacity,
            occupancy?.Percent,
            occupancy?.Status,
            (int)Math.Round(arrival.Meters));
        var later = arrivals.Skip(1).Take(LaterBusesShown)
            .Select(item => new UpcomingBus(
                item.Bus.State.VehicleId,
                item.Arrival.At,
                item.Bus.State.Occupancy?.PassengerCount,
                item.Bus.State.Occupancy?.Capacity,
                item.Bus.State.Occupancy?.Status))
            .ToArray();
        var ride = new BusRide(
            route.RouteId,
            route.ShortName,
            direction,
            route.Headsign(direction),
            state.VehicleId,
            Minutes(arrival.At - atStop),
            stopsOnTheWay + 1,
            busNow,
            later,
            route.PathBetween(board.Meters, alight.Meters).Select(point => new GeoPoint(point.Lat, point.Lon)).ToArray());
        var leg = new TripLeg(LegType.Bus, StopPlace(board), StopPlace(alight), arrival.At, arrives, Minutes(arrives - arrival.At), (int)Math.Round(rideMeters), ride);

        var warnings = new List<string>();
        if (occupancy?.Status is OccupancyStatus.Full or OccupancyStatus.CrushedStandingRoomOnly)
        {
            var next = later.FirstOrDefault();
            warnings.Add(next is null
                ? $"El bus {state.VehicleId} viene {(occupancy.Status == OccupancyStatus.Full ? "lleno" : "muy lleno")}."
                : $"El bus {state.VehicleId} viene {(occupancy.Status == OccupancyStatus.Full ? "lleno" : "muy lleno")}; el siguiente, {next.VehicleId}, pasa a las {Local(next.ArriveAt)}.");
        }

        if (arrival.At - readyAt < TightMargin)
        {
            warnings.Add($"Margen ajustado: el bus {state.VehicleId} llega a {board.Name} apenas {Minutes(arrival.At - atStop):0.#} min después que usted.");
        }

        if (arrival.FromTerminal)
        {
            warnings.Add($"El bus {state.VehicleId} está descansando en {route.Headsign(direction == TravelDirection.Inbound ? TravelDirection.Outbound : TravelDirection.Inbound)}; la hora de salida es aproximada.");
        }

        if (arrival.At - atStop > LongWait)
        {
            warnings.Add($"Espera larga en {board.Name}: {Minutes(arrival.At - atStop):0} min.");
        }

        return new RideResult(leg, warnings);
    }

    /// <summary>
    /// The bus's next passes by the stop at or after <paramref name="readyAt"/>: it goes back and forth,
    /// so it passes every full round trip (both ways, every stop, a rest at each end).
    /// </summary>
    private static IEnumerable<Arrival> Passes(PlanContext context, BusOnRoute bus, double stopMeters, TravelDirection direction, DateTimeOffset readyAt)
    {
        var route = bus.Route;
        var oneWay = (route.Length / MetersPerSecond(route, context.Hour)) + ((route.Stops.Count - 2) * TransitTiming.StopDwell.TotalSeconds);
        var cycle = TimeSpan.FromSeconds(2 * (oneWay + TransitTiming.TerminalLayover.TotalSeconds));
        var first = ArrivalAt(context, bus, stopMeters, direction);
        var skip = first.At >= readyAt ? 0 : (int)Math.Ceiling((readyAt - first.At) / cycle);
        return Enumerable.Range(skip, PassesPerBus)
            .Select(round => round == 0 ? first : first with { At = first.At + (cycle * round), Meters = first.Meters + (round * 2 * route.Length), FromTerminal = false });
    }

    /// <summary>
    /// When a bus reaches a stop going a given way. A bus heading the other way first runs to the end of
    /// the line and rests there; a bus that already passed the stop must go to both ends and back.
    /// </summary>
    private static Arrival ArrivalAt(PlanContext context, BusOnRoute bus, double stopMeters, TravelDirection direction)
    {
        var route = bus.Route;
        var layover = TransitTiming.TerminalLayover.TotalSeconds;
        var sign = direction == TravelDirection.Outbound ? 1 : -1;
        double meters;
        int stops;
        double rest;

        if (bus.Direction == direction && sign * (stopMeters - bus.Meters) >= -5)
        {
            meters = Math.Abs(stopMeters - bus.Meters);
            stops = route.StopsBetween(bus.Meters, stopMeters);
            // Resting at the end it is about to leave: the layover is part over, take half.
            rest = bus.RestingAtTerminal ? layover / 2 : 0;
        }
        else if (bus.Direction != direction)
        {
            var turn = route.EndOf(bus.Direction);
            meters = Math.Abs(turn - bus.Meters) + Math.Abs(stopMeters - turn);
            stops = route.StopsBetween(bus.Meters, turn) + route.StopsBetween(turn, stopMeters);
            rest = layover;
        }
        else
        {
            var firstTurn = route.EndOf(bus.Direction);
            var secondTurn = route.EndOf(direction == TravelDirection.Outbound ? TravelDirection.Inbound : TravelDirection.Outbound);
            meters = Math.Abs(firstTurn - bus.Meters) + route.Length + Math.Abs(stopMeters - secondTurn);
            stops = route.StopsBetween(bus.Meters, firstTurn) + (route.Stops.Count - 2) + route.StopsBetween(secondTurn, stopMeters);
            rest = 2 * layover;
        }

        var seconds = (meters / MetersPerSecond(route, context.Hour)) + (stops * TransitTiming.StopDwell.TotalSeconds) + rest;
        return new Arrival(context.Now + TimeSpan.FromSeconds(seconds), meters, bus.RestingAtTerminal && rest < layover);
    }

    /// <summary>Live buses running a trip, placed on their route.</summary>
    private IReadOnlyList<BusOnRoute> LocateBuses() =>
        store.List()
            .Where(state => !state.Stale && state.Location is not null && state.Trip is not null)
            .Select(state =>
            {
                if (!network.Routes.TryGetValue(state.Trip!.RouteId, out var route))
                {
                    return null;
                }

                var (meters, off) = route.Locate(state.Location!);
                if (off > MaxOffRouteMeters)
                {
                    return null;
                }

                // Stopped at the end it is leaving: the bus is resting before its next trip.
                var leaving = route.EndOf(state.Trip.Direction == TravelDirection.Outbound ? TravelDirection.Inbound : TravelDirection.Outbound);
                var resting = (state.Location!.SpeedKmh ?? 0) == 0 && Math.Abs(meters - leaving) < 30;
                return new BusOnRoute(state, route, meters, state.Trip.Direction, resting);
            })
            .OfType<BusOnRoute>()
            .ToArray();

    /// <summary>Every stop within walking distance, with the walking meters to it.</summary>
    private List<(TransitStop Stop, double WalkMeters)> StopsNear(GeoLocation point, double maxWalkMeters) =>
        network.Routes.Values
            .SelectMany(route => route.Stops)
            .Select(stop => (Stop: stop, WalkMeters: WalkMeters(point, stop.Location)))
            .Where(item => item.WalkMeters <= maxWalkMeters)
            .ToList();

    private static TravelDirection? TryDirection(TransitStop from, TransitStop to) =>
        Math.Abs(to.Meters - from.Meters) < 1 ? null
        : to.Meters > from.Meters ? TravelDirection.Outbound : TravelDirection.Inbound;

    private static double WalkMeters(GeoLocation from, GeoLocation to) => GeoMath.DistanceMeters(from, to) * WalkDetourFactor;

    private static TimeSpan WalkTime(PlanContext context, double meters) => TimeSpan.FromSeconds(meters / context.WalkMetersPerSecond);

    private static TripLeg Walk(PlanContext context, TripPlace from, TripPlace to, double meters, DateTimeOffset start)
    {
        var duration = WalkTime(context, meters);
        return new TripLeg(LegType.Walk, from, to, start, start + duration, Minutes(duration), (int)Math.Round(meters), null);
    }

    private static TripOption Option(DateTimeOffset now, IReadOnlyList<TripLeg> legs, int transfers, IReadOnlyList<string> warnings)
    {
        // A stop right at the origin or destination needs no walk.
        legs = legs.Where(leg => leg.Type == LegType.Bus || leg.Meters >= 1 || legs.Count == 1).ToArray();
        var arrive = legs[^1].ArriveAt;
        return new TripOption(now, arrive, Minutes(arrive - now), transfers, legs, warnings);
    }

    private static double MetersPerSecond(TransitRoute route, double hour) => TransitTiming.CruiseKmh(route.IsTrunk, hour) / 3.6;

    private static TripPlace Place(string name, GeoLocation point) => new(name, point.Lat, point.Lon, null);

    private static TripPlace StopPlace(TransitStop stop) => new(stop.Name, stop.Location.Lat, stop.Location.Lon, stop.StopId);

    private static double Minutes(TimeSpan span) => Math.Round(span.TotalMinutes, 1);

    private static string Local(DateTimeOffset at) => at.ToOffset(TransitTiming.CostaRicaOffset).ToString("HH:mm");

    private sealed record PlanContext(TripRequest Request, DateTimeOffset Now, double Hour, IReadOnlyList<BusOnRoute> Buses, double WalkMetersPerSecond);

    private sealed record BusOnRoute(VehicleState State, TransitRoute Route, double Meters, TravelDirection Direction, bool RestingAtTerminal);

    private sealed record Arrival(DateTimeOffset At, double Meters, bool FromTerminal);

    private sealed record RideResult(TripLeg Leg, IReadOnlyList<string> Warnings);
}
