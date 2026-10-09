using System.Text.Json;
using System.Text.Json.Serialization;
using Innova.Occupancy.Api.Models;

namespace Innova.Occupancy.Api.Vehicles.Simulation;

/// <summary>
/// Mock fleet and route reference data (MockData/coronado-fleet.json). It only drives the
/// simulator; the API itself never serves routes.
/// </summary>
public sealed record MockFleet(MockOperator Operator, IReadOnlyList<MockRoute> Routes, IReadOnlyList<MockBus> Buses)
{
    private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

    public static MockFleet Load(string path)
    {
        using var stream = File.OpenRead(path);
        var fleet = JsonSerializer.Deserialize<MockFleet>(stream, JsonOptions)
            ?? throw new InvalidDataException($"Mock fleet file '{path}' is empty.");

        var routes = fleet.Routes.ToDictionary(route => route.RouteId);
        foreach (var bus in fleet.Buses)
        {
            if (!routes.TryGetValue(bus.RouteId, out var route) || route.Corridor.Count < 2)
            {
                throw new InvalidDataException($"Bus {bus.VehicleId} uses route '{bus.RouteId}', which is missing or has fewer than 2 points.");
            }
        }

        return fleet;
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseUpper));
        return options;
    }
}

public sealed record MockOperator(string Name, int DailyRiders, string Notes);

public enum MockRouteKind
{
    Trunk,
    Feeder
}

/// <summary>
/// A corridor runs from point 0 outward. Trunk routes start in San José, feeders start at the
/// Coronado terminal, so travelling toward point 0 is the inbound (morning-peak) direction.
/// </summary>
public sealed record MockRoute(string RouteId, string Name, MockRouteKind Kind, IReadOnlyList<GeoLocation> Corridor);

public sealed record MockBus(string VehicleId, int FleetNumber, string RouteId, int Capacity, bool OutOfService = false);
