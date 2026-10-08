using CameraPlatform.Domain;
using Microsoft.AspNetCore.Diagnostics;

namespace CameraPlatform.Api.Hosting;

/// <summary>Convierte <see cref="ValidationException"/> en un 400 con los errores por campo.</summary>
public sealed class ValidationExceptionHandler : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception, CancellationToken ct)
    {
        if (exception is not ValidationException validation) return false;

        await Results.ValidationProblem(validation.Errors.ToDictionary(e => e.Key, e => e.Value))
            .ExecuteAsync(context);
        return true;
    }
}
