using DeliveryPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using BC = BCrypt.Net.BCrypt;

namespace DeliveryPlatform.Api.Data;

public static class DbInitializer
{
    public static async Task Seed(ApplicationDbContext context)
    {
        await context.Database.EnsureCreatedAsync();

        if (await context.Users.AnyAsync()) return; // Already seeded

        // 1. Seed Users
        var customer = new User
        {
            FullName = "Customer User",
            Email = "customer@example.com",
            PasswordHash = BC.HashPassword("password123"),
            Role = "Customer",
            Phone = "0112223333",
            CreatedAt = DateTime.UtcNow
        };

        var driver = new User
        {
            FullName = "Driver User",
            Email = "driver@example.com",
            PasswordHash = BC.HashPassword("password123"),
            Role = "Driver",
            Phone = "0114445555",
            CreatedAt = DateTime.UtcNow
        };

        context.Users.AddRange(customer, driver);
        await context.SaveChangesAsync();

        // 2. Seed Driver Details
        context.DriverDetails.Add(new DriverDetail { UserId = driver.Id });

        // 3. Seed Merchants
        var merchant = new Merchant
        {
            Name = "Kagiso Grill & Burger",
            Category = "Fast Food",
            Address = "12 Main St, Kagiso",
            IsActive = true,
            CommissionPercentage = 15.00m
        };
        context.Merchants.Add(merchant);
        await context.SaveChangesAsync();

        // 4. Seed Menu Items
        context.MenuItems.AddRange(
            new MenuItem { MerchantId = merchant.Id, Name = "Classic Beef Burger", Price = 85.00m, Description = "Flame grilled beef patty with cheese", IsAvailable = true },
            new MenuItem { MerchantId = merchant.Id, Name = "Large Fries", Price = 35.00m, Description = "Golden crispy fries", IsAvailable = true },
            new MenuItem { MerchantId = merchant.Id, Name = "Coke 330ml", Price = 20.00m, Description = "Ice cold refreshment", IsAvailable = true }
        );

        await context.SaveChangesAsync();
    }
}
