// JSON API for the dashboard.

import { Router } from "express";
import { config, integrations } from "../config.js";
import { all, get, insertRow, logActivity, updateRow } from "../db.js";
import { handoffLead, recordMeetingNotes, recordMeetingOutcome, recordReason, resolveEscalation, setLeadStage } from "../pipeline.js";
import { studioHeadChat } from "../notify/telegram.js";
import { toolDocs } from "../tools/routes.js";
import { randomCode, isOfficeHours } from "../util.js";
import { vaaniApi } from "../vaani/client.js";
import { handleVaaniEvent } from "../vaani/webhook.js";
import { waitUntil } from "@vercel/functions";

export const api = Router();

const AVG_PROJECT_INR = 1_100_000; // problem statement: average project ₹8–14 lakh → midpoint
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

function rangeWhere(req: any, col: string) {
  const days = Math.min(Number(req.query.days ?? 30), 365);
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const seed = req.query.seed === "1";
  return { since, seed, days, clause: `${col} >= ?` };
}

api.get("/overview", async (req, res) => {
  const { since, seed, days } = rangeWhere(req, "");
  const src = seed ? "" : "AND source != 'seed'";
  const calls = await all(`SELECT * FROM calls WHERE started_at >= ? ${src}`, since);
  const leads = await all(`SELECT * FROM leads WHERE first_contact_at >= ? ${seed ? "" : "AND source != 'seed'"}`, since);
  const leadIds = new Set(leads.map((l) => l.id));
  const meetings = (await all("SELECT * FROM meetings")).filter((m) => leadIds.has(m.lead_id));
  const escalations = (await all("SELECT * FROM escalations")).filter((e) => leadIds.has(e.lead_id));
  const costs = await all(`SELECT kind, SUM(amount_inr) AS inr FROM costs WHERE at >= ? GROUP BY kind`, since);

  const count = (arr: any[], f: (x: any) => boolean) => arr.filter(f).length;
  const reached = (stages: string[]) => count(leads, (l) => stages.includes(l.stage));
  const handoffMins = leads.filter((l) => l.handoff_at).map((l) => {
    const c = calls.find((x) => x.lead_id === l.id && x.ended_at) ?? calls.find((x) => x.lead_id === l.id);
    const end = c?.ended_at ?? c?.started_at ?? l.first_contact_at;
    return (new Date(l.handoff_at).getTime() - new Date(end).getTime()) / 60000;
  });
  const acceptMins = leads.filter((l) => l.accepted_at && l.handoff_at).map((l) => (new Date(l.accepted_at).getTime() - new Date(l.handoff_at).getTime()) / 60000);

  const vaaniInr = costs.find((c) => c.kind === "vaani")?.inr ?? calls.reduce((a, c) => a + (c.cost_inr ?? 0), 0);
  const aiInr = costs.filter((c) => c.kind === "gemini" || c.kind === "claude").reduce((a, c) => a + (c.inr ?? 0), 0);
  const totalCost = vaaniInr + aiInr;
  const qualified = count(leads, (l) => l.qualification === "qualified");

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, calls: 0, afterHours: h < 10 || h >= 19 }));
  for (const c of calls) {
    const hr = Number(new Date(c.started_at).toLocaleString("en-GB", { timeZone: config.timezone, hour: "2-digit", hour12: false })) % 24;
    byHour[hr].calls++;
  }
  const byDay: Record<string, { day: string; calls: number; qualified: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toLocaleDateString("en-CA", { timeZone: config.timezone });
    byDay[d] = { day: d, calls: 0, qualified: 0 };
  }
  for (const c of calls) {
    const d = new Date(c.started_at).toLocaleDateString("en-CA", { timeZone: config.timezone });
    if (byDay[d]) byDay[d].calls++;
  }
  for (const l of leads) {
    const d = new Date(l.first_contact_at).toLocaleDateString("en-CA", { timeZone: config.timezone });
    if (byDay[d] && l.qualification === "qualified") byDay[d].qualified++;
  }

  const declineReasons: Record<string, number> = {};
  for (const l of leads.filter((l) => l.qualification === "declined")) {
    const crit = JSON.parse(l.criteria_json ?? "{}").criteria ?? [];
    const failed = crit.filter((c: any) => c.verdict === "fail").map((c: any) => c.label);
    const key = failed[0] ?? (l.decline_reason?.includes("landlord") ? "Landlord" : "Other");
    declineReasons[key] = (declineReasons[key] ?? 0) + 1;
  }

  const pricingLeaks = count(calls, (c) => {
    const d = JSON.parse(c.dispositions_json ?? "{}");
    return d.pricing_leak === true || String(d.pricing_leak).toLowerCase() === "true";
  });

  res.json({
    range: { days, since, seed },
    calls: {
      total: calls.length,
      answered: count(calls, (c) => c.status === "completed"),
      dropped: count(calls, (c) => c.status === "dropped"),
      missed: count(calls, (c) => c.status === "missed" || c.status === "failed"),
      afterHours: count(calls, (c) => c.after_hours === 1),
      avgDurationSec: calls.length ? Math.round(calls.reduce((a, c) => a + (c.duration_sec ?? 0), 0) / Math.max(1, count(calls, (c) => c.duration_sec))) : 0,
      pricingLeaks,
    },
    outcomes: {
      qualified,
      declined: count(leads, (l) => l.qualification === "declined"),
      nurture: count(leads, (l) => l.qualification === "nurture"),
      needsInfo: count(leads, (l) => l.qualification === "needs_info"),
      escalation: count(leads, (l) => l.qualification === "escalation"),
    },
    funnel: [
      { stage: "Calls answered", n: count(calls, (c) => c.status === "completed") },
      { stage: "New-project enquiries", n: count(leads, (l) => l.enquiry_type !== "existing_client_complaint") },
      { stage: "Qualified", n: qualified },
      { stage: "Handed to designer", n: count(leads, (l) => !!l.handoff_at) },
      { stage: "Designer accepted", n: count(leads, (l) => !!l.accepted_at) },
      { stage: "Consultation held", n: reached(["meeting_done", "proposal", "won", "lost"]) },
      { stage: "Won", n: reached(["won"]) },
    ],
    speed: {
      medianHandoffMin: median(handoffMins),
      handoffWithin5MinPct: handoffMins.length ? Math.round((handoffMins.filter((m) => m <= 5).length / handoffMins.length) * 100) : null,
      medianAcceptMin: median(acceptMins),
      acceptedWithin1hPct: acceptMins.length ? Math.round((acceptMins.filter((m) => m <= 60).length / acceptMins.length) * 100) : null,
    },
    meetings: {
      scheduled: count(meetings, (m) => m.status === "scheduled"),
      attended: count(meetings, (m) => m.status === "attended"),
      customerNoShow: count(meetings, (m) => m.status === "customer_no_show"),
      designerMissed: count(meetings, (m) => m.status === "designer_missed"),
      awaitingUpdate: count(meetings, (m) => m.status === "scheduled" && m.followup_asked_at),
    },
    escalations: {
      open: count(escalations, (e) => e.status !== "resolved"),
      overdue: count(escalations, (e) => e.status === "open" && new Date(e.due_at) < new Date()),
      total: escalations.length,
    },
    cost: {
      vaaniInr: round(vaaniInr), aiInr: round(aiInr), totalInr: round(totalCost),
      perCallInr: calls.length ? round(totalCost / calls.length) : null,
      perQualifiedLeadInr: qualified ? round(totalCost / qualified) : null,
      monthlyRunRateInr: round((totalCost / days) * 30),
    },
    value: {
      estPipelineInr: qualified * AVG_PROJECT_INR,
      wonCount: reached(["won"]),
      assumption: "₹11 lakh per qualified lead (midpoint of ₹8–14 lakh average project value)",
    },
    declineReasons: Object.entries(declineReasons).map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    byHour,
    byDay: Object.values(byDay),
  });
});
const round = (n: number) => Math.round(n * 100) / 100;

api.get("/calls", async (req, res) => {
  const seed = req.query.seed === "1";
  const status = req.query.status as string | undefined;
  const rows = await all(
    `SELECT c.id, c.lead_id, c.from_number, c.started_at, c.duration_sec, c.status, c.after_hours, c.summary, c.cost_inr, c.source, c.dispositions_json,
            l.name AS lead_name, l.qualification, l.stage
     FROM calls c LEFT JOIN leads l ON l.id = c.lead_id
     WHERE 1=1 ${seed ? "" : "AND c.source != 'seed'"} ${status ? "AND c.status = ?" : ""}
     ORDER BY c.started_at DESC LIMIT 500`,
    ...(status ? [status] : []),
  );
  res.json(rows);
});

api.get("/calls/:id", async (req, res) => {
  const c = await get("SELECT * FROM calls WHERE id = ?", req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  res.json({ ...c, events: await all("SELECT event, received_at FROM call_events WHERE call_id = ? ORDER BY id", req.params.id) });
});

api.get("/leads", async (req, res) => {
  const seed = req.query.seed === "1";
  const stage = req.query.stage as string | undefined;
  const rows = await all(
    `SELECT l.*, d.name AS designer_name,
       (SELECT start_at FROM meetings m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS meeting_at,
       (SELECT status FROM meetings m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS meeting_status
     FROM leads l LEFT JOIN designers d ON d.id = l.designer_id
     WHERE 1=1 ${seed ? "" : "AND l.source != 'seed'"} ${stage ? "AND l.stage = ?" : ""}
     ORDER BY l.first_contact_at DESC LIMIT 500`,
    ...(stage ? [stage] : []),
  );
  res.json(rows);
});

api.get("/leads/:id", async (req, res) => {
  const id = Number(req.params.id);
  const lead = await get("SELECT l.*, d.name AS designer_name FROM leads l LEFT JOIN designers d ON d.id = l.designer_id WHERE l.id = ?", id);
  if (!lead) return res.status(404).json({ error: "not found" });
  res.json({
    lead,
    calls: await all("SELECT * FROM calls WHERE lead_id = ? ORDER BY started_at", id),
    meetings: await all("SELECT m.*, d.name AS designer_name FROM meetings m JOIN designers d ON d.id = m.designer_id WHERE lead_id = ? ORDER BY m.id", id),
    escalations: await all("SELECT * FROM escalations WHERE lead_id = ? ORDER BY id", id),
    activity: await all("SELECT * FROM activity WHERE lead_id = ? ORDER BY at, id", id),
  });
});

api.post("/leads/:id/stage", async (req, res) => {
  await setLeadStage(Number(req.params.id), String(req.body.stage), req.body.note ?? "set from dashboard");
  res.json({ ok: true });
});

api.post("/leads/:id/handoff", async (req, res) => {
  const id = Number(req.params.id);
  const lead = await get("SELECT * FROM leads WHERE id = ?", id);
  if (!lead) return res.status(404).json({ error: "not found" });
  if (req.body.override) {
    await updateRow("leads", id, { qualification: "qualified" });
    await logActivity(id, "override", `Front desk overrode rubric (${lead.qualification}) → qualified`);
  }
  const exclude = req.body.designerId
    ? (await all("SELECT id FROM designers WHERE id != ?", Number(req.body.designerId))).map((d) => d.id)
    : [];
  await handoffLead(id, undefined, exclude);
  res.json({ ok: true });
});

api.post("/meetings/:id/outcome", async (req, res) => {
  const id = Number(req.params.id);
  if (req.body.outcome) await recordMeetingOutcome(id, req.body.outcome);
  if (req.body.reason) await recordReason(id, req.body.reason);
  if (req.body.notes) await recordMeetingNotes(id, req.body.notes);
  res.json({ ok: true });
});

api.get("/escalations", async (_req, res) => {
  res.json(await all(`SELECT e.*, l.name AS lead_name, l.phone, l.location, d.name AS assigned_name FROM escalations e
    LEFT JOIN leads l ON l.id = e.lead_id LEFT JOIN designers d ON d.id = e.assigned_to ORDER BY (e.status = 'resolved'), e.created_at DESC`));
});
api.post("/escalations/:id", async (req, res) => {
  await resolveEscalation(Number(req.params.id), req.body.status);
  res.json({ ok: true });
});

api.get("/designers", async (_req, res) => {
  res.json(await all(`SELECT d.*,
      (SELECT COUNT(*) FROM leads l WHERE l.designer_id = d.id) AS leads_total,
      (SELECT COUNT(*) FROM leads l WHERE l.designer_id = d.id AND l.stage IN ('handoff_sent','accepted')) AS leads_open,
      (SELECT COUNT(*) FROM meetings m WHERE m.designer_id = d.id AND m.status = 'attended') AS meetings_attended,
      (SELECT COUNT(*) FROM meetings m WHERE m.designer_id = d.id AND m.status = 'customer_no_show') AS no_shows,
      (SELECT COUNT(*) FROM meetings m WHERE m.designer_id = d.id AND m.status = 'designer_missed') AS missed,
      (SELECT AVG((julianday(l.accepted_at) - julianday(l.handoff_at)) * 1440) FROM leads l WHERE l.designer_id = d.id AND l.accepted_at IS NOT NULL) AS avg_accept_min
    FROM designers d ORDER BY d.active DESC, d.seniority, d.name`));
});
api.post("/designers", async (req, res) => {
  const { name, email, phone, seniority = "designer", calendar_id } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const id = await insertRow("designers", { name, email, phone, seniority, calendar_id: calendar_id || email || null, link_code: randomCode() });
  res.json({ id });
});
api.patch("/designers/:id", async (req, res) => {
  const allowed = ["name", "email", "phone", "seniority", "calendar_id", "active"];
  await updateRow("designers", Number(req.params.id), Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k))));
  res.json({ ok: true });
});

api.get("/notifications", async (_req, res) => res.json(await all("SELECT * FROM notifications ORDER BY id DESC LIMIT 100")));

api.get("/settings", async (_req, res) => {
  let botUsername: string | null = null;
  if (config.telegram.token) {
    botUsername = await fetch(`https://api.telegram.org/bot${config.telegram.token}/getMe`).then((r) => r.json()).then((j: any) => j.result?.username ?? null).catch(() => null);
  }
  res.json({
    integrations: integrations(),
    agentId: config.vaani.agentId,
    webhookUrl: `${config.publicBaseUrl}/webhooks/vaani${config.webhookSecret ? `?key=${config.webhookSecret}` : ""}`,
    tools: toolDocs(),
    botUsername,
    studioHeadLinked: Boolean(await studioHeadChat()),
    publicBaseUrl: config.publicBaseUrl,
    cronUrl: `${config.publicBaseUrl}/cron/tick${config.cronSecret ? `?key=${config.cronSecret}` : ""}`,
    lastTick: (await get("SELECT v FROM kv WHERE k = 'last_tick'"))?.v ?? null,
    database: process.env.TURSO_DATABASE_URL ? "Turso" : "local file",
  });
});

// ---------- "Talk to the agent" in the browser (demo without a phone number) ----------

api.post("/talk", async (_req, res) => {
  if (!config.vaani.agentId) return res.status(400).json({ error: "Vaani agent not configured" });
  try {
    const session = await vaaniApi.createWebSession(config.vaani.agentId, { source: "browser" });
    const lk = await vaaniApi.connectWebSession(session.session_token);
    const now = new Date();
    await insertRow("calls", { id: lk.room_name, direction: "inbound", status: "in_progress", started_at: now.toISOString(), after_hours: !isOfficeHours(now), source: "browser" });
    res.json({ token: lk.lk_token, url: lk.lk_url, room: lk.room_name, session: session.session_token });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

/** Browser session ended. If Vaani's post-processing webhook doesn't arrive, fetch the details ourselves. */
api.post("/talk/:room/end", async (req, res) => {
  const room = req.params.room;
  const session = typeof req.body?.session === "string" ? req.body.session : null;
  res.json({ ok: true });
  const job = (async () => {
    // End the Vaani session now, otherwise it waits out its reconnect grace period before post-processing.
    if (session) await vaaniApi.endWebSession(session).catch((e) => console.error("end session:", e));
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      const call = await get("SELECT processed_at FROM calls WHERE id = ?", room);
      if (call?.processed_at) return; // webhook already handled it
      const d: any = await vaaniApi.callDetails(room).catch(() => null);
      if (d && typeof d.entity === "object" && d.transcription && !/not available/i.test(d.transcription)) {
        await handleVaaniEvent({ event: "call_postprocessing", call_id: room, data: { call_id: room, summary: d.summary, entities: d.entity, transcript: d.transcription, dispositions: {} } });
        return;
      }
    }
  })().catch((e) => console.error("talk fallback:", e));
  try { waitUntil(job); } catch { /* local */ }
});
