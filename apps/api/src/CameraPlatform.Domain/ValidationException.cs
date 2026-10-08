namespace CameraPlatform.Domain;

/// <summary>Datos de entrada inválidos. La API la traduce a un 400 con los errores por campo.</summary>
public sealed class ValidationException(IReadOnlyDictionary<string, string[]> errors)
    : Exception("Uno o más datos no son válidos.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;

    public ValidationException(string field, string message)
        : this(new Dictionary<string, string[]> { [field] = [message] })
    {
    }

    public static void ThrowIfAny(Dictionary<string, string[]> errors)
    {
        if (errors.Count > 0) throw new ValidationException(errors);
    }
}
