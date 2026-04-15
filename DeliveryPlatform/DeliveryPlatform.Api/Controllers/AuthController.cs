using Microsoft.AspNetCore.Mvc;
using DeliveryPlatform.Api.Models;
using DeliveryPlatform.Api.Services.Interfaces;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var error = await _authService.RegisterAsync(request);
        if (error != null)
        {
            return BadRequest(error);
        }

        return Ok("Registration successful");
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var response = await _authService.LoginAsync(request);
        if (response == null)
        {
            return Unauthorized("Invalid credentials.");
        }
        
        return Ok(response);
    }
}
