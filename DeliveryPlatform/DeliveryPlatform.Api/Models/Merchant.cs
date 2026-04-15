namespace DeliveryPlatform.Api.Models;

public class Merchant
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string StreetName { get; set; } = string.Empty;
    public string StreetNumber { get; set; } = string.Empty;
    public double Latitude { get; set; } = -26.17; // Default to Kagiso
    public double Longitude { get; set; } = 27.78;
    public decimal CommissionPercentage { get; set; } = 10.0m;
    public bool IsActive { get; set; } = true;
    public string LogoUrl { get; set; } = string.Empty;

    // Navigation properties
    public ICollection<MenuItem> MenuItems { get; set; } = new List<MenuItem>();
    public ICollection<Order> Orders { get; set; } = new List<Order>();
}
