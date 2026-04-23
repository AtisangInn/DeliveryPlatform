using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using DeliveryPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DeliveryPlatform.Api.Hubs;

[Authorize]
public class OrderHub : Hub
{
    private readonly ApplicationDbContext _db;

    public OrderHub(ApplicationDbContext db)
    {
        _db = db;
    }

    public override async Task OnConnectedAsync()
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        var userIdStr = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);

        if (role == "Driver")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "Drivers");
        }
        
        if (role == "Admin")
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "Admins");
        }
        
        if (int.TryParse(userIdStr, out int userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
            
            // STATE-SYNC: Push current active state to the user on connection
            await SyncUserState(userId, role);
        }

        await base.OnConnectedAsync();
    }

    private async Task SyncUserState(int userId, string? role)
    {
        if (role == "Driver")
        {
            // Find if this driver has an active assigned job
            var activeJob = await _db.Orders
                .Include(o => o.Merchant)
                .Include(o => o.Customer)
                .Where(o => o.DriverId == userId && o.Status != "Delivered" && o.Status != "Cancelled")
                .FirstOrDefaultAsync();

            if (activeJob != null)
            {
                await Clients.Caller.SendAsync("SyncState", new {
                    Type = "ActiveJob",
                    Data = new {
                        OrderId = activeJob.Id,
                        Status = activeJob.Status,
                        MerchantName = activeJob.Merchant?.Name,
                        MerchantLat = activeJob.Merchant?.Latitude,
                        MerchantLng = activeJob.Merchant?.Longitude,
                        DeliveryAddress = activeJob.DeliveryAddress,
                        DeliveryLat = activeJob.DeliveryLatitude,
                        DeliveryLng = activeJob.DeliveryLongitude,
                        CustomerName = activeJob.Customer?.FullName,
                        CustomerPhone = activeJob.Customer?.Phone
                    }
                });
            }
        }
        else if (role == "Customer")
        {
            // Find active orders for this customer
            var activeOrders = await _db.Orders
                .Where(o => o.CustomerId == userId && o.Status != "Delivered" && o.Status != "Cancelled")
                .Select(o => new { o.Id, o.Status })
                .ToListAsync();

            if (activeOrders.Any())
            {
                await Clients.Caller.SendAsync("SyncState", new {
                    Type = "ActiveOrders",
                    Data = activeOrders
                });
            }
        }
    }

    public async Task JoinOrder(int orderId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"Order_{orderId}");
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
        await Clients.Group("Admins").SendAsync("DriverLocationUpdated", new { OrderId = orderId, Lat = lat, Lng = lng });
        await Clients.OthersInGroup($"Order_{orderId}").SendAsync("DriverLocationUpdated", new { OrderId = orderId, Lat = lat, Lng = lng });
    }
}
