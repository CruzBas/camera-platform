using System.Globalization;

namespace Innova.Occupancy.Api.Transit;

/// <summary>
/// How the Coronado buses run over the day. The simulator drives buses with these numbers and the
/// trip planner predicts arrivals with the same ones, so plans match what the buses do.
/// </summary>
public static class TransitTiming
{
    public static readonly TimeSpan CostaRicaOffset = TimeSpan.FromHours(-6);

    /// <summary>Doors open at each stop.</summary>
    public static readonly TimeSpan StopDwell = TimeSpan.FromSeconds(20);

    /// <summary>Rest at each end of the line before the trip back.</summary>
    public static readonly TimeSpan TerminalLayover = TimeSpan.FromMinutes(5);

    /// <summary>Average speed between stops; GAM traffic is much slower at rush hour.</summary>
    public static double CruiseKmh(bool trunk, double hour)
    {
        var rushHour = hour is (>= 6 and < 9) or (>= 16 and < 19);
        return trunk ? (rushHour ? 12 : 20) : (rushHour ? 16 : 24);
    }

    /// <summary>Hour of the day in Costa Rica (0..24), or the configured override.</summary>
    public static double HourOfDay(DateTimeOffset now, double? hourOverride) =>
        hourOverride ?? now.ToOffset(CostaRicaOffset).TimeOfDay.TotalHours;

    /// <summary>Parses a time-of-day setting such as MockFleet:TimeOfDayOverride ("07:30"); empty gives null.</summary>
    public static double? ParseTimeOfDay(string? value, string setting = "MockFleet:TimeOfDayOverride") =>
        string.IsNullOrWhiteSpace(value) ? null
        : TimeOnly.TryParse(value, CultureInfo.InvariantCulture, out var timeOfDay)
            ? timeOfDay.ToTimeSpan().TotalHours
            : throw new InvalidOperationException($"{setting} '{value}' is not a time such as 07:30.");
}
