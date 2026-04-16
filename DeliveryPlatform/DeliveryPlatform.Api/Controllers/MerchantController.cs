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
        var merchants = await _context.Merchants
            .Include(m => m.MenuItems)
            .Where(m => m.IsActive)
            .ToListAsync();
        return Ok(merchants);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetMerchant(int id)
    {
        var merchant = await _context.Merchants
            .Include(m => m.MenuItems)
            .FirstOrDefaultAsync(m => m.Id == id);
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

    // ─── MENU ITEM CRUD ───

    [Authorize(Roles = "Admin")]
    [HttpPost("{merchantId}/menu")]
    public async Task<IActionResult> AddMenuItem(int merchantId, [FromBody] MenuItem item)
    {
        var merchant = await _context.Merchants.FindAsync(merchantId);
        if (merchant == null) return NotFound("Merchant not found");

        item.MerchantId = merchantId;
        _context.MenuItems.Add(item);
        await _context.SaveChangesAsync();
        return Ok(item);
    }

    [Authorize(Roles = "Admin")]
    [HttpPut("{merchantId}/menu/{itemId}")]
    public async Task<IActionResult> UpdateMenuItem(int merchantId, int itemId, [FromBody] MenuItem item)
    {
        var existing = await _context.MenuItems.FirstOrDefaultAsync(i => i.Id == itemId && i.MerchantId == merchantId);
        if (existing == null) return NotFound("Menu item not found");

        existing.Name = item.Name;
        existing.Price = item.Price;
        existing.Description = item.Description;
        existing.Category = item.Category;
        existing.IsAvailable = item.IsAvailable;
        existing.ImageUrl = item.ImageUrl;

        await _context.SaveChangesAsync();
        return Ok(existing);
    }

    [Authorize(Roles = "Admin")]
    [HttpDelete("{merchantId}/menu/{itemId}")]
    public async Task<IActionResult> DeleteMenuItem(int merchantId, int itemId)
    {
        var item = await _context.MenuItems.FirstOrDefaultAsync(i => i.Id == itemId && i.MerchantId == merchantId);
        if (item == null) return NotFound("Menu item not found");

        _context.MenuItems.Remove(item);
        await _context.SaveChangesAsync();
        return NoContent();
    }
}
