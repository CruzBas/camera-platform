using CameraPlatform.Application.Abstractions;
using CameraPlatform.Domain.Cameras;
using CameraPlatform.Domain.Detections;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace CameraPlatform.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options, IDataProtectionProvider dataProtection)
    : IdentityDbContext<IdentityUser>(options), IAppDbContext
{
    public DbSet<Camera> Cameras => Set<Camera>();
    public DbSet<DetectionEvent> DetectionEvents => Set<DetectionEvent>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Las credenciales RTSP viajan dentro de la URL: se cifran antes de llegar a la base de datos.
        var sourceProtector = dataProtection.CreateProtector("CameraPlatform.Cameras.SourceUrl");

        builder.Entity<Camera>(b =>
        {
            b.HasKey(c => c.Id);
            b.Property(c => c.Name).HasMaxLength(Camera.NameMaxLength);
            b.Property(c => c.StreamKey).HasMaxLength(Camera.StreamKeyMaxLength);
            b.Property(c => c.Route).HasMaxLength(Camera.RouteMaxLength);
            b.HasIndex(c => c.StreamKey).IsUnique();
            b.Property(c => c.SourceUrl)
                .HasColumnName("SourceUrlProtected")
                .HasConversion(v => sourceProtector.Protect(v!), v => sourceProtector.Unprotect(v));
        });

        builder.Entity<DetectionEvent>(b =>
        {
            b.HasKey(e => e.Id);
            b.Property(e => e.Type).HasMaxLength(50);
            b.HasOne<Camera>().WithMany().HasForeignKey(e => e.CameraId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(e => new { e.CameraId, e.Type, e.LastSeenAt });
            b.HasIndex(e => e.StartedAt);
        });
    }
}
