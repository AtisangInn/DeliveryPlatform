# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build-env
WORKDIR /app

# Copy csproj and restore as distinct layers
COPY DeliveryPlatform.Api/*.csproj ./DeliveryPlatform.Api/
RUN dotnet restore ./DeliveryPlatform.Api/DeliveryPlatform.Api.csproj

# Copy everything else and build
COPY DeliveryPlatform.Api/ ./DeliveryPlatform.Api/
RUN dotnet publish ./DeliveryPlatform.Api/DeliveryPlatform.Api.csproj -c Release -o out

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build-env /app/out .

# Use non-root user for security
USER $APP_UID

ENTRYPOINT ["dotnet", "DeliveryPlatform.Api.dll"]
