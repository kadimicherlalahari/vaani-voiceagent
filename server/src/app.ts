// The HTTP app, shared by local dev (index.ts) and the Vercel function (../../api/index.ts).

import express from "express";
import cors from "cors";
import { waitUntil } from "@vercel/functions";
import { config, integrations } from "./config.js";
import { api } from "./api/routes.js";
import { toolsRouter } from "./tools/routes.js";
import { handleVaaniEvent } from "./vaani/webhook.js";
import { onTelegramUpdate } from "./notify/bot.js";
import { tickIfDue, tick } from "./jobs.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const keyOk = (req: express.Request) =>
  !config.webhookSecret || req.query.key === config.webhookSecret || req.get("x-webhook-key") === config.webhookSecret;
const requireKey: express.RequestHandler = (req, res, next) => (keyOk(req) ? next() : res.status(401).json({ error: "bad key" }));

/** Run work after responding. On Vercel, waitUntil keeps the function alive until it finishes. */
function background(p: Promise<unknown>, label: string) {
  const guarded = p.catch((e) => console.error(`${label}:`, e));
  try { waitUntil(guarded); } catch { /* not on Vercel — the promise just runs */ }
}

app.post("/webhooks/vaani", requireKey, (req, res) => {
  res.json({ status: "ok" });
  background(handleVaaniEvent(req.body).then(() => tickIfDue()), "vaani webhook");
});

app.post("/telegram/webhook", (req, res) => {
  if (config.telegram.webhookSecret && req.get("x-telegram-bot-api-secret-token") !== config.telegram.webhookSecret) {
    return res.status(401).end();
  }
  res.json({ ok: true });
  background(onTelegramUpdate(req.body), "telegram webhook");
});

// Background checks (meeting check-ins, SLA nudges, overdue escalations, daily prompt date).
// Called by an external scheduler every few minutes (Vercel Hobby cron is daily only) and
// opportunistically on webhooks / dashboard loads.
app.all("/cron/tick", async (req, res) => {
  const bearer = req.get("authorization") === `Bearer ${config.cronSecret}`;
  if (config.cronSecret && !bearer && req.query.key !== config.cronSecret) return res.status(401).end();
  await tick();
  res.json({ ok: true, at: new Date().toISOString() });
});

app.use("/tools", requireKey, toolsRouter);
app.use("/api", (_req, _res, next) => { background(tickIfDue(), "tick"); next(); }, api);
app.get("/health", (_req, res) => res.json({ ok: true, integrations: integrations() }));

export default app;
