using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

namespace DeliveryPlatform.Api.Hubs;

[Authorize]
public class OrderHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        if (role == "Driver")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "Drivers");
        }
        
        if (role == "Admin")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "Admins");
        }
        
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        if (role == "Driver")
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "Drivers");
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task UpdateDriverLocation(int orderId, double lat, double lng)
    {
        // 1. Find the customer for this order
        // In a real app, we'd look this up in the DB or a cache
        // For now, we'll broadcast to the group associated with the OrderId or just the customer
        // Let's assume the client knows the customerId to target, or we fetch it
        // Simpler for this demo: broadcast to everyone, and clients filter by orderId
        // Or better: Broadcast to "Order_{orderId}" group
        // Broadcast to the Admins group (for command center) and others (for the specific customer)
        await Clients.Group("Admins").SendAsync("DriverLocationUpdated", new { OrderId = orderId, Lat = lat, Lng = lng });
        await Clients.Others.SendAsync("DriverLocationUpdated", new { OrderId = orderId, Lat = lat, Lng = lng });
    }
}
