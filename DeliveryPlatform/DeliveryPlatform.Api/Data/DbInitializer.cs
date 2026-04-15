using DeliveryPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using BC = BCrypt.Net.BCrypt;

namespace DeliveryPlatform.Api.Data;

public static class DbInitializer
{
    public static async Task Seed(ApplicationDbContext context)
    {
        await context.Database.MigrateAsync();

        // 1. Seed Users (Idempotent check)
        if (!await context.Users.AnyAsync(u => u.Email == "customer@example.com"))
        {
            var customer = new User
            {
                FullName = "Customer User",
                Email = "customer@example.com",
                PasswordHash = BC.HashPassword("password123"),
                Role = "Customer",
                Phone = "0112223333",
                CreatedAt = DateTime.UtcNow
            };
            context.Users.Add(customer);
        }

        if (!await context.Users.AnyAsync(u => u.Email == "driver@example.com"))
        {
            var driver = new User
            {
                FullName = "Driver User",
                Email = "driver@example.com",
                PasswordHash = BC.HashPassword("password123"),
                Role = "Driver",
                Phone = "0114445555",
                CreatedAt = DateTime.UtcNow
            };
            context.Users.Add(driver);
            await context.SaveChangesAsync();
            context.DriverDetails.Add(new DriverDetail { UserId = driver.Id });
        }

        if (!await context.Users.AnyAsync(u => u.Email == "admin@example.com"))
        {
            var admin = new User
            {
                FullName = "Platform Admin",
                Email = "admin@example.com",
                PasswordHash = BC.HashPassword("password123"),
                Role = "Admin",
                Phone = "0119998888",
                CreatedAt = DateTime.UtcNow
            };
            context.Users.Add(admin);
        }

        await context.SaveChangesAsync();

        // 3. Seed Merchants
        if (!await context.Merchants.AnyAsync())
        {
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
}
