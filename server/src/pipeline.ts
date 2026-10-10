// What happens after a call: qualify → (handoff + booking | escalation | decline | nurture),
// and every step after that (designer accepts, meeting outcome, notes summary).
// Every step writes to `activity`, which is the per-lead timeline on the dashboard.

import { config } from "./config.js";
import { all, get, insertRow, logActivity, nowIso, run, updateRow } from "./db.js";
import { qualify, type LeadFacts, type Qualification } from "./rules/qualify.js";
import { parseTimeline } from "./rules/timeline.js";
import { freeSlots, parsePreference, createCalendarEvent, cancelCalendarEvent, type Slot } from "./scheduling/calendar.js";
import { sendTelegram, studioHeadChat, type Button } from "./notify/telegram.js";
import { syncLeadToHubspot } from "./crm/hubspot.js";
import { summariseMeeting } from "./ai/summarise.js";
import { escapeHtml as h, fmtIst, isOfficeHours, istDate, istParts, normalizePhone } from "./util.js";

type Row = Record<string, any>;

// ---------- Vaani entities → our fields ----------

const s = (v: unknown) => {
  if (v == null) return null;
  const t = String(v).trim();
  return !t || /^(null|none|n\/a|na|unknown|not mentioned|not stated)$/i.test(t) ? null : t;
};

export function leadFieldsFromEntities(e: Record<string, unknown>) {
  const facts: LeadFacts = {
    enquiryType: s(e.enquiry_type),
    projectCategory: s(e.project_category),
    serviceWanted: s(e.service_wanted),
    readiness: s(e.readiness),
    location: s(e.location),
    carpetSqft: s(e.carpet_area_sqft),
    scopeSize: s(e.scope_size),
    rooms: s(e.rooms_count),
    completionDeadline: s(e.completion_deadline),
    budget: s(e.budget_volunteered),
    occupancy: s(e.occupancy),
    landlordPermission: s(e.landlord_permission),
    decisionMaker: s(e.decision_maker),
    sentiment: s(e.sentiment),
    referral: s(e.referral_source),
    property: s(e.property),
  };
  const sqft = Number(String(facts.carpetSqft ?? "").replace(/[^\d.]/g, "")) || null;
  const columns = {
    name: s(e.caller_name),
    email: s(e.email)?.toLowerCase().replace(/\s/g, "") ?? null,
    language: s(e.language),
    enquiry_type: facts.enquiryType,
    project_category: facts.projectCategory,
    property: facts.property,
    location: facts.location,
    carpet_sqft: sqft,
    scope: s(e.scope_details),
    site_status: s(e.site_status),
    occupancy: facts.occupancy,
    landlord_permission: facts.landlordPermission,
    timeline: facts.completionDeadline,
    budget: facts.budget,
    decision_maker: facts.decisionMaker,
    referral: facts.referral,
    preferred_slot: s(e.preferred_slot),
    consultation_mode: s(e.consultation_mode),
    sentiment: facts.sentiment,
  };
  return { facts, columns, callbackNumber: normalizePhone(s(e.callback_number)), completeness: s(e.call_completeness), existingDesigner: s(e.existing_designer) };
}

/** Facts for the rubric from a stored lead: last extracted facts, overlaid with current column values. */
export function factsFromLead(l: Row): LeadFacts {
  const prior: LeadFacts = JSON.parse(l.criteria_json ?? "{}")?.facts ?? {};
  const cols: LeadFacts = {
    enquiryType: l.enquiry_type, projectCategory: l.project_category, location: l.location, carpetSqft: l.carpet_sqft,
    completionDeadline: l.timeline, budget: l.budget, occupancy: l.occupancy, landlordPermission: l.landlord_permission,
    decisionMaker: l.decision_maker, sentiment: l.sentiment, referral: l.referral, property: l.property,
  };
  return { ...prior, ...Object.fromEntries(Object.entries(cols).filter(([, v]) => v != null)) };
}

// ---------- Main entry: a call has been post-processed ----------

export async function processCall(callId: string) {
  const call = await get("SELECT * FROM calls WHERE id = ?", callId);
  if (!call || call.processed_at) return;
  const entities = JSON.parse(call.entities_json ?? "{}");
  const { facts, columns, callbackNumber, completeness, existingDesigner } = leadFieldsFromEntities(entities);
  const phone = callbackNumber ?? normalizePhone(call.from_number);
  const meaningful = completeness !== "dropped" && completeness !== "silent" && (facts.enquiryType || columns.name || facts.location);

  if (!meaningful) {
    // Outbound callbacks are parked for now: the dashboard lists these as "dropped — call back".
    await updateRow("calls", callId, { status: "dropped", processed_at: nowIso() });
    const lead = phone ? await get("SELECT id FROM leads WHERE phone = ? ORDER BY id DESC LIMIT 1", phone) : null;
    if (lead) {
      await updateRow("calls", callId, { lead_id: lead.id });
      await logActivity(lead.id, "call_dropped", `Call from ${phone} dropped after ${Math.round(call.duration_sec ?? 0)}s`);
    }
    return;
  }

  // One lead per phone number while it is open (repeat callers update their lead)
  const existing = phone
    ? await get("SELECT * FROM leads WHERE phone = ? AND stage NOT IN ('won','lost','declined') AND created_at > datetime('now','-90 days') ORDER BY id DESC LIMIT 1", phone)
    : null;
  const merged = Object.fromEntries(Object.entries(columns).filter(([, v]) => v != null));
  let leadId: number;
  if (existing) {
    leadId = existing.id;
    await updateRow("leads", leadId, merged);
    await logActivity(leadId, "call", `Called again (${Math.round((call.duration_sec ?? 0) / 60)} min). ${call.summary ?? ""}`);
  } else {
    leadId = await insertRow("leads", { ...merged, phone, first_contact_at: call.started_at ?? nowIso(), source: call.source === "seed" ? "seed" : "phone" });
    await logActivity(leadId, "call", `${call.after_hours ? "After-hours call" : "Call"} answered by AI agent (${Math.round((call.duration_sec ?? 0) / 60)} min). ${call.summary ?? ""}`);
  }
  await updateRow("calls", callId, { lead_id: leadId, status: "completed", processed_at: nowIso() });

  const lead = (await get("SELECT * FROM leads WHERE id = ?", leadId))!;
  const callDate = new Date(call.started_at ?? Date.now());
  const prior: LeadFacts = JSON.parse(lead.criteria_json ?? "{}")?.facts ?? {};
  const allFacts: LeadFacts = { ...prior, ...Object.fromEntries(Object.entries(facts).filter(([, v]) => v != null)) };
  const q = qualify({ ...allFacts, ...factsFromLead({ ...lead, criteria_json: null }) }, callDate);
  await updateRow("leads", leadId, {
    qualification: q.outcome,
    criteria_json: JSON.stringify({ criteria: q.criteria, notes: q.notes, facts: allFacts }),
    decline_reason: q.declineReason ?? null,
    priority: q.priority,
  });
  await logActivity(leadId, "qualified", `Rubric: ${q.outcome.toUpperCase()}${q.declineReason ? ` — ${q.declineReason}` : ""}`);

  if (q.outcome === "escalation") {
    await updateRow("leads", leadId, { stage: "escalated" });
    await createEscalation(leadId, callId, "existing_client_complaint",
      `Existing client complaint${existingDesigner ? ` (designer: ${existingDesigner})` : ""}. ${call.summary ?? ""}`);
    return;
  }
  switch (q.outcome) {
    case "qualified":
      if (!lead.designer_id) await handoffLead(leadId, q);
      break;
    case "declined":
      await updateRow("leads", leadId, { stage: "declined" });
      break;
    case "nurture": {
      const reengage = new Date(Date.now() + 35 * 86400_000).toISOString().slice(0, 10);
      await updateRow("leads", leadId, { stage: "nurture", reengage_on: reengage });
      await logActivity(leadId, "nurture", `Early stage — re-engage around ${reengage} (4–6 weeks)`);
      break;
    }
    case "needs_info":
      await updateRow("leads", leadId, { stage: "needs_info" });
      await sendTelegram(await studioHeadChat(),
        `🟡 <b>Lead needs one more answer</b> — ${h(lead.name ?? lead.phone)}\n${q.criteria.filter((c) => c.verdict === "unclear").map((c) => `• ${h(c.reason)}`).join("\n")}${q.notes.length ? `\n${q.notes.map((n) => `• ${h(n)}`).join("\n")}` : ""}\n📞 ${h(lead.phone)}\n<a href="${config.dashboardUrl}/leads/${leadId}">Open in dashboard</a>`);
      break;
  }

  // T16 / W08: a response-time failure. Senior designer (the one now assigned, if senior) reaches out same day.
  if (q.frustrated) {
    const assigned = await get("SELECT d.* FROM leads l JOIN designers d ON d.id = l.designer_id WHERE l.id = ?", leadId);
    await createEscalation(leadId, callId, "frustrated_lead",
      `Caller is frustrated (${facts.enquiryType === "follow_up_no_response" ? "an earlier enquiry got no response" : facts.sentiment}). Reach out today. ${call.summary ?? ""}`,
      assigned && ["senior", "principal"].includes(assigned.seniority) ? assigned.id : undefined);
  }
}

// ---------- Handoff: pick designer, book slot, send note ----------

export async function handoffLead(leadId: number, q?: Qualification, excludeDesignerIds: number[] = []) {
  const lead = (await get("SELECT * FROM leads WHERE id = ?", leadId))!;
  q ??= qualify(factsFromLead(lead), new Date(lead.first_contact_at));
  const pick = await pickDesignerAndSlot(lead, q.needsSenior, excludeDesignerIds);
  if (!pick) {
    await updateRow("leads", leadId, { stage: "qualified" });
    await logActivity(leadId, "handoff_failed", "No designer with a free slot in the next 10 days — front desk to assign manually");
    await sendTelegram(await studioHeadChat(), `⚠️ Qualified lead <b>${h(lead.name ?? lead.phone)}</b> could not be auto-assigned (no free designer slot). <a href="${config.dashboardUrl}/leads/${leadId}">Assign in dashboard</a>`);
    return;
  }
  const { designer, slot } = pick;
  const mode = lead.consultation_mode === "studio" ? "studio" : "site_visit";
  const meetingId = await insertRow("meetings", {
    lead_id: leadId, designer_id: designer.id, start_at: slot.start.toISOString(), end_at: slot.end.toISOString(),
    mode, location: mode === "studio" ? "Aangan Studio" : lead.location,
  });

  const note = handoffNote(lead, designer, slot, q);
  let eventId: string | null = null;
  try {
    eventId = await createCalendarEvent({
      summary: `Aangan consultation — ${lead.name ?? "Client"} (${lead.property ?? lead.location ?? "interiors"})`,
      description: note.plain,
      location: mode === "studio" ? "Aangan Studio" : lead.location,
      start: slot.start, end: slot.end,
      attendees: [designer.email, lead.email],
    });
  } catch (e) {
    await logActivity(leadId, "calendar_error", (e as Error).message);
  }
  await updateRow("meetings", meetingId, { calendar_event_id: eventId });
  await updateRow("leads", leadId, { designer_id: designer.id, stage: "handoff_sent", handoff_at: nowIso(), handoff_note: note.plain });

  await logActivity(leadId, "handoff", `Assigned to ${designer.name}; consultation held for ${slot.label} (${mode === "studio" ? "studio" : "site visit"})${eventId ? " — calendar invite sent" + (lead.email ? " to designer and client" : " to designer") : ""}`);
  if (!lead.email) await logActivity(leadId, "note", "No client email captured — designer confirms the slot by phone");

  await sendTelegram(designer.telegram_chat_id, note.html, [
    [{ text: "✅ Accept", data: `acc:${leadId}` }, { text: "↪️ Can't take it", data: `dec:${leadId}` }],
    [{ text: "Open in dashboard", url: `${config.dashboardUrl}/leads/${leadId}` }],
  ]);
  await syncLeadToHubspot(leadId);
}

async function pickDesignerAndSlot(lead: Row, needsSenior: boolean, exclude: number[]): Promise<{ designer: Row; slot: Slot } | null> {
  const designers = (await all(
    `SELECT d.*, (SELECT COUNT(*) FROM leads l WHERE l.designer_id = d.id AND l.stage IN ('handoff_sent','accepted')) AS open_leads
     FROM designers d WHERE d.active = 1 AND d.seniority != 'studio_head' ORDER BY open_leads ASC, d.id ASC`,
  )).filter((d) => !exclude.includes(d.id));
  const senior = designers.filter((d) => d.seniority === "senior" || d.seniority === "principal");
  const pools = needsSenior ? [senior, designers] : [designers];
  const pref = parsePreference(lead.preferred_slot);
  for (const pool of pools) {
    let best: { designer: Row; slot: Slot } | null = null;
    for (const d of pool) {
      // honour the caller's preference; fall back to any slot rather than leave the lead unbooked
      const [slot] = [...(await freeSlots(d, pref, new Date(), 1)), ...(await freeSlots(d, {}, new Date(), 1))];
      // earliest slot wins; ties go to the designer with fewer open leads (pool order)
      if (slot && (!best || slot.start < best.slot.start)) best = { designer: d, slot };
    }
    if (best) return best;
  }
  return null;
}

function handoffNote(lead: Row, designer: Row, slot: Slot, q: Qualification) {
  const weeks = lead.timeline ? parseTimeline(lead.timeline, new Date(lead.first_contact_at)).weeks : null;
  const lines: [string, string | null][] = [
    ["📞", `${lead.phone ?? "number not captured"}${lead.email ? ` · ${lead.email}` : ""}`],
    ["🏠", [lead.property, lead.carpet_sqft && `${lead.carpet_sqft} sq ft carpet`].filter(Boolean).join(", ") || null],
    ["📍", lead.location],
    ["🛠", lead.scope],
    ["🧱", lead.site_status && `Site: ${lead.site_status}`],
    ["⏱", lead.timeline && `Needed by: ${lead.timeline}${weeks ? ` (~${Math.round(weeks)} weeks)` : ""}`],
    ["👤", decisionLabel(lead)],
    ["💰", lead.budget ? `Budget (volunteered): ${lead.budget}` : "Budget: not discussed (don't quote — you'll cover it at consultation)"],
    ["🤝", lead.referral && `Source: ${lead.referral}`],
    ["🗓", lead.preferred_slot && `Client prefers: ${lead.preferred_slot}`],
    ["🗣", lead.language && lead.language !== "english" ? `Spoke ${lead.language}` : null],
  ];
  const notes = q.notes;
  const head = `${q.priority === "urgent" ? "🔴 URGENT" : q.priority === "high" ? "🟠 High priority" : "🟢 New"} qualified lead — <b>${h(lead.name ?? "Caller")}</b>`;
  const booking = `📅 <b>Consultation held: ${h(slot.label)}</b> (${lead.consultation_mode === "studio" ? "at studio" : "site visit"}, 90 min). Please call the client today to confirm the time.`;
  const html = [
    head,
    "",
    ...lines.filter(([, v]) => v).map(([i, v]) => `${i} ${h(v)}`),
    notes.length ? `\n⚠️ ${notes.map(h).join("\n⚠️ ")}` : "",
    "",
    booking,
    "",
    `<i>Everything above was already asked on the call — no need to repeat it.</i>`,
  ].join("\n");
  const plain = [
    `Client: ${lead.name ?? "Caller"} (${lead.phone ?? "-"})${lead.email ? `, ${lead.email}` : ""}`,
    `Designer: ${designer.name}`,
    ...lines.filter(([, v]) => v).map(([, v]) => `- ${v}`),
    ...notes.map((n) => `! ${n}`),
    `Rubric: ${q.criteria.map((c) => `${c.label}: ${c.verdict}`).join(", ")}`,
    `Dashboard: ${config.dashboardUrl}/leads/${lead.id}`,
  ].join("\n");
  return { html, plain };
}

function decisionLabel(lead: Row) {
  const map: Record<string, string> = {
    self: "Caller is the decision-maker",
    authorised_by_owner: "Caller authorised by owner",
    owner_will_attend_consultation: "Decision-makers will attend the consultation",
    only_researching: "Caller researching for someone else — confirm decision-maker",
  };
  const occ = lead.occupancy === "tenant" ? " · Tenant (landlord OK, no structural work)" : lead.occupancy === "owner" ? " · Owner" : "";
  return (map[lead.decision_maker] ?? "Decision-maker not confirmed") + occ;
}

// ---------- Escalations ----------

export async function createEscalation(leadId: number, callId: string | null, kind: "existing_client_complaint" | "frustrated_lead", details: string, assigneeId?: number) {
  const senior = (assigneeId ? await get("SELECT * FROM designers WHERE id = ?", assigneeId) : null)
    ?? (kind === "existing_client_complaint" ? await get("SELECT * FROM designers WHERE active = 1 AND seniority = 'studio_head' ORDER BY id LIMIT 1") : null)
    ?? await get("SELECT * FROM designers WHERE active = 1 AND seniority IN ('principal','senior') ORDER BY seniority = 'senior' DESC, id LIMIT 1");
  const due = escalationDue(kind, new Date());
  const escId = await insertRow("escalations", { lead_id: leadId, call_id: callId, kind, details, assigned_to: senior?.id ?? null, due_at: due.toISOString() });
  const lead = (await get("SELECT * FROM leads WHERE id = ?", leadId))!;
  await logActivity(leadId, "escalation", `${kind === "existing_client_complaint" ? "Complaint escalated to studio head" : "Frustrated lead — senior same-day outreach"}; due ${fmtIst(due)}`);
  if (kind === "existing_client_complaint") await updateRow("leads", leadId, { priority: "urgent" });

  const html = `${kind === "existing_client_complaint" ? "🚨 <b>EXISTING CLIENT COMPLAINT</b>" : "🔴 <b>Frustrated lead — reach out today</b>"}\n\n👤 ${h(lead.name ?? "Caller")} · 📞 ${h(lead.phone)}\n📍 ${h(lead.location ?? "-")}\n\n${h(details)}\n\n⏰ Promised callback by <b>${h(fmtIst(due, { hour: "numeric", minute: "2-digit" }))}</b>`;
  const buttons: Button[][] = [[{ text: "📞 I'm calling now", data: `eack:${escId}` }, { text: "✅ Resolved", data: `edone:${escId}` }]];
  const targets = new Set([await studioHeadChat(), senior?.telegram_chat_id].filter(Boolean) as string[]);
  if (!targets.size) await sendTelegram(null, html);
  for (const chat of targets) await sendTelegram(chat, html, buttons);
  return escId;
}

/** Complaints: the 15-minute callback promised on the call (T09), day or night.
 *  Frustrated leads: same day — within 4 office hours, or by noon next working day if after hours. */
export function escalationDue(kind: string, now: Date) {
  if (kind === "existing_client_complaint") return new Date(now.getTime() + config.escalationSlaMin * 60_000);
  const p = istParts(now);
  if (isOfficeHours(now)) return new Date(Math.min(now.getTime() + 4 * 3600_000, istDate(p.y, p.m, p.d, config.officeHours.endHour).getTime()));
  const nextDay = p.hh >= config.officeHours.endHour || p.weekday === "Sun" ? 1 : 0;
  let due = istDate(p.y, p.m, p.d + nextDay, 12);
  if (istParts(due).weekday === "Sun") due = istDate(p.y, p.m, p.d + nextDay + 1, 12);
  return due;
}

// ---------- Designer actions (Telegram buttons or dashboard) ----------

export async function designerAccepts(leadId: number) {
  const lead = await get("SELECT l.*, d.name AS dname FROM leads l LEFT JOIN designers d ON d.id = l.designer_id WHERE l.id = ?", leadId);
  if (!lead || lead.stage !== "handoff_sent") return false;
  await updateRow("leads", leadId, { stage: "accepted", accepted_at: nowIso() });
  await logActivity(leadId, "accepted", `${lead.dname} accepted the lead (${Math.round((Date.now() - new Date(lead.handoff_at).getTime()) / 60000)} min after handoff)`);
  await syncLeadToHubspot(leadId);
  return true;
}

export async function designerDeclines(leadId: number) {
  const lead = await get("SELECT * FROM leads WHERE id = ?", leadId);
  if (!lead || !["handoff_sent", "accepted"].includes(lead.stage)) return false;
  const m = await get("SELECT * FROM meetings WHERE lead_id = ? AND status = 'scheduled' ORDER BY id DESC LIMIT 1", leadId);
  if (m) {
    await updateRow("meetings", m.id, { status: "cancelled", outcome_reason: "Designer passed the lead" });
    await cancelCalendarEvent(m.calendar_event_id).catch(() => {});
  }
  const tried = (await all("SELECT DISTINCT designer_id FROM meetings WHERE lead_id = ?", leadId)).map((r) => r.designer_id);
  await logActivity(leadId, "reassign", "Designer couldn't take it — reassigning");
  await updateRow("leads", leadId, { designer_id: null });
  await handoffLead(leadId, undefined, tried);
  return true;
}

export type MeetingOutcome = "attended" | "customer_no_show" | "designer_missed" | "rescheduled";

export async function recordMeetingOutcome(meetingId: number, outcome: MeetingOutcome) {
  const m = await get("SELECT * FROM meetings WHERE id = ?", meetingId);
  if (!m) return;
  await updateRow("meetings", meetingId, { status: outcome });
  const label: Record<MeetingOutcome, string> = {
    attended: "Consultation happened", customer_no_show: "Client didn't show up", designer_missed: "Designer couldn't attend", rescheduled: "Consultation rescheduled",
  };
  await logActivity(m.lead_id, "meeting", label[outcome]);
  if (outcome === "attended") await updateRow("leads", m.lead_id, { stage: "meeting_done" });
  else if (outcome === "customer_no_show") await updateRow("leads", m.lead_id, { stage: "no_show" });
  else if (outcome === "designer_missed") {
    await sendTelegram(await studioHeadChat(), `⚠️ Designer missed a consultation — lead <a href="${config.dashboardUrl}/leads/${m.lead_id}">#${m.lead_id}</a>. Needs rebooking.`);
  }
  await syncLeadToHubspot(m.lead_id);
}

export async function recordMeetingNotes(meetingId: number, notes: string) {
  const m = await get("SELECT * FROM meetings WHERE id = ?", meetingId);
  if (!m) return null;
  const lead = (await get("SELECT * FROM leads WHERE id = ?", m.lead_id))!;
  await updateRow("meetings", meetingId, { notes_raw: notes });
  const summary = await summariseMeeting(lead.handoff_note ?? "", notes, `meeting:${meetingId}`);
  await updateRow("meetings", meetingId, { summary_json: summary ? JSON.stringify(summary) : null });
  await logActivity(m.lead_id, "meeting_notes", summary ? `Consultation summary: ${summary.summary} (likelihood: ${summary.likelihood})` : `Designer notes: ${notes.slice(0, 300)}`);
  return summary;
}

export async function recordReason(meetingId: number, reason: string) {
  const m = await get("SELECT * FROM meetings WHERE id = ?", meetingId);
  if (!m) return;
  await updateRow("meetings", meetingId, { outcome_reason: reason });
  await logActivity(m.lead_id, "meeting_reason", `Reason: ${reason}`);
}

export async function setLeadStage(leadId: number, stage: string, note?: string) {
  await updateRow("leads", leadId, { stage });
  await logActivity(leadId, "stage", `Stage → ${stage}${note ? ` (${note})` : ""}`);
  await syncLeadToHubspot(leadId);
}

export async function resolveEscalation(escId: number, status: "acknowledged" | "resolved") {
  const e = await get("SELECT * FROM escalations WHERE id = ?", escId);
  if (!e) return;
  await updateRow("escalations", escId, status === "acknowledged" ? { status, acknowledged_at: nowIso() } : { status, resolved_at: nowIso(), acknowledged_at: e.acknowledged_at ?? nowIso() });
  if (e.lead_id) await logActivity(e.lead_id, "escalation", status === "acknowledged" ? "Escalation picked up — calling the client" : "Escalation resolved");
  if (status === "resolved" && e.kind === "existing_client_complaint" && e.lead_id) await run("UPDATE leads SET stage = 'resolved' WHERE id = ? AND stage = 'escalated'", e.lead_id);
}
