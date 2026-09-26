export const PX_PER_DAY = 40;
export const ROW_HEIGHT = 40;

export function parseDate(iso: string): Date {
  return new Date(iso);
}

export function daysBetween(a: Date, b: Date): number {
  const DAY_MS = 86_400_000;
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** x position (px) of a date relative to the timeline's anchor start date */
export function dateToX(date: Date, timelineStart: Date): number {
  return daysBetween(timelineStart, date) * PX_PER_DAY;
}

/** date corresponding to an x position (px), snapped to whole days */
export function xToDate(x: number, timelineStart: Date): Date {
  const days = Math.round(x / PX_PER_DAY);
  return addDays(timelineStart, days);
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function formatShort(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
