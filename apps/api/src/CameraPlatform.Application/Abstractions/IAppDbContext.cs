using CameraPlatform.Domain.Cameras;
using CameraPlatform.Domain.Detections;
using Microsoft.EntityFrameworkCore;

namespace CameraPlatform.Application.Abstractions;

public interface IAppDbContext
{
    DbSet<Camera> Cameras { get; }
    DbSet<DetectionEvent> DetectionEvents { get; }
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
