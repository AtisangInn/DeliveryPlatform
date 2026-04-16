using DeliveryPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using BC = BCrypt.Net.BCrypt;

namespace DeliveryPlatform.Api.Data;

public static class DbInitializer
{
    public static async Task Seed(ApplicationDbContext context)
    {
        await context.Database.MigrateAsync();

        // 1. Seed Admin
        if (!await context.Users.AnyAsync(u => u.Email == "tlhoweatisang@gmail.com"))
        {
            var admin = new User
            {
                FullName = "Atisang T",
                Email = "tlhoweatisang@gmail.com",
                PasswordHash = BC.HashPassword("EasywayAdmin2026!"),
                Role = "Admin",
                Phone = "0762123888",
                CreatedAt = DateTime.UtcNow
            };
            context.Users.Add(admin);
        }

        // 2. Seed Driver (Gmail alias - still goes to same inbox)
        if (!await context.Users.AnyAsync(u => u.Email == "tlhoweatisang+driver@gmail.com"))
        {
            var driver = new User
            {
                FullName = "Atisang Tlhowe",
                Email = "tlhoweatisang+driver@gmail.com",
                PasswordHash = BC.HashPassword("Easyway2026!"),
                Role = "Driver",
                Phone = "0762123888",
                CreatedAt = DateTime.UtcNow
            };
            context.Users.Add(driver);
            await context.SaveChangesAsync();
            context.DriverDetails.Add(new DriverDetail { UserId = driver.Id, VehicleType = "Motorbike" });
        }

        await context.SaveChangesAsync();

        // 3. Seed Merchant: 1754 Eats
        if (!await context.Merchants.AnyAsync())
        {
            var merchant = new Merchant
            {
                Name = "1754 Eats",
                Category = "Fast Food",
                Address = "15522 Joseph Molatloa Street, Ext 12, Kagiso",
                Latitude = -26.1552,
                Longitude = 27.7781,
                IsActive = true,
                CommissionPercentage = 10.00m
            };
            context.Merchants.Add(merchant);
            await context.SaveChangesAsync();

            // 4. Seed Menu Items with Categories
            context.MenuItems.AddRange(
                // Kotas
                new MenuItem { MerchantId = merchant.Id, Name = "Kota 1", Price = 45.00m, Description = "Beef patty, lettuce, tomato, cheese", Category = "Kotas", IsAvailable = true },
                new MenuItem { MerchantId = merchant.Id, Name = "Kota 2", Price = 65.00m, Description = "Double beef, cheese, onion rings", Category = "Kotas", IsAvailable = true },
                // Chips
                new MenuItem { MerchantId = merchant.Id, Name = "Chips (Small)", Price = 25.00m, Description = "Golden crispy chips", Category = "Chips", IsAvailable = true },
                new MenuItem { MerchantId = merchant.Id, Name = "Chips (Medium)", Price = 45.00m, Description = "Golden crispy chips", Category = "Chips", IsAvailable = true },
                new MenuItem { MerchantId = merchant.Id, Name = "Chips (Large)", Price = 75.00m, Description = "Golden crispy chips", Category = "Chips", IsAvailable = true },
                // Drinks
                new MenuItem { MerchantId = merchant.Id, Name = "Coke 500ml", Price = 18.00m, Description = "Ice cold Coca-Cola", Category = "Drinks", IsAvailable = true },
                new MenuItem { MerchantId = merchant.Id, Name = "Kingsly 500ml", Price = 18.00m, Description = "Refreshing Kingsly water", Category = "Drinks", IsAvailable = true }
            );
            await context.SaveChangesAsync();
        }
    }
}
