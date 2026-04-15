namespace DeliveryPlatform.Api.Models;

public class Payment
{
    public int Id { get; set; }
    public int OrderId { get; set; }
    public string PayFastReference { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    
    // Status: Pending, Success, Failed
    public string Status { get; set; } = "Pending"; 
    public DateTime? PaidAt { get; set; }

    // Navigation properties
    public Order? Order { get; set; }
}
