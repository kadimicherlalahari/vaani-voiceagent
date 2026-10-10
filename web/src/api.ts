import { useCallback, useEffect, useState } from "react";

const TOKEN_KEY = "aangan_pw";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };
export const setToken = (t: string) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } };
const auth = () => ({ Authorization: `Bearer ${getToken()}` });
export class Unauthorized extends Error {}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`, { headers: auth() });
  if (r.status === 401) { window.dispatchEvent(new Event("aangan:logout")); throw new Unauthorized("login required"); }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function apiPost<T = unknown>(path: string, body: unknown, method = "POST"): Promise<T> {
  const r = await fetch(`/api${path}`, { method, headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body) });
  if (r.status === 401) { window.dispatchEvent(new Event("aangan:logout")); throw new Unauthorized("login required"); }
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

/** Fetch + auto-refresh (dashboards should not need a manual reload). */
export function useApi<T>(path: string | null, refreshMs = 15000) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!path) return;
    apiGet<T>(path).then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message));
  }, [path]);
  useEffect(() => {
    load();
    if (!refreshMs) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);
  return { data, error, reload: load };
}

export const inr = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: digits })}`;

export const lakh = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(1)} Cr` : `₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} L`);

export const when = (iso?: string | null, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) =>
  iso ? new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", ...opts }) : "—";

export const ago = (iso?: string | null) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (Math.abs(m) < 60) return m >= 0 ? `${m}m ago` : `in ${-m}m`;
  const h = Math.round(m / 60);
  if (Math.abs(h) < 48) return h >= 0 ? `${h}h ago` : `in ${-h}h`;
  return when(iso, { day: "numeric", month: "short" });
};

export const duration = (sec?: number | null) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "—");

export const STAGES: Record<string, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "neutral" },
  qualified: { label: "Qualified · unassigned", tone: "warn" },
  needs_info: { label: "Needs info", tone: "warn" },
  handoff_sent: { label: "Sent to designer", tone: "info" },
  accepted: { label: "Designer accepted", tone: "info" },
  meeting_done: { label: "Consultation done", tone: "good" },
  no_show: { label: "Client no-show", tone: "serious" },
  proposal: { label: "Proposal", tone: "good" },
  won: { label: "Won", tone: "good" },
  lost: { label: "Lost", tone: "neutral" },
  declined: { label: "Declined (not a fit)", tone: "neutral" },
  nurture: { label: "Nurture", tone: "neutral" },
  escalated: { label: "Escalated", tone: "critical" },
  resolved: { label: "Resolved", tone: "neutral" },
};

export type Tone = "neutral" | "info" | "good" | "warn" | "serious" | "critical";
