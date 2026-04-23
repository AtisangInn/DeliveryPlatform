using DeliveryPlatform.Api.Data;
using DeliveryPlatform.Api.Models;
using DeliveryPlatform.Api.Controllers;
using DeliveryPlatform.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace DeliveryPlatform.Api.Services.Implementations;

public class OrderService : IOrderService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _config;
    private readonly IHubContext<Hubs.OrderHub> _hubContext;

    public OrderService(ApplicationDbContext context, IConfiguration config, IHubContext<Hubs.OrderHub> hubContext)
    {
        _context = context;
        _config = config;
        _hubContext = hubContext;
    }

    public async Task<CheckoutResponse> CheckoutAsync(CheckoutRequest request, int customerId, string customerEmail)
    {
        // 0. Verify customer exists (Prevents stale session FK errors)
        var customerExists = await _context.Users.AnyAsync(u => u.Id == customerId);
        if (!customerExists) throw new Exception("User session has expired. Please log out and log in again.");

        // 1. Validate items and calculate total from DB prices (Security Hardening)
        var menuItemIds = request.Items.Select(i => i.MenuItemId).ToList();
        var menuItems = await _context.MenuItems
            .Where(mi => menuItemIds.Contains(mi.Id) && mi.MerchantId == request.MerchantId)
            .ToDictionaryAsync(mi => mi.Id);

        decimal subtotal = 0;
        var orderItems = new List<OrderItem>();

        foreach (var item in request.Items)
        {
            if (!menuItems.TryGetValue(item.MenuItemId, out var menuItem))
            {
                throw new Exception($"Menu item {item.MenuItemId} not found or belongs to another merchant.");
            }

            subtotal += menuItem.Price * item.Quantity;
            orderItems.Add(new OrderItem
            {
                MenuItemId = item.MenuItemId,
                Quantity = item.Quantity,
                UnitPrice = menuItem.Price // Use DB price, not request price
            });
        }

        decimal deliveryFee = 35.00m;
        decimal totalAmount = subtotal + deliveryFee;

        // 2. Save Order
        var order = new Order
        {
            CustomerId = customerId,
            MerchantId = request.MerchantId,
            TotalAmount = totalAmount,
            DeliveryAddress = request.DeliveryAddress,
            DeliveryLatitude = request.DeliveryLatitude,
            DeliveryLongitude = request.DeliveryLongitude,
            Status = "PendingPayment",
            CreatedAt = DateTime.UtcNow,
            OrderItems = orderItems
        };

        _context.Orders.Add(order);
        await _context.SaveChangesAsync();

        // 3. Generate PayFast Form
        var pfMerchantId = _config["PayFast:MerchantId"];
        var pfMerchantKey = _config["PayFast:MerchantKey"];
        var pfUrl = _config["PayFast:Url"];
        
        var frontendUrl = _config["Deployment:FrontendUrl"]?.TrimEnd('/');
        var backendUrl = _config["Deployment:BackendUrl"]?.TrimEnd('/');

        // Correct URLs for production: Redirect back to the Customer App UI
        var returnUrl = $"{frontendUrl}/index.html?status=success&orderId={order.Id}"; 
        var cancelUrl = $"{frontendUrl}/index.html?status=cancel";
        var notifyUrl = $"{backendUrl}/api/Payment/itn"; // ITN stays on backend
        var htmlForm = $@"
            <form id='payfast-form' action='{pfUrl}' method='post'>
                <input type='hidden' name='merchant_id' value='{pfMerchantId}'>
                <input type='hidden' name='merchant_key' value='{pfMerchantKey}'>
                <input type='hidden' name='return_url' value='{returnUrl}'>
                <input type='hidden' name='cancel_url' value='{cancelUrl}'>
                <input type='hidden' name='notify_url' value='{notifyUrl}'>
                <input type='hidden' name='amount' value='{totalAmount:F2}'>
                <input type='hidden' name='item_name' value='Delivery Order #{order.Id}'>
                <input type='hidden' name='m_payment_id' value='{order.Id}'>
                <input type='hidden' name='email_address' value='{customerEmail}'>
            </form>
            <script>document.getElementById('payfast-form').submit();</script>";

        return new CheckoutResponse
        {
            OrderId = order.Id,
            TotalAmount = totalAmount,
            PaymentHtmlForm = htmlForm
        };
    }

    public async Task<List<Order>> GetOrdersAsync(int userId, string role)
    {
        IQueryable<Order> query = _context.Orders
            .Include(o => o.Merchant)
            .Include(o => o.Customer)
            .Include(o => o.Driver)
            .Include(o => o.OrderItems);

        if (role == "Customer") query = query.Where(o => o.CustomerId == userId);
        if (role == "Driver") query = query.Where(o => o.DriverId == userId || o.Status == "Paid");

        return await query.OrderByDescending(o => o.CreatedAt).ToListAsync();
    }

    public async Task<bool> AcceptOrderAsync(int orderId, int driverId)
    {
        // Atomic update: only update if DriverId is still null and Status is 'Paid'
        // This is the "First-to-Claim" engine.
        var rowsAffected = await _context.Orders
            .Where(o => o.Id == orderId && o.DriverId == null && o.Status == "Paid")
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(o => o.DriverId, driverId)
                .SetProperty(o => o.Status, "Assigned"));

        if (rowsAffected == 0) return false;

        // Fetch the updated order for broadcasting
        var order = await _context.Orders
            .Include(o => o.Merchant)
            .FirstOrDefaultAsync(o => o.Id == orderId);

        if (order == null) return false;

        var broadcastData = new {
            OrderId = order.Id,
            Status = order.Status,
            DriverId = driverId,
            Merchant = new {
                Name = order.Merchant?.Name,
                Lat = order.Merchant?.Latitude,
                Lng = order.Merchant?.Longitude
            },
            Customer = new {
                Lat = order.DeliveryLatitude,
                Lng = order.DeliveryLongitude
            }
        };

        await _hubContext.Clients.Group($"User_{order.CustomerId}").SendAsync("StatusUpdated", broadcastData);
        await _hubContext.Clients.Group($"Order_{order.Id}").SendAsync("StatusUpdated", broadcastData);
        await _hubContext.Clients.Group("Admins").SendAsync("StatusUpdated", broadcastData);
        
        // Notify all drivers that this order is no longer available
        await _hubContext.Clients.Group("Drivers").SendAsync("OrderClaimed", new { OrderId = orderId });

        return true;
    }

    public async Task<bool> UpdateStatusAsync(int orderId, int driverId, string status)
    {
        var order = await _context.Orders
            .Include(o => o.Merchant)
            .FirstOrDefaultAsync(o => o.Id == orderId);
        
        if (order == null || order.DriverId != driverId) return false;

        // Basic state validation
        var validStatuses = new[] { "Preparing", "PickedUp", "OutForDelivery", "Delivered" };
        if (!validStatuses.Contains(status)) return false;

        order.Status = status;
        await _context.SaveChangesAsync();

        var broadcastData = new {
            OrderId = order.Id,
            Status = order.Status,
            Merchant = new {
                Name = order.Merchant?.Name,
                Lat = order.Merchant?.Latitude,
                Lng = order.Merchant?.Longitude
            },
            Customer = new {
                Lat = order.DeliveryLatitude,
                Lng = order.DeliveryLongitude
            }
        };

        await _hubContext.Clients.Group($"User_{order.CustomerId}").SendAsync("StatusUpdated", broadcastData);
        await _hubContext.Clients.Group($"Order_{order.Id}").SendAsync("StatusUpdated", broadcastData);
        await _hubContext.Clients.Group("Admins").SendAsync("StatusUpdated", broadcastData);

        return true;
    }
}
