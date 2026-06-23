export function nowIso() {
  return new Date().toISOString();
}

export function compactTime(iso: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

export function formatDuration(ms?: number) {
  if (!ms) return "00:00";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `00:${String(seconds).padStart(2, "0")}`;
}
