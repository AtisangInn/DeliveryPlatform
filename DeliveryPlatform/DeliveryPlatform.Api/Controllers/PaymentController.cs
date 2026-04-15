using Microsoft.AspNetCore.Mvc;
using DeliveryPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;

namespace DeliveryPlatform.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class PaymentController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly Microsoft.AspNetCore.SignalR.IHubContext<Hubs.OrderHub> _hubContext;
    private readonly IConfiguration _config;

    public PaymentController(ApplicationDbContext context, Microsoft.AspNetCore.SignalR.IHubContext<Hubs.OrderHub> hubContext, IConfiguration config)
    {
        _context = context;
        _hubContext = hubContext;
        _config = config;
    }

    // This is explicitly unsecured so outside requests (PayFast server) can hit it
    [HttpPost("itn")]
    [Consumes("application/x-www-form-urlencoded")]
    public async Task<IActionResult> ItnWebhook([FromForm] IFormCollection form)
    {
        // 1. In production, we must validate the IP and the signature (PassPhrase) here.

        // 2. Extract Data
        var payfastStatus = form["payment_status"].ToString();
        var orderIdStr = form["m_payment_id"].ToString();
        var pfReference = form["pf_payment_id"].ToString();
        
        if (string.IsNullOrEmpty(orderIdStr) || !int.TryParse(orderIdStr, out var orderId))
            return BadRequest();

        var order = await _context.Orders.FindAsync(orderId);
        if (order == null) return NotFound();

        // 3. Update Database based on ITN hook
        if (payfastStatus == "COMPLETE")
        {
            order.Status = "Paid"; // Order is now ready for a driver
            
            var payment = new Models.Payment
            {
                OrderId = order.Id,
                PayFastReference = pfReference,
                Amount = order.TotalAmount,
                Status = "Success",
                PaidAt = DateTime.UtcNow
            };
            _context.Payments.Add(payment);
            await _context.SaveChangesAsync();
            
            // Broadcast the new order to all online Drivers via SignalR
            await _hubContext.Clients.Group("Drivers").SendAsync("NewOrderAvailable", new {
                OrderId = order.Id,
                MerchantName = order.Merchant?.Name ?? "Nexus Merchant",
                DeliveryAddress = order.DeliveryAddress,
                Amount = order.TotalAmount
            });
        }
        else
        {
            order.Status = "PaymentFailed";
        }

        await _context.SaveChangesAsync();
        return Ok(); // Acknowledge receipt to PayFast
    }

    [HttpGet("success")]
    public IActionResult ReturnSuccess([FromQuery] string orderId)
    {
        var frontendUrl = _config["Deployment:FrontendUrl"]?.TrimEnd('/') ?? "http://localhost:5500";
        var isLocal = frontendUrl.Contains("localhost") || frontendUrl.Contains("127.0.0.1");

        return Content($@"
            <html>
            <body style='font-family:sans-serif; text-align:center; padding:50px; background:#10B981; color:white;'>
                <h1>Payment Successful!</h1>
                <p>Order #{orderId} has been authorized.</p>
                
                {(isLocal ? $@"
                <div style='margin-top:20px; padding:20px; background:rgba(0,0,0,0.1); border-radius:10px; display:inline-block;'>
                    <p style='font-size:0.9rem;'><b>LOCAL DEV ONLY:</b> Since PayFast cannot reach your 'localhost' directly, click below to manually trigger the 'Paid' status.</p>
                    <button id='simBtn' style='padding:12px 24px; font-weight:600; cursor:pointer; border:none; border-radius:8px; background:white; color:#10B981;'>Process Order Status & Alert Drivers</button>
                </div>" : $@"
                <p>Your order is being processed. You will be redirected shortly.</p>
                <script>setTimeout(() => {{ window.location.href = '{frontendUrl}/index.html'; }}, 3000);</script>
                ")}

                <div style='margin-top:30px;'>
                    <a href='{frontendUrl}/index.html' style='color:white; text-decoration:underline;'>Return to Application</a>
                </div>

                <script>
                    if (document.getElementById('simBtn')) {{
                        document.getElementById('simBtn').onclick = async () => {{
                            const btn = document.getElementById('simBtn');
                            btn.textContent = 'Processing...';
                            try {{
                                const body = new URLSearchParams();
                                body.append('payment_status', 'COMPLETE');
                                body.append('m_payment_id', '{orderId}');
                                body.append('pf_payment_id', 'sim_manual_trigger');
                                
                                const res = await fetch('/api/Payment/itn', {{
                                    method: 'POST',
                                    headers: {{ 'Content-Type': 'application/x-www-form-urlencoded' }},
                                    body: body
                                }});
                                
                                if(res.ok) {{
                                    btn.textContent = 'Done! Drivers Notified.';
                                    btn.style.background = '#d1fae5';
                                    alert('Success! Status updated. Returning you to the app...');
                                    window.location.href = '{frontendUrl}/index.html';
                                }} else {{
                                    throw new Error('Failed to trigger update');
                                }}
                            }} catch(e) {{
                                alert(e.message);
                                btn.textContent = 'Retry';
                            }}
                        }};
                    }}
                </script>
            </body>
            </html>", "text/html");
    }

    [HttpGet("cancel")]
    public IActionResult ReturnCancel()
    {
         return Content("<html><body style='font-family:sans-serif; text-align:center; padding:50px; background:#EF4444; color:white;'><h1>Payment Cancelled.</h1><p>Please try again.</p></body></html>", "text/html");
    }
}
