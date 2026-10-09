using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Vehicles.Simulation;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>
/// Registered buses, their capacity and route, read from the fleet file. Raw sensor data only
/// carries counts, so the capacity needed for "71 % full" comes from here.
/// </summary>
public sealed class FleetRegistry
{
    private readonly Dictionary<string, MockBus> _buses;

    public FleetRegistry(IOptions<FleetOptions> options, IHostEnvironment environment)
    {
        var path = Path.GetFullPath(options.Value.RegistryFile, environment.ContentRootPath);
        _buses = MockFleet.Load(path).Buses.ToDictionary(bus => bus.VehicleId, StringComparer.Ordinal);
    }

    public int? CapacityOf(string vehicleId) => _buses.TryGetValue(vehicleId, out var bus) ? bus.Capacity : null;

    /// <summary>The route a bus is assigned to; raw device data does not say which route it runs.</summary>
    public string? RouteOf(string vehicleId) => _buses.TryGetValue(vehicleId, out var bus) ? bus.RouteId : null;
}
