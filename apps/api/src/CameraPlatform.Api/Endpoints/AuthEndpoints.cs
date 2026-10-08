using System.Security.Claims;
using Microsoft.AspNetCore.Identity;

namespace CameraPlatform.Api.Endpoints;

public static class AuthEndpoints
{
    public sealed record LoginRequest(string Email, string Password);

    public sealed record UserDto(string Email);

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/login", async (LoginRequest request, SignInManager<IdentityUser> signIn) =>
        {
            var result = await signIn.PasswordSignInAsync(request.Email ?? "", request.Password ?? "",
                isPersistent: true, lockoutOnFailure: true);
            if (result.Succeeded) return Results.Ok(new UserDto(request.Email!));

            var detail = result.IsLockedOut
                ? "Cuenta bloqueada temporalmente por intentos fallidos."
                : "Correo o contraseña incorrectos.";
            return Results.Problem(detail, statusCode: StatusCodes.Status401Unauthorized);
        });

        group.MapPost("/logout", async (SignInManager<IdentityUser> signIn) =>
        {
            await signIn.SignOutAsync();
            return Results.NoContent();
        });

        group.MapGet("/me", (ClaimsPrincipal user) => new UserDto(user.Identity!.Name!))
            .RequireAuthorization();
    }
}
