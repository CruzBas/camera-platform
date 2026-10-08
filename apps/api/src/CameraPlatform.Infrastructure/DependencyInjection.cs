using System.Net.Http.Headers;
using System.Text;
using CameraPlatform.Application.Abstractions;
using CameraPlatform.Infrastructure.Persistence;
using CameraPlatform.Infrastructure.Streaming;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CameraPlatform.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<AppDbContext>(o => o.UseNpgsql(configuration.GetConnectionString("Default")));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        // Claves de cifrado fuera de la base de datos: robar un backup de PostgreSQL no basta para leer
        // las credenciales de las cámaras.
        services.AddDataProtection()
            .SetApplicationName("CameraPlatform")
            .PersistKeysToFileSystem(new DirectoryInfo(configuration["DataProtection:KeysPath"]
                ?? throw new InvalidOperationException("Falta DataProtection:KeysPath")));

        services.AddIdentityCore<IdentityUser>(o =>
            {
                o.User.RequireUniqueEmail = true;
                o.Lockout.MaxFailedAccessAttempts = 5;
            })
            .AddEntityFrameworkStores<AppDbContext>()
            .AddSignInManager();

        services.AddOptions<MediaMtxOptions>()
            .Bind(configuration.GetSection(MediaMtxOptions.Section))
            .Validate(o => o.ApiUrl is not null && o.ApiPassword.Length > 0, "Faltan MediaMtx:ApiUrl o MediaMtx:ApiPassword")
            .ValidateOnStart();
        services.AddHttpClient<IStreamingGateway, MediaMtxGateway>((sp, http) =>
        {
            var o = sp.GetRequiredService<IOptions<MediaMtxOptions>>().Value;
            http.BaseAddress = o.ApiUrl;
            http.Timeout = TimeSpan.FromSeconds(5);
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes($"{o.ApiUser}:{o.ApiPassword}")));
        });

        return services;
    }
}
