using System.Security.Cryptography;
using System.Text;
using Innova.Occupancy.Api.Configuration;
using Microsoft.Extensions.Options;

namespace Innova.Occupancy.Api.Vehicles;

/// <summary>Checks the per-bus key that every write from an onboard computer must carry.</summary>
public sealed class DeviceAuthorizer(IOptions<IngestionOptions> ingestion)
{
    public const string Header = "X-Device-Key";

    public bool IsAuthorized(string vehicleId, string? deviceKey)
    {
        var keys = ingestion.Value.DeviceKeys;
        if (keys.Count == 0)
        {
            return true;
        }

        return deviceKey is not null &&
               keys.TryGetValue(vehicleId, out var expected) &&
               CryptographicOperations.FixedTimeEquals(
                   Encoding.UTF8.GetBytes(deviceKey),
                   Encoding.UTF8.GetBytes(expected));
    }
}
