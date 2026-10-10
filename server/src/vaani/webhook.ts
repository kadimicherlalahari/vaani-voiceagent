// Receives Vaani call events (Settings → Webhooks → <PUBLIC_BASE_URL>/webhooks/vaani).
// call_started → call row appears live on the dashboard; call_ended → duration;
// call_postprocessing → transcript + extracted entities → pipeline.processCall.

import { config } from "../config.js";
import { get, insertRow, nowIso, updateRow } from "../db.js";
import { processCall } from "../pipeline.js";
import { isOfficeHours, normalizePhone } from "../util.js";
import { vaaniApi } from "./client.js";

export async function handleVaaniEvent(payload: any) {
  const event: string = payload?.event ?? "unknown";
  const data = payload?.data ?? payload;
  const callId: string | undefined = payload?.call_id ?? data?.call_id ?? data?.room_name ?? payload?.room_name;
  await insertRow("call_events", { call_id: callId ?? null, event, payload: JSON.stringify(payload) });
  if (!callId) return;

  const existing = await get("SELECT * FROM calls WHERE id = ?", callId);
  const ensure = async (fields: Record<string, unknown>) => {
    if (existing || await get("SELECT 1 FROM calls WHERE id = ?", callId)) await updateRow("calls", callId, fields);
    else {
      const started = new Date();
      await insertRow("calls", { id: callId, started_at: started.toISOString(), after_hours: !isOfficeHours(started), direction: callId.startsWith("outbound") ? "outbound" : "inbound", source: callId.startsWith("sim-") ? "simulated" : "vaani", ...fields });
    }
  };

  switch (event) {
    case "call_started":
    case "user_picked_up_at":
      await ensure({ from_number: normalizePhone(data.phone_number ?? data.from_number) ?? existing?.from_number ?? null, status: "in_progress" });
      break;
    case "call_ended":
      await ensure({ ended_at: nowIso(), duration_sec: Number(data.call_duration) || null, end_reason: data.end_reason ?? null });
      break;
    case "call_failed":
    case "call_no_answer":
    case "call_rejected":
      await ensure({ status: event === "call_failed" ? "failed" : "missed", ended_at: nowIso() });
      break;
    case "call_postprocessing": {
      const durationSec = data.call_duration != null ? Number(data.call_duration) / 1000 : null; // ms here
      const dispositions = data.dispositions ?? {};
      await ensure({
        transcript: data.transcript ?? null,
        summary: data.summary ?? null,
        entities_json: JSON.stringify(data.entities ?? {}),
        dispositions_json: JSON.stringify(dispositions),
        recording_url: data.recording_url ?? null,
        end_reason: data.end_reason ?? existing?.end_reason ?? null,
        ...(durationSec ? { duration_sec: durationSec } : {}),
      });
      if (!callId.startsWith("sim-")) await enrichFromHistory(callId);
      const call = (await get("SELECT * FROM calls WHERE id = ?", callId))!;
      if (call.cost_inr == null && call.duration_sec) {
        await updateRow("calls", callId, { cost_inr: Math.round((call.duration_sec / 60) * config.vaani.inrPerMinute * 100) / 100 });
      }
      const c = await get("SELECT cost_inr FROM calls WHERE id = ?", callId);
      if (c?.cost_inr) await insertRow("costs", { kind: "vaani", ref: callId, amount_inr: c.cost_inr });
      await processCall(callId);
      break;
    }
  }
}

/** Fill caller number / exact cost from call history (the postprocessing payload has neither). */
async function enrichFromHistory(callId: string) {
  try {
    for (let page = 1; page <= 2; page++) {
      const { data } = await vaaniApi.callHistory(page, 50);
      const row = data?.find((r) => r.call_id === callId);
      if (row) {
        const from = normalizePhone(row.direction === "Outbound" || row.call_type === "Outbound" ? row.to_number : row.from_number);
        await updateRow("calls", callId, {
          from_number: from ?? undefined,
          to_number: row.to_number ?? undefined,
          started_at: row.Start_time ? new Date(row.Start_time + "Z").toISOString() : undefined,
          cost_inr: row.call_cost != null ? Math.round(row.call_cost * config.vaani.inrPerCredit * 100) / 100 : undefined,
        });
        return;
      }
    }
  } catch (e) {
    console.warn("call-history lookup failed:", (e as Error).message.slice(0, 160));
  }
}
