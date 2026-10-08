const EVENT_LABELS: Record<string, string> = {
  person_detected: "Persona detectada",
};

const OBJECT_LABELS: Record<string, string> = {
  person: "persona",
};

export const eventLabel = (type: string) => EVENT_LABELS[type] ?? type;
export const objectLabel = (label: string) => OBJECT_LABELS[label] ?? label;

const timeFormat = new Intl.DateTimeFormat("es", { dateStyle: "short", timeStyle: "medium" });
export const formatDateTime = (iso: string) => timeFormat.format(new Date(iso));

const clockFormat = new Intl.DateTimeFormat("es", { timeStyle: "short" });
export const formatClock = (iso: string) => clockFormat.format(new Date(iso));

export function formatDuration(fromIso: string, toIso: string) {
  const seconds = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} min ${seconds % 60} s` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export const percent = (value: number) => `${Math.round(value * 100)}%`;
