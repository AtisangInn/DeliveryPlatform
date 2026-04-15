namespace DeliveryPlatform.Api.Models;

public class Order
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public int MerchantId { get; set; }
    public int? DriverId { get; set; }
    public decimal TotalAmount { get; set; }
    
    // Status: Pending, Paid, PickedUp, Delivered, Cancelled
    public string Status { get; set; } = "Pending"; 
    public string DeliveryAddress { get; set; } = string.Empty;
    public double DeliveryLatitude { get; set; } = -26.17; 
    public double DeliveryLongitude { get; set; } = 27.78;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation properties
    public User? Customer { get; set; }
    public Merchant? Merchant { get; set; }
    public User? Driver { get; set; }
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
    public Payment? Payment { get; set; }
}
