using Innova.Occupancy.Api.Configuration;
using Innova.Occupancy.Api.Models;

namespace Innova.Occupancy.Api.Vehicles;

public static class OccupancyClassifier
{
    public static int Percent(int passengerCount, int capacity) =>
        capacity <= 0 ? 0 : (int)Math.Round(passengerCount * 100d / capacity, MidpointRounding.AwayFromZero);

    public static OccupancyStatus Classify(int passengerCount, int percent, OccupancyThresholds thresholds) =>
        passengerCount <= 0 ? OccupancyStatus.Empty
        : percent < thresholds.ManySeatsAvailableBelow ? OccupancyStatus.ManySeatsAvailable
        : percent < thresholds.FewSeatsAvailableBelow ? OccupancyStatus.FewSeatsAvailable
        : percent < thresholds.StandingRoomOnlyBelow ? OccupancyStatus.StandingRoomOnly
        : percent < thresholds.CrushedStandingRoomOnlyBelow ? OccupancyStatus.CrushedStandingRoomOnly
        : OccupancyStatus.Full;
}
