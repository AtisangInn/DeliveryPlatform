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

        // 5. Seed Merchant: Kitchen Hooligans
        if (!await context.Merchants.AnyAsync(m => m.Name == "Kitchen Hooligans"))
        {
            var hooligans = new Merchant
            {
                Name = "Kitchen Hooligans",
                Category = "Fast Food",
                Address = "Kagiso",
                Latitude = -26.1600,
                Longitude = 27.7800,
                IsActive = true,
                CommissionPercentage = 10.00m
            };
            context.Merchants.Add(hooligans);
            await context.SaveChangesAsync();

            context.MenuItems.AddRange(
                // Hooligan Buns
                new MenuItem { MerchantId = hooligans.Id, Name = "Classic Bun", Price = 42.00m, Description = "Chips with Cheddar cheese, egg & ham", Category = "Hooligan Buns", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Bacon Strips Bun", Price = 55.00m, Description = "Double bacon strips with cheddar cheese, egg & ham", Category = "Hooligan Buns", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Beef Burger Bun", Price = 60.00m, Description = "100g beef patty with cheddar cheese, egg & ham", Category = "Hooligan Buns", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Chicken Fillet Bun", Price = 65.00m, Description = "Crumbed chicken fillet with egg, cheddar & mozzarella cheese", Category = "Hooligan Buns", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Rib Burger Bun", Price = 65.00m, Description = "100g Rib burger with cheddar cheese, egg & ham", Category = "Hooligan Buns", IsAvailable = true },
                
                // Hooligan Kotas
                new MenuItem { MerchantId = hooligans.Id, Name = "Vienna Kota", Price = 35.00m, Description = "Classically served with chips, cheese, egg, lettuce and special sauce", Category = "Hooligan Kotas", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Russian Kota", Price = 40.00m, Description = "Classically served with chips, cheese, egg, lettuce and special sauce", Category = "Hooligan Kotas", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Vienna & Russian Kota", Price = 46.00m, Description = "Classically served with chips, cheese, egg, lettuce and special sauce", Category = "Hooligan Kotas", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Vienna & Cheese griller Kota", Price = 50.00m, Description = "Classically served with chips, cheese, egg, lettuce and special sauce", Category = "Hooligan Kotas", IsAvailable = true },
                
                // Hooligan Kids
                new MenuItem { MerchantId = hooligans.Id, Name = "Beef Wrap", Price = 50.00m, Description = "Beef patty wrap with cheddar cheese, egg & chips", Category = "Hooligan Kids", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Chicken Wrap", Price = 55.00m, Description = "Chicken fillet wrap with mozzarella cheese & chips", Category = "Hooligan Kids", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Snack Box", Price = 55.00m, Description = "2x full viennas, a serving of chicken nuggets (x6) & chips", Category = "Hooligan Kids", IsAvailable = true },
                
                // Chips Menu
                new MenuItem { MerchantId = hooligans.Id, Name = "Medium Plain Chips", Price = 35.00m, Description = "Plain Chips", Category = "Chips Menu", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Large Plain Chips", Price = 60.00m, Description = "Plain Chips", Category = "Chips Menu", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Jalapeno & Cheese Loaded Chips", Price = 30.00m, Description = "Loaded Chips", Category = "Chips Menu", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Bacon & Cheese Loaded Chips", Price = 35.00m, Description = "Loaded Chips", Category = "Chips Menu", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Chicken nuggets & Cheese Loaded Chips", Price = 45.00m, Description = "Loaded Chips", Category = "Chips Menu", IsAvailable = true },
                
                // Extras
                new MenuItem { MerchantId = hooligans.Id, Name = "Ham Extra", Price = 5.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Egg Extra", Price = 5.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Pineapple Extra", Price = 8.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Jalapeno Extra", Price = 8.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Cheddar cheese Extra", Price = 10.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Mozzarella Cheese Extra", Price = 12.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Bacon strip Extra", Price = 12.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Vienna Extra", Price = 20.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Russian Extra", Price = 22.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Beef burger Extra", Price = 25.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Cheese griller Extra", Price = 25.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Chicken fillet Extra", Price = 32.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Rib burger Extra", Price = 35.00m, Description = "Extra", Category = "Extras", IsAvailable = true },
                new MenuItem { MerchantId = hooligans.Id, Name = "Chicken Nuggets (x6) Extra", Price = 30.00m, Description = "Extra", Category = "Extras", IsAvailable = true }
            );
            await context.SaveChangesAsync();
        }

        // 6. Seed Merchant: K & D Delight
        if (!await context.Merchants.AnyAsync(m => m.Name == "K and D Delight"))
        {
            var kdDelight = new Merchant
            {
                Name = "K and D Delight",
                Category = "Fast Food",
                Address = "5853 Motsivedi Drive",
                Latitude = -26.1650,
                Longitude = 27.7850,
                IsActive = true,
                CommissionPercentage = 10.00m
            };
            context.Merchants.Add(kdDelight);
            await context.SaveChangesAsync();

            context.MenuItems.AddRange(
                // Dagwood Menu
                new MenuItem { MerchantId = kdDelight.Id, Name = "Single Beef Dagwood", Price = 55.00m, Description = "Single Beef Patty, Cheese, Ham, Caramelized Onions, tomato + Chips", Category = "Dagwood Menu", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Double Beef Dagwood", Price = 70.00m, Description = "Double Patty, cheese, Ham, egg, caramelised onion+Tomato + Chips", Category = "Dagwood Menu", IsAvailable = true },
                
                // Burger Menu
                new MenuItem { MerchantId = kdDelight.Id, Name = "Single Cheese Burger", Price = 65.00m, Description = "Single Cheese Burger", Category = "Burger Menu", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Double Cheese Burger", Price = 80.00m, Description = "Double cheese Burger", Category = "Burger Menu", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Double Beef Smash Burger", Price = 120.00m, Description = "Double Beef Smash Burger", Category = "Burger Menu", IsAvailable = true },
                
                // Wings and Chips
                new MenuItem { MerchantId = kdDelight.Id, Name = "4pc Wings + Chips", Price = 70.00m, Description = "4pc Wings + Chips", Category = "Wings and Chips", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "8pc Wings + Chips", Price = 130.00m, Description = "8pc Wings + Chips", Category = "Wings and Chips", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "12pc Wings + Chips", Price = 180.00m, Description = "12pc Wings + Chips", Category = "Wings and Chips", IsAvailable = true },
                
                // Burger Combos
                new MenuItem { MerchantId = kdDelight.Id, Name = "Burger Combo 1", Price = 165.00m, Description = "Double Beef Burger + 6pc Wings + Chips+Cooldrink", Category = "Burger Combos", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Burger Combo 2", Price = 150.00m, Description = "Smash Burger + 4pcs Wings + Chips", Category = "Burger Combos", IsAvailable = true },
                
                // Platters
                new MenuItem { MerchantId = kdDelight.Id, Name = "Platter 1", Price = 250.00m, Description = "Two Double fully loaded burger + Chips + 8pcs wings + 2 liter Cooldrink", Category = "Platters", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Platter 2", Price = 300.00m, Description = "2 Double Smash Burgers + 8pcs Wings + Chips + 2 Liter Cooldrink", Category = "Platters", IsAvailable = true },
                
                // Dagwood combos
                new MenuItem { MerchantId = kdDelight.Id, Name = "Dagwood combo 1", Price = 120.00m, Description = "Double beef dagwood + chips and 4pc wings", Category = "Dagwood combos", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Dagwood combo 2", Price = 265.00m, Description = "2 Fully loaded Double Beef Dagwood + 8pcs Wings + Chips", Category = "Dagwood combos", IsAvailable = true },
                
                // Mix and Match
                new MenuItem { MerchantId = kdDelight.Id, Name = "Mix and Match 1", Price = 325.00m, Description = "Smash Burger + Fully loaded Dagwood + Double beef burger 12pcs wings + Chips + Cooldrink 2 liter", Category = "Mix and Match", IsAvailable = true },
                new MenuItem { MerchantId = kdDelight.Id, Name = "Mix and Match 2", Price = 350.00m, Description = "2 Single Cheese burgers + 2 fully loaded double Burger + 12pc wings + 2liter cooldrink", Category = "Mix and Match", IsAvailable = true }
            );
            await context.SaveChangesAsync();
        }
    }
}
