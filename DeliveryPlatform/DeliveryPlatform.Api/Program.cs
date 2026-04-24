using DeliveryPlatform.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");

if (!string.IsNullOrEmpty(connectionString))
{
    // Sanitize: Trim and remove accidental surrounding quotes
    connectionString = connectionString.Trim().Trim('"');

    // Automatically handle postgres:// URIs (common when copying from dashboards)
    if (connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase))
    {
        try
        {
            var uri = new Uri(connectionString);
            var db = uri.AbsolutePath.Trim('/');
            var userPass = uri.UserInfo.Split(':');
            
            var host = uri.Host;
            var port = uri.Port > 0 ? uri.Port : 5432;
            var user = userPass[0];
            var pass = userPass.Length > 1 ? Uri.UnescapeDataString(userPass[1]) : "";

            connectionString = $"Host={host};Port={port};Database={db};Username={user};Password={pass};SSL Mode=Require;Trust Server Certificate=true;";
            Console.WriteLine("--> Persistence: Detected postgres:// URI. Converted to ADO.NET format.");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"--> Persistence Error: Failed to parse connection URI: {ex.Message}");
        }
    }
    
    // Log metadata for debugging without exposing secrets
    Console.WriteLine($"--> Persistence: Connection string loaded (Length: {connectionString.Length})");
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"] ?? "superSecretKey12345678901234567890"))
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;
                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/orderhub"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddControllers()
       .AddJsonOptions(options => 
       {
           options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
       });

builder.Services.AddSignalR();

builder.Services.AddScoped<DeliveryPlatform.Api.Services.Interfaces.IAuthService, DeliveryPlatform.Api.Services.Implementations.AuthService>();
builder.Services.AddScoped<DeliveryPlatform.Api.Services.Interfaces.IOrderService, DeliveryPlatform.Api.Services.Implementations.OrderService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll",
        b => b.SetIsOriginAllowed(_ => true) // Allow any origin but specifically allow credentials
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials());
});

var app = builder.Build();

// Seed the database
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    var context = services.GetRequiredService<DeliveryPlatform.Api.Data.ApplicationDbContext>();
    await DeliveryPlatform.Api.Data.DbInitializer.Seed(context);
}

// app.UseHttpsRedirection();
app.UseStaticFiles(); // Enable serving static files like uploads
app.UseCors("AllowAll");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<DeliveryPlatform.Api.Hubs.OrderHub>("/orderhub");

app.Run();
