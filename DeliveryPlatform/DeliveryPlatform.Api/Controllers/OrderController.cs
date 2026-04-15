using Microsoft.AspNetCore.Mvc;
using DeliveryPlatform.Api.Models;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using DeliveryPlatform.Api.Services.Interfaces;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrderController : ControllerBase
{
    private readonly IOrderService _orderService;

    public OrderController(IOrderService orderService)
    {
        _orderService = orderService;
    }

    [Authorize(Roles = "Customer")]
    [HttpPost("checkout")]
    public async Task<IActionResult> Checkout(CheckoutRequest request)
    {
        var customerId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var customerEmail = User.FindFirstValue(ClaimTypes.Email)!;

        try 
        {
            var response = await _orderService.CheckoutAsync(request, customerId, customerEmail);
            return Ok(response);
        }
        catch (Exception ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [Authorize]
    [HttpGet]
    public async Task<IActionResult> GetMyOrders()
    {
        var userId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var role = User.FindFirstValue(ClaimTypes.Role)!;

        var orders = await _orderService.GetOrdersAsync(userId, role);
        return Ok(orders);
    }

    [Authorize(Roles = "Driver")]
    [HttpPut("{id}/accept")]
    public async Task<IActionResult> AcceptOrder(int id)
    {
        var driverId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var success = await _orderService.AcceptOrderAsync(id, driverId);
        
        if (!success) return BadRequest("Order already taken or invalid.");
        return Ok();
    }

    [Authorize(Roles = "Driver")]
    [HttpPut("{id}/status")]
    public async Task<IActionResult> UpdateStatus(int id, [FromBody] StatusUpdateRequest request)
    {
        var driverId = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var success = await _orderService.UpdateStatusAsync(id, driverId, request.Status);
        
        if (!success) return BadRequest("Update failed or invalid status.");
        return Ok();
    }
}
