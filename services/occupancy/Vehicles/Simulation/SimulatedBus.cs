using Innova.Occupancy.Api.Models;
using Innova.Occupancy.Api.Transit;

namespace Innova.Occupancy.Api.Vehicles.Simulation;

/// <summary>
/// One bus driving back and forth along its route: it stops at each of the route's stops, empties
/// at each end of the line, and boards passengers according to Costa Rica rush hours.
/// </summary>
public sealed class SimulatedBus
{
    private readonly int _capacity;
    private readonly TransitRoute _route;
    private double _metersAlong;
    private TravelDirection _direction;
    private bool _atStop;
    private bool _atTerminal;
    private bool _parked;
    private TimeSpan _waitRemaining;

    public SimulatedBus(
        string vehicleId,
        int capacity,
        TransitRoute route,
        double startFraction,
        TravelDirection startDirection,
        int initialPassengers,
        double serviceRank)
    {
        ServiceRank = serviceRank;
        VehicleId = vehicleId;
        _capacity = capacity;
        _route = route;
        _metersAlong = Math.Clamp(startFraction, 0, 1) * route.Length;
        _direction = startDirection;
        Passengers = Math.Clamp(initialPassengers, 0, capacity);
    }

    public string VehicleId { get; }

    /// <summary>0..1: buses with a low rank stay in service when the operator runs fewer buses.</summary>
    public double ServiceRank { get; }

    public int Passengers { get; private set; }

    /// <summary>Everyone who boarded since the bus was created (used to calibrate daily ridership).</summary>
    public int TotalBoardings { get; private set; }

    private bool Inbound => _direction == TravelDirection.Inbound;

    private int Sign => Inbound ? -1 : 1;

    private int MaximumLoad => (int)(_capacity * 1.15);

    public VehicleObservation Step(DateTimeOffset now, TimeSpan elapsed, Random random, double? hourOverride = null)
    {
        var hour = TransitTiming.HourOfDay(now, hourOverride);
        DoorEventReport? doorEvent = null;
        double speedKmh = 0;
        var inService = ServiceRank < ActiveShare(hour);

        if (_waitRemaining > TimeSpan.Zero)
        {
            // Doors open at a stop, or resting at the terminal.
            _waitRemaining -= elapsed;
        }
        else if (_parked)
        {
            // Waiting at the terminal, empty, until the schedule needs this bus again.
            _parked = !inService;
        }
        else if (_atTerminal && !inService)
        {
            // Last trip done: drop everyone and park.
            doorEvent = Board(now, 0, Passengers);
            _atTerminal = false;
            _parked = true;
        }
        else if (_atTerminal)
        {
            // End of the line: everyone gets off, then the bus loads for the trip back. Terminals
            // fill buses at rush hour: San José in the evening, and Coronado in the morning,
            // where feeder passengers transfer to the trunk line.
            var alightings = Passengers;
            _direction = Inbound ? TravelDirection.Outbound : TravelDirection.Inbound;
            _atTerminal = false;
            var terminalBoardings = (int)Math.Round(_capacity * Demand(hour) * (0.5 + (random.NextDouble() * 0.5)));
            doorEvent = Board(now, terminalBoardings, alightings);
            _waitRemaining = TransitTiming.TerminalLayover;
        }
        else if (_atStop)
        {
            var share = Inbound ? 0.03 : 0.15;
            var alightings = (int)Math.Round(Passengers * random.NextDouble() * share * 2);
            var boardings = (int)Math.Round(random.NextDouble() * StopBoardingMaximum * Demand(hour));
            doorEvent = Board(now, boardings, alightings);
            _waitRemaining = TransitTiming.StopDwell - elapsed;
            _atStop = false;
        }
        else
        {
            speedKmh = TransitTiming.CruiseKmh(_route.IsTrunk, hour) + random.Next(-4, 5);
            var target = _metersAlong + (speedKmh / 3.6 * elapsed.TotalSeconds * Sign);
            var nextStop = NextStop();
            var end = _route.EndOf(_direction);
            if (Sign * (target - end) >= 0)
            {
                _metersAlong = end;
                _atTerminal = true;
            }
            else if (nextStop is { } stop && Sign * (target - stop) >= 0)
            {
                // The bus pulls up at the stop; doors open on the next step.
                _metersAlong = stop;
                _atStop = true;
            }
            else
            {
                _metersAlong = target;
            }
        }

        // A parked bus runs no trip, so riders are never offered it.
        var trip = _parked ? null : new TripDescriptor(_route.RouteId, _direction);
        return new VehicleObservation(
            now,
            Position() with { SpeedKmh = speedKmh, HeadingDeg = speedKmh > 0 ? Heading() : null },
            new OccupancyReading(Passengers, _capacity, SensorSource.Simulated),
            doorEvent is null ? null : [doorEvent],
            new DeviceStatusReport(true, "sim-2.0"),
            trip);
    }

    public GeoLocation Position() => _route.PointAt(_metersAlong);

    /// <summary>Direction of travel along the current street segment, in degrees from north.</summary>
    public double Heading() => _route.HeadingAt(_metersAlong, _direction);

    /// <summary>Share of the fleet in service: everyone at rush hour, about half otherwise, none at night.</summary>
    public static double ActiveShare(double hour) => hour switch
    {
        >= 5 and < 9 => 1.0,
        >= 9 and < 16 => 0.55,
        >= 16 and < 19 => 1.0,
        >= 19 and < 23 => 0.5,
        _ => 0
    };

    /// <summary>Relative demand: mornings flow toward San José and the terminal, evenings back out.</summary>
    public double Demand(double hour) => hour switch
    {
        >= 5 and < 8 => Inbound ? 1.0 : 0.25,
        >= 8 and < 9 => Inbound ? 0.45 : 0.25,
        >= 9 and < 16 => 0.2,
        >= 16 and < 19 => Inbound ? 0.25 : 1.0,
        >= 19 and < 22 => Inbound ? 0.2 : 0.26,
        _ => 0.03
    };

    private int StopBoardingMaximum => _route.IsTrunk ? 4 : 2;

    /// <summary>The next intermediate stop ahead; the ends of the line are terminals, handled apart.</summary>
    private double? NextStop()
    {
        var ahead = _route.Stops
            .Select(stop => stop.Meters)
            .Where(meters => meters > 1 && meters < _route.Length - 1 && Sign * (meters - _metersAlong) > 0.5);
        return Inbound ? ahead.Cast<double?>().LastOrDefault() : ahead.Cast<double?>().FirstOrDefault();
    }

    private DoorEventReport Board(DateTimeOffset now, int boardings, int alightings)
    {
        alightings = Math.Clamp(alightings, 0, Passengers);
        // A full bus leaves people at the stop; they are not counted as riders.
        boardings = Math.Clamp(boardings, 0, MaximumLoad - (Passengers - alightings));
        Passengers = Passengers - alightings + boardings;
        TotalBoardings += boardings;
        return new DoorEventReport(1, boardings, alightings, now.AddSeconds(-25), now.AddSeconds(-5));
    }
}
