namespace DeliveryPlatform.Api.Models;

public class MenuItem
{
    public int Id { get; set; }
    public int MerchantId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public bool IsAvailable { get; set; } = true;
    public string ImageUrl { get; set; } = string.Empty;

    // Navigation properties
    public Merchant? Merchant { get; set; }
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
}
