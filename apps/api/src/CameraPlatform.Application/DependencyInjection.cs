using CameraPlatform.Application.Cameras;
using CameraPlatform.Application.Detections;
using Microsoft.Extensions.DependencyInjection;

namespace CameraPlatform.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<AnalysisMonitor>();
        services.AddScoped<CameraService>();
        services.AddScoped<DetectionService>();
        services.AddScoped<StreamingReconciler>();
        return services;
    }
}
