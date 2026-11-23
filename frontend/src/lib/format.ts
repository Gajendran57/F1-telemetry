export function formatLapTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const rest = seconds - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, '0')}`;
}

export function formatDelta(seconds: number): string {
  const sign = seconds >= 0 ? '+' : '−';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export function formatMeters(m: number): string {
  return `${Math.round(m)} m`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
