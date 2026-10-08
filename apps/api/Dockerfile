FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY CameraPlatform.slnx ./
COPY src/CameraPlatform.Domain/*.csproj src/CameraPlatform.Domain/
COPY src/CameraPlatform.Application/*.csproj src/CameraPlatform.Application/
COPY src/CameraPlatform.Infrastructure/*.csproj src/CameraPlatform.Infrastructure/
COPY src/CameraPlatform.Api/*.csproj src/CameraPlatform.Api/
RUN dotnet restore src/CameraPlatform.Api/CameraPlatform.Api.csproj
COPY src/ src/
RUN dotnet publish src/CameraPlatform.Api/CameraPlatform.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
# Directorio de las claves de cifrado (volumen); debe pertenecer al usuario sin privilegios.
RUN mkdir /keys && chown $APP_UID /keys
USER $APP_UID
COPY --from=build /app .
ENTRYPOINT ["dotnet", "CameraPlatform.Api.dll"]
