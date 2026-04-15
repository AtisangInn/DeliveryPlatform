using DeliveryPlatform.Api.Models;

namespace DeliveryPlatform.Api.Services.Interfaces;

public interface IAuthService
{
    Task<string?> RegisterAsync(RegisterRequest request);
    Task<AuthResponse?> LoginAsync(LoginRequest request);
}
