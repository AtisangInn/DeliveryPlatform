using Microsoft.EntityFrameworkCore;

namespace DeliveryPlatform.Api.Data;

using DeliveryPlatform.Api.Models;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Merchant> Merchants { get; set; }
    public DbSet<MenuItem> MenuItems { get; set; }
    public DbSet<Order> Orders { get; set; }
    public DbSet<OrderItem> OrderItems { get; set; }
    public DbSet<Payment> Payments { get; set; }
    public DbSet<DriverDetail> DriverDetails { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure relations for Order
        modelBuilder.Entity<Order>()
            .HasOne(o => o.Customer)
            .WithMany(u => u.PlacedOrders)
            .HasForeignKey(o => o.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
            .HasOne(o => o.Driver)
            .WithMany(u => u.DeliveredOrders)
            .HasForeignKey(o => o.DriverId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Order>()
            .HasOne(o => o.Merchant)
            .WithMany(m => m.Orders)
            .HasForeignKey(o => o.MerchantId)
            .OnDelete(DeleteBehavior.Restrict);

        // Configure 1-to-1 for User and DriverDetail
        modelBuilder.Entity<DriverDetail>()
            .HasOne(d => d.User)
            .WithOne(u => u.DriverDetail)
            .HasForeignKey<DriverDetail>(d => d.UserId)
            .OnDelete(DeleteBehavior.Cascade);
            
        // Decimal precision configurations
        modelBuilder.Entity<MenuItem>()
            .Property(m => m.Price)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Order>()
            .Property(o => o.TotalAmount)
            .HasPrecision(18, 2);

        modelBuilder.Entity<OrderItem>()
            .Property(o => o.UnitPrice)
            .HasPrecision(18, 2);

        modelBuilder.Entity<Payment>()
            .Property(p => p.Amount)
            .HasPrecision(18, 2);
            
        modelBuilder.Entity<Merchant>()
            .Property(m => m.CommissionPercentage)
            .HasPrecision(5, 2);
    }
}
