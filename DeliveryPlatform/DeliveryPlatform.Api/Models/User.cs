namespace DeliveryPlatform.Api.Models;

public class User
{
    public int Id { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = "Customer"; // Admin, Customer, Driver
    public string Phone { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public ICollection<Order> PlacedOrders { get; set; } = new List<Order>();
    public ICollection<Order> DeliveredOrders { get; set; } = new List<Order>();
    public DriverDetail? DriverDetail { get; set; }
}
