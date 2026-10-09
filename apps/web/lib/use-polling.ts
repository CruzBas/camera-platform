import { useEffect, useState } from "react";

export interface PollState<T> {
  data: T | null;
  error: string | null;
  updatedAt: Date | null;
}

// Llama a `load` inmediatamente y cada `intervalMs`, sin solapar peticiones.
// Mantiene los últimos datos válidos si una petición falla.
export function usePolling<T>(
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  key: unknown = null
): PollState<T> {
  const [state, setState] = useState<PollState<T>>({
    data: null,
    error: null,
    updatedAt: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    setState({ data: null, error: null, updatedAt: null });

    async function tick() {
      try {
        const data = await load(controller.signal);
        setState({ data, error: null, updatedAt: new Date() });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((previous) => ({
          ...previous,
          error: (error as Error).message,
        }));
      }
      if (!controller.signal.aborted) {
        timer = window.setTimeout(tick, intervalMs);
      }
    }

    tick();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [key, intervalMs]);

  return state;
}

// Re-renderiza en cada intervalo para actualizar etiquetas temporales ("hace X s").
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
