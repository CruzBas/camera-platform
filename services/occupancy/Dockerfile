FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Innova.Occupancy.Api.csproj ./
RUN dotnet restore Innova.Occupancy.Api.csproj
COPY . ./
RUN dotnet publish Innova.Occupancy.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
USER $APP_UID
COPY --from=build /app .
ENTRYPOINT ["dotnet", "Innova.Occupancy.Api.dll"]
