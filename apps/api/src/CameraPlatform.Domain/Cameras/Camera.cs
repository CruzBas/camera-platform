using System.Text.RegularExpressions;

namespace CameraPlatform.Domain.Cameras;

/// <summary>
/// Cámara registrada en la plataforma. Su video entra al gateway de streaming por el path
/// <see cref="StreamKey"/>: si tiene <see cref="SourceUrl"/>, el gateway se conecta a ella por RTSP;
/// si no, el path espera a que un proceso publique el video (por ejemplo, la webcam de la Mac).
/// </summary>
public sealed partial class Camera
{
    public const int NameMaxLength = 100;
    public const int StreamKeyMaxLength = 40;
    public const int RouteMaxLength = 100;
    public const int MaxCapacity = 300;

    private Camera()
    {
    }

    public Guid Id { get; private set; }
    public string Name { get; private set; } = "";

    /// <summary>Identificador del stream en el gateway. Inmutable: el video y la visión lo usan como dirección.</summary>
    public string StreamKey { get; private set; } = "";

    /// <summary>URL RTSP con credenciales. Se guarda cifrada; nunca se devuelve completa por la API.</summary>
    public string? SourceUrl { get; private set; }

    /// <summary>Ruta del bus donde va la cámara (p. ej. «San José – Guadalupe»).</summary>
    public string? Route { get; private set; }

    /// <summary>Pasajeros que caben en la zona que cubre la cámara; base del porcentaje de ocupación.</summary>
    public int? Capacity { get; private set; }

    public DateTimeOffset CreatedAt { get; private set; }

    public static Camera Create(string name, string streamKey, string? sourceUrl, DateTimeOffset now,
        string? route = null, int? capacity = null)
    {
        var errors = new Dictionary<string, string[]>();
        name = ValidateName(name, errors);
        streamKey = (streamKey ?? "").Trim();
        if (!StreamKeyPattern().IsMatch(streamKey))
        {
            errors["streamKey"] =
                [$"Usa entre 1 y {StreamKeyMaxLength} caracteres: minúsculas, números y guiones, empezando por letra o número."];
        }
        sourceUrl = ValidateSourceUrl(sourceUrl, errors);
        route = ValidateRoute(route, errors);
        ValidateCapacity(capacity, errors);
        ValidationException.ThrowIfAny(errors);

        return new Camera
        {
            Id = Guid.CreateVersion7(),
            Name = name,
            StreamKey = streamKey,
            SourceUrl = sourceUrl,
            Route = route,
            Capacity = capacity,
            CreatedAt = now,
        };
    }

    public void Update(string name, string? sourceUrl, string? route = null, int? capacity = null)
    {
        var errors = new Dictionary<string, string[]>();
        name = ValidateName(name, errors);
        sourceUrl = ValidateSourceUrl(sourceUrl, errors);
        route = ValidateRoute(route, errors);
        ValidateCapacity(capacity, errors);
        ValidationException.ThrowIfAny(errors);

        Name = name;
        SourceUrl = sourceUrl;
        Route = route;
        Capacity = capacity;
    }

    private static string? ValidateRoute(string? route, Dictionary<string, string[]> errors)
    {
        route = string.IsNullOrWhiteSpace(route) ? null : route.Trim();
        if (route?.Length > RouteMaxLength) errors["route"] = [$"Máximo {RouteMaxLength} caracteres."];
        return route;
    }

    private static void ValidateCapacity(int? capacity, Dictionary<string, string[]> errors)
    {
        if (capacity is < 1 or > MaxCapacity) errors["capacity"] = [$"Entre 1 y {MaxCapacity} pasajeros."];
    }

    private static string ValidateName(string name, Dictionary<string, string[]> errors)
    {
        name = (name ?? "").Trim();
        if (name.Length is 0 or > NameMaxLength)
        {
            errors["name"] = [$"El nombre es obligatorio (máximo {NameMaxLength} caracteres)."];
        }
        return name;
    }

    private static string? ValidateSourceUrl(string? sourceUrl, Dictionary<string, string[]> errors)
    {
        if (sourceUrl is null) return null;
        sourceUrl = sourceUrl.Trim();
        if (!Uri.TryCreate(sourceUrl, UriKind.Absolute, out var uri)
            || uri.Scheme is not ("rtsp" or "rtsps")
            || string.IsNullOrEmpty(uri.Host))
        {
            errors["sourceUrl"] =
                ["Debe ser una URL rtsp:// válida. Codifica en la contraseña los caracteres especiales (@ → %40)."];
        }
        return sourceUrl;
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9-]{0,39}$")]
    private static partial Regex StreamKeyPattern();
}
