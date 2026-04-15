namespace DeliveryPlatform.Api.Models;

public class CheckoutRequest
{
    public int MerchantId { get; set; }
    public string DeliveryAddress { get; set; } = string.Empty;
    public List<CheckoutItem> Items { get; set; } = new();
}

public class CheckoutItem
{
    public int MenuItemId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal Price { get; set; }
}

public class CheckoutResponse
{
    public int OrderId { get; set; }
    public decimal TotalAmount { get; set; }
    public string PaymentHtmlForm { get; set; } = string.Empty;
}

public class StatusUpdateRequest {
    public string Status { get; set; } = string.Empty;
}
