// Consultation slots. Uses Google Calendar free/busy + invites when configured; otherwise an
// internal calendar built from designer working hours and meetings already in the DB, so the
// whole flow works end-to-end before Google is connected.

import { config } from "../config.js";
import { all } from "../db.js";
import { istDate, istParts, fmtIst } from "../util.js";

export type Slot = { start: Date; end: Date; label: string };
export type Preference = { weekdays?: number[]; part?: "morning" | "afternoon" | "evening"; date?: { m: number; d: number }; hour?: number };

const DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// Start times (IST) offered for a 90-min consultation. 18:00 only when the caller asks for evenings
// (W01: "weekdays after 6pm or weekends").
const STARTS: [number, number][] = [[10, 30], [12, 30], [15, 0], [17, 0]];
const EVENING: [number, number] = [18, 15];

export function parsePreference(text?: string | null): Preference {
  if (!text) return {};
  const t = text.toLowerCase();
  const p: Preference = {};
  const days = new Set<number>();
  if (/weekend|saturday or sunday/.test(t)) [0, 6].forEach((d) => days.add(d));
  if (/weekday/.test(t)) [1, 2, 3, 4, 5].forEach((d) => days.add(d));
  DAY.forEach((d, i) => { if (new RegExp(`\\b${d}[a-z]*`).test(t)) days.add(i); });
  if (days.size) p.weekdays = [...days];
  if (/morning|subah/.test(t)) p.part = "morning";
  else if (/afternoon|lunch/.test(t)) p.part = "afternoon";
  else if (/evening|after (5|6|7)|shaam|after office/.test(t)) p.part = "evening";
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/) ?? t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/);
  if (dm) {
    const [a, b] = /\d/.test(dm[1]) ? [dm[1], dm[2]] : [dm[2], dm[1]];
    p.date = { d: +a, m: months.indexOf(b) + 1 };
  }
  const tm = t.match(/\b(\d{1,2})(?::(\d\d))?\s*(am|pm)\b/);
  if (tm) p.hour = (+tm[1] % 12) + (tm[3] === "pm" ? 12 : 0);
  return p;
}

function candidateStarts(from: Date, pref: Preference, days = 10): Date[] {
  const out: Date[] = [];
  // Earliest: 3 hours from now (designer must have time to call the client first)
  const earliest = new Date(from.getTime() + 3 * 3600_000);
  const p0 = istParts(from);
  for (let i = 0; i < days; i++) {
    const base = istDate(p0.y, p0.m, p0.d + i, 12);
    const bp = istParts(base);
    const dow = DAY.indexOf(bp.weekday.toLowerCase().slice(0, 3));
    if (pref.date && !(bp.m === pref.date.m && bp.d === pref.date.d)) continue;
    if (!pref.date && pref.weekdays && !pref.weekdays.includes(dow)) continue;
    // Studio consultations Mon–Sat; Sunday only when the caller asks for weekends/Sunday
    if (dow === 0 && !(pref.weekdays?.includes(0))) continue;
    let starts = [...STARTS];
    if (pref.part === "evening") starts = [[17, 0], EVENING];
    else if (pref.part === "morning") starts = starts.filter(([h]) => h < 12);
    else if (pref.part === "afternoon") starts = starts.filter(([h]) => h >= 12 && h < 17);
    if (pref.hour != null) starts = [[pref.hour, 0], ...starts.filter(([h]) => h !== pref.hour)];
    for (const [h, m] of starts) {
      const s = istDate(bp.y, bp.m, bp.d, h, m);
      if (s >= earliest) out.push(s);
    }
  }
  return out;
}

const overlaps = (a0: Date, a1: Date, b0: Date, b1: Date) => a0 < b1 && b0 < a1;

/** Free slots for one designer. */
export async function freeSlots(designer: { id?: number; calendar_id?: string | null; [k: string]: any }, pref: Preference, from = new Date(), max = 3): Promise<Slot[]> {
  const mins = config.consultationMinutes;
  const starts = candidateStarts(from, pref);
  if (!starts.length) return [];
  const horizonEnd = new Date(starts[starts.length - 1].getTime() + mins * 60_000);

  const busy: [Date, Date][] = (await all<{ start_at: string; end_at: string }>(
    "SELECT start_at, end_at FROM meetings WHERE designer_id = ? AND status IN ('scheduled') AND end_at > ?",
    designer.id ?? null, from.toISOString(),
  )).map((r) => [new Date(r.start_at), new Date(r.end_at)]);
  if (designer.calendar_id && googleEnabled()) {
    try {
      busy.push(...(await googleFreeBusy(designer.calendar_id, from, horizonEnd)));
    } catch (e) {
      console.warn("Google free/busy failed:", (e as Error).message);
    }
  }
  const slots: Slot[] = [];
  for (const s of starts) {
    const e = new Date(s.getTime() + mins * 60_000);
    // 30-min travel buffer either side for site visits
    const b0 = new Date(s.getTime() - 30 * 60_000), b1 = new Date(e.getTime() + 30 * 60_000);
    if (busy.some(([x, y]) => overlaps(b0, b1, x, y))) continue;
    slots.push({ start: s, end: e, label: fmtIst(s, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }) });
    if (slots.length >= max) break;
  }
  return slots;
}

// ---------------- Google Calendar (REST) ----------------

export const googleEnabled = () => Boolean(config.google.refreshToken && config.google.clientId && config.google.clientSecret);

let token: { value: string; exp: number } | null = null;
async function googleToken() {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.google.clientId, client_secret: config.google.clientSecret,
      refresh_token: config.google.refreshToken, grant_type: "refresh_token",
    }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(`Google token: ${JSON.stringify(j)}`);
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

async function gcal(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${await googleToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = res.status === 204 ? {} : await res.json();
  if (!res.ok) throw new Error(`Google ${method} ${path}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function googleFreeBusy(calendarId: string, from: Date, to: Date): Promise<[Date, Date][]> {
  const j = await gcal("POST", "/freeBusy", { timeMin: from.toISOString(), timeMax: to.toISOString(), timeZone: config.timezone, items: [{ id: calendarId }] });
  return (j.calendars?.[calendarId]?.busy ?? []).map((b: any) => [new Date(b.start), new Date(b.end)]);
}

export async function createCalendarEvent(ev: {
  summary: string; description: string; location?: string | null; start: Date; end: Date; attendees: (string | null | undefined)[];
}): Promise<string | null> {
  if (!googleEnabled()) return null;
  const j = await gcal("POST", `/calendars/${encodeURIComponent(config.google.studioCalendarId)}/events?sendUpdates=all`, {
    summary: ev.summary,
    description: ev.description,
    location: ev.location ?? undefined,
    start: { dateTime: ev.start.toISOString(), timeZone: config.timezone },
    end: { dateTime: ev.end.toISOString(), timeZone: config.timezone },
    attendees: ev.attendees.filter(Boolean).map((email) => ({ email })),
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 60 }, { method: "email", minutes: 24 * 60 }] },
  });
  return j.id;
}

export async function moveCalendarEvent(eventId: string, patch: { start?: Date; end?: Date; attendees?: string[] }) {
  if (!googleEnabled() || !eventId) return;
  await gcal("PATCH", `/calendars/${encodeURIComponent(config.google.studioCalendarId)}/events/${eventId}?sendUpdates=all`, {
    ...(patch.start ? { start: { dateTime: patch.start.toISOString(), timeZone: config.timezone } } : {}),
    ...(patch.end ? { end: { dateTime: patch.end.toISOString(), timeZone: config.timezone } } : {}),
    ...(patch.attendees ? { attendees: patch.attendees.map((email) => ({ email })) } : {}),
  });
}

export async function cancelCalendarEvent(eventId: string | null) {
  if (!googleEnabled() || !eventId) return;
  await gcal("DELETE", `/calendars/${encodeURIComponent(config.google.studioCalendarId)}/events/${eventId}?sendUpdates=all`);
}
