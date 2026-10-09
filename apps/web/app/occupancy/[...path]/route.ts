import { NextRequest, NextResponse } from "next/server";

// Endpoints disponibles para el simulador / API de ocupación
const REMOTE_URL =
  process.env.OCCUPANCY_API_URL ?? "https://lg0618pp-002-site2.htempurl.com";
const LOCAL_URL_PORT_5190 = "http://localhost:5190";
const LOCAL_URL_PORT_5189 = "http://localhost:5189";

const TIMEOUT_MS = 2500;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const pathStr = "/" + path.join("/");
  const search = request.nextUrl.search;

  // Lista de destinos a probar en orden:
  // 1. Remoto (site2) si hay internet
  // 2. Local Docker (puerto 5190)
  // 3. Local desarrollo (puerto 5189)
  const targets = [
    `${REMOTE_URL}${pathStr}${search}`,
    `${LOCAL_URL_PORT_5190}${pathStr}${search}`,
    `${LOCAL_URL_PORT_5189}${pathStr}${search}`,
  ];

  let lastError: unknown = null;

  for (const target of targets) {
    try {
      const response = await fetchWithTimeout(
        target,
        {
          headers: {
            Accept: "application/json",
          },
        },
        TIMEOUT_MS
      );

      if (response.ok) {
        const data = await response.text();
        return new NextResponse(data, {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
            "X-Occupancy-Source": target.includes("http://localhost")
              ? "local-offline"
              : "remote-live",
          },
        });
      }
    } catch (err) {
      lastError = err;
      // Probar siguiente destino automáticamente
    }
  }

  return NextResponse.json(
    {
      error: "No se pudo conectar ni con el simulador remoto ni con el local.",
      details: String(lastError),
    },
    { status: 503 }
  );
}
