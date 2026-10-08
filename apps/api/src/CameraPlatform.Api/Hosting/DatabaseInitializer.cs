using CameraPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace CameraPlatform.Api.Hosting;

public sealed class AdminOptions
{
    public const string Section = "Admin";

    public string Email { get; set; } = "";
    public string Password { get; set; } = "";
}

public static class DatabaseInitializer
{
    /// <summary>Aplica migraciones pendientes y crea el administrador inicial si todavía no hay usuarios.</summary>
    public static async Task InitializeDatabaseAsync(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var services = scope.ServiceProvider;
        var logger = services.GetRequiredService<ILogger<AppDbContext>>();

        await services.GetRequiredService<AppDbContext>().Database.MigrateAsync();

        var users = services.GetRequiredService<UserManager<IdentityUser>>();
        if (await users.Users.AnyAsync()) return;

        var admin = services.GetRequiredService<IOptions<AdminOptions>>().Value;
        if (admin.Email.Length == 0 || admin.Password.Length == 0)
        {
            logger.LogWarning("No hay usuarios y faltan Admin:Email / Admin:Password: nadie podrá iniciar sesión");
            return;
        }

        var result = await users.CreateAsync(
            new IdentityUser { UserName = admin.Email, Email = admin.Email, EmailConfirmed = true }, admin.Password);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                "No se pudo crear el administrador inicial: " + string.Join(" ", result.Errors.Select(e => e.Description)));
        }
        logger.LogInformation("Administrador inicial {Email} creado", admin.Email);
    }
}
