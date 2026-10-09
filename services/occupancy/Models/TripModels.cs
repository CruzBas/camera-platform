using Innova.Occupancy.Api.Transit;

namespace Innova.Occupancy.Api.Models;

// ---- Trip planning on the Coronado line (GET /api/v1/trips/plan) ----

public sealed record GeoPoint(double Lat, double Lon);

/// <summary>Options from best to worst, by arrival time; empty when nothing on the line fits, with the reason in Message.</summary>
public sealed record TripPlan(
    GeoPoint From,
    GeoPoint To,
    DateTimeOffset GeneratedAt,
    IReadOnlyList<TripOption> Options,
    string? Message);

public sealed record TripOption(
    DateTimeOffset DepartAt,
    DateTimeOffset ArriveAt,
    double DurationMinutes,
    int Transfers,
    IReadOnlyList<TripLeg> Legs,
    IReadOnlyList<string> Warnings);

public enum LegType
{
    Walk,
    Bus
}

/// <summary>One part of a trip: a walk, or a ride on a specific bus (then <see cref="Bus"/> is set).</summary>
public sealed record TripLeg(
    LegType Type,
    TripPlace From,
    TripPlace To,
    DateTimeOffset DepartAt,
    DateTimeOffset ArriveAt,
    double Minutes,
    int Meters,
    BusRide? Bus);

/// <summary>A point of a trip; <see cref="StopId"/> is set when it is a bus stop.</summary>
public sealed record TripPlace(string Name, double Lat, double Lon, string? StopId);

public sealed record BusRide(
    string RouteId,
    string RouteName,
    TravelDirection Direction,
    string Headsign,
    string VehicleId,
    double WaitMinutes,
    int Stops,
    BusNow Vehicle,
    IReadOnlyList<UpcomingBus> LaterBuses,
    IReadOnlyList<GeoPoint> Path);

/// <summary>The recommended bus as it is right now, from the live vehicle state.</summary>
public sealed record BusNow(
    GeoPoint Location,
    double? SpeedKmh,
    double? HeadingDeg,
    int? PassengerCount,
    int? Capacity,
    int? Percent,
    OccupancyStatus? Status,
    int DistanceToStopMeters);

/// <summary>The next buses that also reach the boarding stop, in case the first one is full.</summary>
public sealed record UpcomingBus(
    string VehicleId,
    DateTimeOffset ArriveAt,
    int? PassengerCount,
    int? Capacity,
    OccupancyStatus? Status);
