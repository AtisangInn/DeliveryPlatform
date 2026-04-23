using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using DeliveryPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class UsersController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public UsersController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("customers")]
    public async Task<IActionResult> GetCustomers()
    {
        var customers = await _context.Users
            .Where(u => u.Role == "Customer")
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new {
                u.Id,
                u.FullName,
                u.Email,
                u.Phone,
                u.CreatedAt
            })
            .ToListAsync();
        return Ok(customers);
    }

    [HttpGet("drivers")]
    public async Task<IActionResult> GetDrivers()
    {
        var drivers = await _context.Users
            .Where(u => u.Role == "Driver")
            .Include(u => u.DriverDetail)
            .OrderByDescending(u => u.CreatedAt)
            .Select(u => new {
                u.Id,
                u.FullName,
                u.Email,
                u.Phone,
                u.CreatedAt,
                VehicleType = u.DriverDetail != null ? u.DriverDetail.VehicleType : "Unknown"
            })
            .ToListAsync();
        return Ok(drivers);
    }
}
