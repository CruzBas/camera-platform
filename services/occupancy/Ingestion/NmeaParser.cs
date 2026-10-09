using System.Globalization;

namespace Innova.Occupancy.Api.Ingestion;

public sealed record GpsFix(DateTimeOffset Time, double Lat, double Lon, double? SpeedKmh, double? HeadingDeg = null);

/// <summary>
/// Reads NMEA 0183 RMC and GGA sentences from any talker ($GP, $GN, $GL…). Sentences with a bad
/// checksum, no fix or an unsupported type are rejected rather than guessed at.
/// </summary>
public static class NmeaParser
{
    public const string Format = "NMEA-0183";
    private const double KilometersPerKnot = 1.852;
    // Below this speed a receiver's course is noise, so a stopped bus has no heading.
    private const double MovingAboveKmh = 2;

    public static (IReadOnlyList<GpsFix> Fixes, int Rejected) Parse(IEnumerable<string> sentences, DateTimeOffset messageTime)
    {
        var fixes = new List<GpsFix>();
        var rejected = 0;
        foreach (var sentence in sentences)
        {
            if (TryParse(sentence, messageTime, out var fix))
            {
                fixes.Add(fix);
            }
            else
            {
                rejected++;
            }
        }

        // When RMC and GGA report the same instant, RMC goes last: only it carries speed and course.
        return (fixes.OrderBy(fix => fix.Time).ThenBy(fix => fix.SpeedKmh is not null).ToArray(), rejected);
    }

    public static bool TryParse(string sentence, DateTimeOffset messageTime, out GpsFix fix)
    {
        fix = null!;
        if (!TrySplit(sentence, out var fields) || fields[0].Length < 5)
        {
            return false;
        }

        return fields[0][2..] switch
        {
            // $--RMC,hhmmss.ss,A,llll.ll,a,yyyyy.yy,a,speed,course,ddmmyy,...
            "RMC" => fields.Length >= 10 &&
                     fields[2] == "A" &&
                     TryCoordinates(fields[3], fields[4], fields[5], fields[6], out var lat, out var lon) &&
                     TryDateTime(fields[9], fields[1], out var time) &&
                     Create(time, lat, lon, ParseDouble(fields[7]) * KilometersPerKnot, ParseCourse(fields[8]), out fix),
            // $--GGA,hhmmss.ss,llll.ll,a,yyyyy.yy,a,quality,... (no date: taken from the message)
            "GGA" => fields.Length >= 7 &&
                     fields[6] is not ("" or "0") &&
                     TryCoordinates(fields[2], fields[3], fields[4], fields[5], out var ggaLat, out var ggaLon) &&
                     TryTimeOnMessageDay(fields[1], messageTime, out var ggaTime) &&
                     Create(ggaTime, ggaLat, ggaLon, null, null, out fix),
            _ => false
        };
    }

    private static bool TrySplit(string sentence, out string[] fields)
    {
        fields = [];
        var star = sentence.LastIndexOf('*');
        if (!sentence.StartsWith('$') || star < 2 || star + 3 > sentence.Length)
        {
            return false;
        }

        var body = sentence.AsSpan(1, star - 1);
        var checksum = 0;
        foreach (var character in body)
        {
            checksum ^= character;
        }

        if (!int.TryParse(sentence.AsSpan(star + 1, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var expected) ||
            expected != checksum)
        {
            return false;
        }

        fields = body.ToString().Split(',');
        return true;
    }

    private static bool TryCoordinates(string lat, string latHemisphere, string lon, string lonHemisphere, out double latitude, out double longitude)
    {
        latitude = longitude = 0;
        if (!TryDegrees(lat, 2, out latitude) || !TryDegrees(lon, 3, out longitude))
        {
            return false;
        }

        latitude *= latHemisphere switch { "N" => 1, "S" => -1, _ => double.NaN };
        longitude *= lonHemisphere switch { "E" => 1, "W" => -1, _ => double.NaN };
        return double.IsFinite(latitude) && double.IsFinite(longitude) &&
               Math.Abs(latitude) <= 90 && Math.Abs(longitude) <= 180;
    }

    // NMEA writes degrees and minutes together: ddmm.mmmm (latitude) or dddmm.mmmm (longitude).
    private static bool TryDegrees(string value, int degreeDigits, out double degrees)
    {
        degrees = 0;
        if (value.Length <= degreeDigits ||
            !int.TryParse(value.AsSpan(0, degreeDigits), NumberStyles.None, CultureInfo.InvariantCulture, out var whole) ||
            !double.TryParse(value.AsSpan(degreeDigits), NumberStyles.Float, CultureInfo.InvariantCulture, out var minutes) ||
            minutes >= 60)
        {
            return false;
        }

        degrees = whole + (minutes / 60);
        return true;
    }

    private static bool TryDateTime(string date, string time, out DateTimeOffset result)
    {
        result = default;
        return DateOnly.TryParseExact(date, "ddMMyy", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) &&
               TryTime(time, out var timeOfDay) &&
               Assign(new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero) + timeOfDay, out result);
    }

    private static bool TryTimeOnMessageDay(string time, DateTimeOffset messageTime, out DateTimeOffset result)
    {
        result = default;
        if (!TryTime(time, out var timeOfDay))
        {
            return false;
        }

        var utc = messageTime.ToUniversalTime();
        result = new DateTimeOffset(utc.Date, TimeSpan.Zero) + timeOfDay;
        // A fix taken just before midnight can arrive in a message sent just after it.
        if (result > utc + TimeSpan.FromHours(1))
        {
            result -= TimeSpan.FromDays(1);
        }

        return true;
    }

    private static bool TryTime(string value, out TimeSpan timeOfDay)
    {
        timeOfDay = default;
        if (value.Length < 6 ||
            !int.TryParse(value.AsSpan(0, 2), NumberStyles.None, CultureInfo.InvariantCulture, out var hours) ||
            !int.TryParse(value.AsSpan(2, 2), NumberStyles.None, CultureInfo.InvariantCulture, out var minutes) ||
            !double.TryParse(value.AsSpan(4), NumberStyles.Float, CultureInfo.InvariantCulture, out var seconds) ||
            hours > 23 || minutes > 59 || seconds >= 60)
        {
            return false;
        }

        timeOfDay = new TimeSpan(hours, minutes, 0) + TimeSpan.FromSeconds(seconds);
        return true;
    }

    private static double ParseDouble(string value) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) ? number : 0;

    // Course over ground in degrees true; empty when the receiver has none.
    private static double? ParseCourse(string value) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var course) && double.IsFinite(course)
            ? ((course % 360) + 360) % 360
            : null;

    private static bool Create(DateTimeOffset time, double lat, double lon, double? speedKmh, double? headingDeg, out GpsFix fix)
    {
        var heading = speedKmh >= MovingAboveKmh && headingDeg is { } course ? Math.Round(course, 1) % 360 : (double?)null;
        fix = new GpsFix(time, Math.Round(lat, 6), Math.Round(lon, 6), speedKmh is { } speed ? Math.Round(speed, 1) : null, heading);
        return true;
    }

    private static bool Assign(DateTimeOffset value, out DateTimeOffset result)
    {
        result = value;
        return true;
    }
}
