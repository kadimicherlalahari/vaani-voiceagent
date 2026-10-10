// One-time Google sign-in for the studio calendar account.
//   npm run google:auth
// Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (OAuth client of type "Desktop app") in .env.
// Opens the browser, receives the code on a localhost port, and saves GOOGLE_REFRESH_TOKEN to .env.

import { createServer } from "node:http";
import { exec } from "node:child_process";
import { setEnvVar } from "./envfile.js";

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first (Google Cloud → Credentials → OAuth client ID → Desktop app).");
  process.exit(1);
}
const PORT = 53682;
const redirect = `http://127.0.0.1:${PORT}/callback`;
const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: clientId, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent",
  scope: "https://www.googleapis.com/auth/calendar",
});

const server = createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", redirect);
  if (u.pathname !== "/callback") return res.end();
  const code = u.searchParams.get("code");
  if (!code) { res.end(`Sign-in failed: ${u.searchParams.get("error")}`); return; }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" }),
  });
  const j: any = await r.json();
  if (!j.refresh_token) {
    res.end("No refresh token returned — see terminal.");
    console.error("Google response:", j);
    process.exit(1);
  }
  setEnvVar("GOOGLE_REFRESH_TOKEN", j.refresh_token);
  const cals: any = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", { headers: { Authorization: `Bearer ${j.access_token}` } }).then((x) => x.json());
  res.end("Aangan: Google Calendar connected. You can close this tab.");
  console.log("✓ Saved GOOGLE_REFRESH_TOKEN to .env");
  console.log("Calendars on this account (GOOGLE_STUDIO_CALENDAR_ID defaults to 'primary'):");
  for (const c of cals.items ?? []) console.log(`  ${c.primary ? "*" : " "} ${c.id}  ${c.summary}`);
  server.close();
  process.exit(0);
});
server.listen(PORT, "127.0.0.1", () => {
  console.log("Opening Google sign-in… sign in with the account that owns the studio calendar.\nIf the browser doesn't open, visit:\n" + url);
  exec(`open "${url}"`);
});
