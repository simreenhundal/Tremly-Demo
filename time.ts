import type { Weekday } from "./types";

const cache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
    cache.set(tz, f);
  }
  return f;
}

const WEEKDAY: Record<string, Weekday> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function rawParts(utcMs: number, tz: string) {
  const p: Record<string, string> = {};
  for (const x of formatter(tz).formatToParts(new Date(utcMs))) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, wd: WEEKDAY[p.weekday] };
}

export interface LocalParts { date: string; weekday: Weekday; minutes: number }

export function localParts(utcMs: number, tz: string): LocalParts {
  const r = rawParts(utcMs, tz);
  const date = `${r.y}-${String(r.mo).padStart(2, "0")}-${String(r.d).padStart(2, "0")}`;
  return { date, weekday: r.wd, minutes: r.h * 60 + r.mi };
}

function offsetMs(utcMs: number, tz: string) {
  const r = rawParts(utcMs, tz);
  return Date.UTC(r.y, r.mo - 1, r.d, r.h, r.mi) - Math.floor(utcMs / 60000) * 60000;
}

/** Local wall-clock time in `tz` -> UTC ms. */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz);
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** e.g. "Tue 9:00 AM" in the given zone. */
export function formatInZone(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit",
  }).format(new Date(utcMs));
}
