import { config } from "./config.js";

export function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  const d = digits.replace(/^0+/, "");
  if (d.length === 10) return `+91${d}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return `+${d}`;
}

/** Parts of a Date in IST. */
export function istParts(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: config.timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(d);
  const g = (t: string) => f.find((p) => p.type === t)!.value;
  return { y: +g("year"), m: +g("month"), d: +g("day"), hh: +g("hour") % 24, mm: +g("minute"), weekday: g("weekday") };
}

/** Build a Date from an IST wall-clock time. */
export function istDate(y: number, m: number, d: number, hh = 0, mm = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 330 * 60_000);
}

export function isOfficeHours(d: Date) {
  const p = istParts(d);
  return p.weekday !== "Sun" && p.hh >= config.officeHours.startHour && p.hh < config.officeHours.endHour;
}

export const fmtIst = (d: Date | string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) =>
  new Date(d).toLocaleString("en-IN", { timeZone: config.timezone, ...opts });

export const escapeHtml = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const randomCode = (n = 6) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();
