using CameraPlatform.Api.Endpoints;
using CameraPlatform.Api.Hosting;
using CameraPlatform.Api.Realtime;
using CameraPlatform.Application;
using CameraPlatform.Application.Abstractions;
using CameraPlatform.Infrastructure;
using CameraPlatform.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);

// Sesión por cookie HttpOnly. El dashboard llama a la API a través del mismo origen (proxy de Next.js),
// así que no hace falta CORS ni guardar tokens en el navegador.
builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme)
    .AddIdentityCookies(cookies => cookies.ApplicationCookie?.Configure(o =>
    {
        o.Cookie.Name = "camera_platform_session";
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.ExpireTimeSpan = TimeSpan.FromDays(7);
        o.SlidingExpiration = true;
        // Es una API: responder 401/403 en lugar de redirigir a una página de login.
        o.Events.OnRedirectToLogin = ctx => SetStatus(ctx.Response, StatusCodes.Status401Unauthorized);
        o.Events.OnRedirectToAccessDenied = ctx => SetStatus(ctx.Response, StatusCodes.Status403Forbidden);
    }));
builder.Services.AddAuthorization();

builder.Services.AddOptions<VisionOptions>()
    .Bind(builder.Configuration.GetSection(VisionOptions.Section))
    .Validate(o => o.ApiKey.Length >= 16, "Vision:ApiKey debe tener al menos 16 caracteres")
    .ValidateOnStart();
builder.Services.AddOptions<AdminOptions>().Bind(builder.Configuration.GetSection(AdminOptions.Section));

builder.Services.AddSignalR();
builder.Services.AddSingleton<IRealtimeNotifier, SignalRNotifier>();
builder.Services.AddHostedService<StreamingSyncWorker>();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ValidationExceptionHandler>();
builder.Services.AddHealthChecks().AddDbContextCheck<AppDbContext>("postgres");

var app = builder.Build();

await app.InitializeDatabaseAsync();

app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health");
app.MapAuthEndpoints();
app.MapCameraEndpoints();
app.MapEventEndpoints();
app.MapInternalEndpoints();
app.MapHub<EventsHub>("/hubs/events");

app.Run();

static Task SetStatus(HttpResponse response, int status)
{
    response.StatusCode = status;
    return Task.CompletedTask;
}
