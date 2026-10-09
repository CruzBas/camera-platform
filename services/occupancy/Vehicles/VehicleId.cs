using System.Text.RegularExpressions;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>
/// Bus ids are plates or fleet numbers written by people, so "sjb 8754", "SJB_8754" and "SJB-8754"
/// must all mean the same bus. They are stored upper-case with single hyphens.
/// </summary>
public static partial class VehicleId
{
    private const int MaximumLength = 32;

    public static bool TryNormalize(string? value, out string vehicleId)
    {
        vehicleId = string.Empty;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = Separators().Replace(value.Trim().ToUpperInvariant(), "-").Trim('-');
        if (normalized.Length is 0 or > MaximumLength || !Allowed().IsMatch(normalized))
        {
            return false;
        }

        vehicleId = normalized;
        return true;
    }

    [GeneratedRegex(@"[\s_\-]+")]
    private static partial Regex Separators();

    [GeneratedRegex("^[A-Z0-9]+(-[A-Z0-9]+)*$")]
    private static partial Regex Allowed();
}
