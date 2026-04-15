using DeliveryPlatform.Api.Data;
using DeliveryPlatform.Api.Models;
using DeliveryPlatform.Api.Services.Implementations;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Security.Cryptography;
using System.Text;
using BC = BCrypt.Net.BCrypt;
using Xunit;

namespace DeliveryPlatform.Tests;

public class AuthServiceTests
{
    private ApplicationDbContext GetDbContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private IConfiguration GetConfiguration()
    {
        var myConfiguration = new Dictionary<string, string>
        {
            {"Jwt:Key", "test_secret_key_that_is_long_enough_123456789"},
            {"Jwt:Issuer", "TestIssuer"},
            {"Jwt:Audience", "TestAudience"}
        };

        return new ConfigurationBuilder()
            .AddInMemoryCollection(myConfiguration!)
            .Build();
    }

    [Fact]
    public async Task LoginAsync_WithValidBCryptPassword_ReturnsToken()
    {
        // Arrange
        var context = GetDbContext();
        var config = GetConfiguration();
        var service = new AuthService(context, config);

        var password = "password123";
        var user = new User
        {
            Email = "test@example.com",
            PasswordHash = BC.HashPassword(password),
            FullName = "Test User",
            Role = "Customer"
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        // Act
        var result = await service.LoginAsync(new LoginRequest { Email = user.Email, Password = password });

        // Assert
        Assert.NotNull(result);
        Assert.NotEmpty(result.Token);
        Assert.Equal(user.FullName, result.FullName);
    }

    [Fact]
    public async Task LoginAsync_WithValidLegacySha256Password_UpgradesAndReturnsToken()
    {
        // Arrange
        var context = GetDbContext();
        var config = GetConfiguration();
        var service = new AuthService(context, config);

        var password = "password123";
        // Manual SHA256 hash
        using var sha256 = SHA256.Create();
        var hashedBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password));
        var sha256Hash = Convert.ToBase64String(hashedBytes);

        var user = new User
        {
            Email = "legacy@example.com",
            PasswordHash = sha256Hash,
            FullName = "Legacy User",
            Role = "Customer"
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        // Act
        var result = await service.LoginAsync(new LoginRequest { Email = user.Email, Password = password });

        // Assert
        Assert.NotNull(result);
        Assert.NotEmpty(result.Token);
        
        // Verify upgrade to BCrypt
        var updatedUser = await context.Users.FirstAsync(u => u.Email == user.Email);
        Assert.True(BC.Verify(password, updatedUser.PasswordHash));
        Assert.NotEqual(sha256Hash, updatedUser.PasswordHash);
    }

    [Fact]
    public async Task LoginAsync_WithInvalidPassword_ReturnsNull()
    {
        // Arrange
        var context = GetDbContext();
        var config = GetConfiguration();
        var service = new AuthService(context, config);

        var user = new User
        {
            Email = "test@example.com",
            PasswordHash = BC.HashPassword("correct_password")
        };
        context.Users.Add(user);
        await context.SaveChangesAsync();

        // Act
        var result = await service.LoginAsync(new LoginRequest { Email = user.Email, Password = "wrong_password" });

        // Assert
        Assert.Null(result);
    }
}
