using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System.IO;
using System.Threading.Tasks;
using System;
using Microsoft.AspNetCore.Authorization;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class UploadController : ControllerBase
{
    private readonly IWebHostEnvironment _environment;

    public UploadController(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    [Authorize(Roles = "Admin")]
    [HttpPost]
    public async Task<IActionResult> UploadImage(IFormFile file)
    {
        if (file == null || file.Length == 0)
        {
            return BadRequest("No file uploaded.");
        }

        var uploadsFolder = Path.Combine(_environment.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot"), "uploads");
        
        if (!Directory.Exists(uploadsFolder))
        {
            Directory.CreateDirectory(uploadsFolder);
        }

        var uniqueFileName = Guid.NewGuid().ToString() + "_" + Path.GetFileName(file.FileName);
        var filePath = Path.Combine(uploadsFolder, uniqueFileName);

        using (var fileStream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(fileStream);
        }

        // Return the relative URL starting with /uploads/
        var fileUrl = $"/uploads/{uniqueFileName}";
        
        // Ensure the full absolute URL is returned if needed, 
        // but typically a relative URL is sufficient if the frontend prepends the API base URL.
        // For absolute URL:
        var request = HttpContext.Request;
        var baseUrl = $"{request.Scheme}://{request.Host}";
        var fullUrl = $"{baseUrl}{fileUrl}";

        return Ok(new { url = fullUrl, relativeUrl = fileUrl });
    }
}
