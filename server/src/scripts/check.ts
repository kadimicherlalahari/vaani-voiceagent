// npm run check — verifies every integration with a real, read-only API call.

import { config } from "../config.js";
import { all, get } from "../db.js";
import { vaaniApi } from "../vaani/client.js";

const results: [string, boolean | null, string][] = [];
async function check(name: string, enabled: boolean, fn: () => Promise<string>) {
  if (!enabled) return results.push([name, null, "not configured"]);
  try { results.push([name, true, await fn()]); } catch (e) { results.push([name, false, (e as Error).message.slice(0, 160)]); }
}

await check("Database", true, async () => {
  const n = await get("SELECT COUNT(*) AS n FROM designers");
  return `${process.env.TURSO_DATABASE_URL ? "Turso" : "local file"} · ${n?.n} designers`;
});
await check("Vaani agent", Boolean(config.vaani.apiKey && config.vaani.agentId), async () => {
  const a = await vaaniApi.getAgent(config.vaani.agentId);
  const inbound = a.deployment_config?.phone?.call_type?.Inbound || a.deployment_config?.deployment?.phone?.call_type?.Inbound;
  return `${a.agent_display_name}${inbound ? ` · inbound ${inbound}` : " · NO inbound number assigned yet"}`;
});
await check("Telegram", Boolean(config.telegram.token), async () => {
  const tg = (m: string) => fetch(`https://api.telegram.org/bot${config.telegram.token}/${m}`).then((r) => r.json()) as Promise<any>;
  const [me, wh] = await Promise.all([tg("getMe"), tg("getWebhookInfo")]);
  if (!me.ok) throw new Error(me.description);
  const linked = (await all("SELECT id FROM designers WHERE telegram_chat_id IS NOT NULL")).length;
  return `@${me.result.username} · webhook ${wh.result.url || "none (polling)"}${wh.result.last_error_message ? ` · last error: ${wh.result.last_error_message}` : ""} · ${linked} designers linked`;
});
await check("Google Calendar", Boolean(config.google.refreshToken && config.google.clientId), async () => {
  const t: any = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, refresh_token: config.google.refreshToken, grant_type: "refresh_token" }) }).then((r) => r.json());
  if (!t.access_token) throw new Error(JSON.stringify(t));
  const c: any = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.google.studioCalendarId)}`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => r.json());
  if (c.error) throw new Error(c.error.message);
  return `studio calendar "${c.summary}"`;
});
await check("HubSpot", Boolean(config.hubspotToken), async () => {
  const r = await fetch("https://api.hubapi.com/crm/v3/objects/deals?limit=1", { headers: { Authorization: `Bearer ${config.hubspotToken}` } });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return "deals API reachable";
});
await check("Gemini summaries", Boolean(config.gemini.apiKey), async () => {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}`, { headers: { "x-goog-api-key": config.gemini.apiKey } });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? String(r.status));
  return `${j.displayName ?? config.gemini.model}`;
});

for (const [name, ok, msg] of results) console.log(`${ok === null ? "–" : ok ? "✓" : "✗"} ${name.padEnd(18)} ${msg}`);
process.exit(results.some(([, ok]) => ok === false) ? 1 : 0);
