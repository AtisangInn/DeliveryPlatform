using DeliveryPlatform.Api.Data;
using DeliveryPlatform.Api.Models;
using DeliveryPlatform.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using BC = BCrypt.Net.BCrypt;

namespace DeliveryPlatform.Api.Services.Implementations;

public class AuthService : IAuthService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;

    public AuthService(ApplicationDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    public async Task<string?> RegisterAsync(RegisterRequest request)
    {
        if (await _context.Users.AnyAsync(u => u.Email == request.Email))
        {
            return "User already exists.";
        }

        var user = new User
        {
            FullName = request.FullName,
            Email = request.Email,
            PasswordHash = BC.HashPassword(request.Password),
            Role = request.Role,
            Phone = request.Phone,
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        if (user.Role == "Driver")
        {
            _context.DriverDetails.Add(new DriverDetail { UserId = user.Id });
            await _context.SaveChangesAsync();
        }

        return null; // No error
    }

    public async Task<AuthResponse?> LoginAsync(LoginRequest request)
    {
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == request.Email);
        if (user == null) return null;

        bool isPasswordValid = false;

        // 1. Try BCrypt
        try 
        {
            isPasswordValid = BC.Verify(request.Password, user.PasswordHash);
        }
        catch
        {
            // If it's not a BCrypt hash, it will throw an exception
            isPasswordValid = false;
        }

        // 2. Fallback to SHA256 for legacy users
        if (!isPasswordValid)
        {
            var sha256Hash = ComputeSha256Hash(request.Password);
            if (user.PasswordHash == sha256Hash)
            {
                isPasswordValid = true;
                // Upgrade to BCrypt automatically
                user.PasswordHash = BC.HashPassword(request.Password);
                await _context.SaveChangesAsync();
            }
        }

        if (!isPasswordValid) return null;

        var token = GenerateJwtToken(user);

        return new AuthResponse
        {
            Token = token,
            FullName = user.FullName,
            Role = user.Role
        };
    }

    private string ComputeSha256Hash(string password)
    {
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        return Convert.ToBase64String(hashedBytes);
    }

    private string GenerateJwtToken(User user)
    {
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["Jwt:Key"] ?? "superSecretKey12345678901234567890"));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("FullName", user.FullName)
        };

        var token = new JwtSecurityToken(
            _configuration["Jwt:Issuer"] ?? "DeliveryPlatform",
            _configuration["Jwt:Audience"] ?? "DeliveryPlatform",
            claims,
            expires: DateTime.Now.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
