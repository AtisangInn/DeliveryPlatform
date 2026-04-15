using Microsoft.AspNetCore.Mvc;
using DeliveryPlatform.Api.Data;
using DeliveryPlatform.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MerchantController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public MerchantController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetMerchants()
    {
        return Ok(await _context.Merchants.Where(m => m.IsActive).ToListAsync());
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetMerchant(int id)
    {
        var merchant = await _context.Merchants.Include(m => m.MenuItems).FirstOrDefaultAsync(m => m.Id == id);
        if (merchant == null) return NotFound();
        return Ok(merchant);
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> CreateMerchant(Merchant merchant)
    {
        _context.Merchants.Add(merchant);
        await _context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetMerchant), new { id = merchant.Id }, merchant);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateMerchant(int id, Merchant merchant)
    {
        if (id != merchant.Id) return BadRequest();
        _context.Entry(merchant).State = EntityState.Modified;
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
