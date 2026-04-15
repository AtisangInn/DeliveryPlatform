namespace DeliveryPlatform.Api.Models;

public class DriverDetail
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string VehicleType { get; set; } = string.Empty; // Motorbike, Car, Bicycle
    public string LicensePlate { get; set; } = string.Empty;
    public bool IsOnline { get; set; } = false;
    public string PayMode { get; set; } = "PerDelivery"; // PerDelivery, Shift

    // Navigation properties
    public User? User { get; set; }
}
