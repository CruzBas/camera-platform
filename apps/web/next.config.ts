import type { NextConfig } from "next";

// API de la plataforma (ASP.NET Core). El navegador la llama a través de este mismo origen,
// así la cookie de sesión funciona sin CORS.
const apiUrl = process.env.API_URL ?? "http://localhost:5080";
const occupancyApiUrl =
  process.env.OCCUPANCY_API_URL ?? "https://lg0618pp-002-site2.htempurl.com";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
      { source: "/hubs/:path*", destination: `${apiUrl}/hubs/:path*` },
      { source: "/occupancy/:path*", destination: `${occupancyApiUrl}/:path*` },
    ];
  },
};

export default nextConfig;
