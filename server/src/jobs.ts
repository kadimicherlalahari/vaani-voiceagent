// Background checks, every minute.

import { config } from "./config.js";
import { all, kvGet, kvSet, logActivity, nowIso, updateRow } from "./db.js";
import { sendTelegram, studioHeadChat } from "./notify/telegram.js";
import { syncAgent } from "./scripts/syncAgent.js";
import { escapeHtml as h, fmtIst, isOfficeHours, istParts } from "./util.js";

export async function tick() {
  await kvSet("last_tick", nowIso());
  const now = new Date();

  // 1. Consultation ended 15+ min ago → ask the designer how it went
  const ended = await all(
    `SELECT m.*, l.name AS lead_name, l.phone, d.telegram_chat_id, d.name AS designer_name FROM meetings m
     JOIN leads l ON l.id = m.lead_id JOIN designers d ON d.id = m.designer_id
     WHERE m.status = 'scheduled' AND m.followup_asked_at IS NULL AND m.end_at < ?`,
    new Date(now.getTime() - 15 * 60_000).toISOString(),
  );
  for (const m of ended) {
    await updateRow("meetings", m.id, { followup_asked_at: nowIso() });
    await logActivity(m.lead_id, "meeting_checkin", `Asked ${m.designer_name} how the consultation went`);
    await sendTelegram(m.telegram_chat_id,
      `🗓 Your consultation with <b>${h(m.lead_name ?? m.phone)}</b> (${h(fmtIst(m.start_at))}) — did it happen?`,
      [
        [{ text: "✅ Yes, we met", data: `met:${m.id}:attended` }, { text: "🙅 Client no-show", data: `met:${m.id}:customer_no_show` }],
        [{ text: "⛔ I couldn't make it", data: `met:${m.id}:designer_missed` }, { text: "🔁 Rescheduled", data: `met:${m.id}:rescheduled` }],
      ]);
  }

  // 2. Handoff not accepted within SLA (counted in office hours only) → nudge designer + studio head once
  if (isOfficeHours(now)) {
    const stale = await all(
      `SELECT l.*, d.name AS designer_name, d.telegram_chat_id FROM leads l JOIN designers d ON d.id = l.designer_id
       WHERE l.stage = 'handoff_sent' AND l.handoff_at < ?`,
      new Date(now.getTime() - config.handoffAcceptSlaMin * 60_000).toISOString(),
    );
    for (const l of stale) {
      const key = `nudged:${l.id}`;
      if (await kvGet(key)) continue;
      await kvSet(key, nowIso());
      await logActivity(l.id, "sla", `Not accepted within ${config.handoffAcceptSlaMin} min — reminded ${l.designer_name}`);
      await sendTelegram(l.telegram_chat_id, `⏰ Reminder: <b>${h(l.name ?? l.phone)}</b> is waiting. Leads answered within an hour convert 4× better.`, [[{ text: "✅ Accept", data: `acc:${l.id}` }, { text: "↪️ Can't take it", data: `dec:${l.id}` }]]);
      await sendTelegram(await studioHeadChat(), `⏰ ${h(l.designer_name)} hasn't accepted <b>${h(l.name ?? l.phone)}</b> after ${config.handoffAcceptSlaMin} min. <a href="${config.dashboardUrl}/leads/${l.id}">Open</a>`);
    }
  }

  // 3. Escalation past due and nobody picked it up → re-alert studio head (every 15 min)
  const overdue = await all(`SELECT e.*, l.name, l.phone FROM escalations e LEFT JOIN leads l ON l.id = e.lead_id WHERE e.status = 'open' AND e.due_at < ?`, now.toISOString());
  for (const e of overdue) {
    const key = `esc_alert:${e.id}`;
    const last = await kvGet(key);
    if (last && now.getTime() - new Date(last).getTime() < 15 * 60_000) continue;
    await kvSet(key, nowIso());
    await sendTelegram(await studioHeadChat(), `🚨 OVERDUE: escalation for <b>${h(e.name ?? e.phone)}</b> (📞 ${h(e.phone)}) — promised callback was ${h(fmtIst(e.due_at, { hour: "numeric", minute: "2-digit" }))}.`, [[{ text: "📞 Calling now", data: `eack:${e.id}` }, { text: "✅ Resolved", data: `edone:${e.id}` }]]);
  }

  // 4. Keep "today's date" in the agent prompt current (once a day, after midnight IST)
  const p = istParts(now);
  const today = `${p.y}-${p.m}-${p.d}`;
  if (config.vaani.apiKey && config.vaani.agentId && await kvGet("agent_synced_on") !== today) {
    try {
      await syncAgent(() => {});
      await kvSet("agent_synced_on", today);
    } catch (e) {
      console.error("daily agent sync failed:", (e as Error).message);
    }
  }
}

/** Run tick at most once a minute (used on webhooks and dashboard loads on serverless). */
export async function tickIfDue() {
  const last = await kvGet("last_tick");
  if (last && Date.now() - new Date(last).getTime() < 60_000) return;
  await tick();
}

export function startJobs() {
  const run = () => tick().catch((e) => console.error("jobs:", e));
  setTimeout(run, 5_000);
  return setInterval(run, 60_000);
}
