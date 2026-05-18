const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function humanizeDue(dueAtIso: string, nowMs: number = Date.now()): string {
  const due = new Date(dueAtIso).getTime();
  const diff = due - nowMs;
  const abs = Math.abs(diff);
  if (abs < MIN) return diff >= 0 ? 'in <1m' : 'now';
  if (abs < HOUR) {
    const m = Math.round(abs / MIN);
    return diff >= 0 ? `in ${m}m` : `overdue ${m}m`;
  }
  if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    return diff >= 0 ? `in ${h}h` : `overdue ${h}h`;
  }
  const d = Math.round(abs / DAY);
  return diff >= 0 ? `in ${d}d` : `overdue ${d}d`;
}

export function humanizeWhen(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${month} ${day} · ${hh}:${mm}`;
}

export function weekdayDate(now: Date = new Date()): string {
  const weekday = now.toLocaleString('en-US', { weekday: 'long' });
  const month = now.toLocaleString('en-US', { month: 'long' });
  return `${weekday}, ${month} ${now.getDate()}`;
}
