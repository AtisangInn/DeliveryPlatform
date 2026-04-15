using DeliveryPlatform.Api.Models;
using DeliveryPlatform.Api.Controllers;

namespace DeliveryPlatform.Api.Services.Interfaces;

public interface IOrderService
{
    Task<CheckoutResponse> CheckoutAsync(CheckoutRequest request, int customerId, string customerEmail);
    Task<List<Order>> GetOrdersAsync(int userId, string role);
    Task<bool> AcceptOrderAsync(int orderId, int driverId);
    Task<bool> UpdateStatusAsync(int orderId, int driverId, string status);
}
