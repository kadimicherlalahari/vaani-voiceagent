// Replays realistic Vaani webhook payloads against the running server, so the whole flow
// (qualification → designer pick → booking → Telegram → dashboard) can be tested without
// spending call credits.
//   npm run simulate                 → all scenarios
//   npm run simulate -- complaint    → one scenario

import { config } from "../config.js";

const scenarios: Record<string, { summary: string; transcript: string; entities: Record<string, unknown>; seconds: number }> = {
  qualified: {
    seconds: 262,
    summary: "Caller Priya has a 3BHK in Kothrud (1,400 sq ft) and wants a full redesign by March. Owner; husband agrees. Prefers a site visit on Saturday morning.",
    transcript: "AGENT: Namaste, thank you for calling Aangan Studio...\nUSER: Hi, I'm Priya. We have a 3BHK in Kothrud...",
    entities: {
      caller_name: "Priya Kulkarni", email: null, language: "english", enquiry_type: "new_project", project_category: "residential",
      service_wanted: "design_and_execution", readiness: "ready_to_proceed", property: "3BHK apartment", location: "Kothrud, Dahanukar Colony",
      carpet_area_sqft: "1400", scope_size: "full_home", rooms_count: "4", scope_details: "Kitchen, living room, both bedrooms",
      site_status: "Lived in 2 years, builder finish", completion_deadline: "by March, no rush", budget_volunteered: null,
      occupancy: "owner", landlord_permission: "not_applicable", decision_maker: "self", referral_source: "Friend Shruti Joshi (past client)",
      consultation_mode: "site_visit", preferred_slot: "Saturday morning", sentiment: "calm", call_completeness: "complete",
    },
  },
  hindi: {
    seconds: 301,
    summary: "Sunil Yadav, 3BHK in Pimple Nilakh, full home interiors. Spoke Hindi. Any Saturday morning works.",
    transcript: "AGENT: Namaste...\nUSER: Mera flat Pimple Nilakh mein hai, 3BHK. Poora ghar karwana hai...",
    entities: {
      caller_name: "Sunil Yadav", language: "hindi", enquiry_type: "new_project", project_category: "residential", service_wanted: "design_and_execution",
      readiness: "ready_to_proceed", property: "3BHK apartment", location: "Pimple Nilakh", scope_size: "full_home", decision_maker: "self",
      consultation_mode: "site_visit", preferred_slot: "koi bhi Saturday subah", sentiment: "calm", call_completeness: "complete",
    },
  },
  complaint: {
    seconds: 352,
    summary: "Existing client Sheetal Deshpande (2BHK, Viman Nagar). Designer Aryan hasn't replied in five days. Wants a senior callback within 15 minutes.",
    transcript: "USER: My project has been going for three months and my designer hasn't replied in five days...",
    entities: { caller_name: "Sheetal Deshpande", enquiry_type: "existing_client_complaint", location: "Viman Nagar", existing_designer: "Aryan", sentiment: "angry", call_completeness: "complete" },
  },
  declined: {
    seconds: 160,
    summary: "Suresh Patil wants a home office redone in Nashik. Explained we only work in Pune/PCMC.",
    transcript: "USER: I'm in Nashik — would you be able to take on a project here?",
    entities: { caller_name: "Suresh Patil", enquiry_type: "new_project", project_category: "residential", service_wanted: "design_and_execution", location: "Nashik", scope_size: "partial_home", call_completeness: "complete" },
  },
  frustrated: {
    seconds: 318,
    summary: "Girish Nair called Monday about his 3BHK in Viman Nagar and nobody followed up. Frustrated. Wants consultation booked now.",
    transcript: "USER: I'd called on Monday about a project. Someone said they'd get back to me...",
    entities: {
      caller_name: "Girish Nair", enquiry_type: "follow_up_no_response", project_category: "residential", service_wanted: "design_and_execution",
      readiness: "ready_to_proceed", location: "Viman Nagar", property: "3BHK apartment", scope_size: "full_home", decision_maker: "self",
      preferred_slot: "weekday evening", sentiment: "frustrated", call_completeness: "complete",
    },
  },
  dropped: { seconds: 14, summary: "Caller said hello and the line dropped.", transcript: "USER: Hi, I wanted to inquire about —", entities: { call_completeness: "dropped" } },
};

async function post(body: object) {
  const url = `${process.env.SIM_BASE ?? `http://localhost:${config.port}`}/webhooks/vaani${config.webhookSecret ? `?key=${config.webhookSecret}` : ""}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

const pick = process.argv[2];
for (const [name, s] of Object.entries(scenarios)) {
  if (pick && pick !== name) continue;
  const id = `sim-${name}-${Date.now()}`;
  const phone = `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;
  await post({ event: "call_started", room_name: id, status: "active", phone_number: phone });
  await post({ event: "call_ended", room_name: id, call_duration: s.seconds, end_reason: "USER_DISCONNECTED" });
  await post({
    event: "call_postprocessing", call_id: id, timestamp: new Date().toISOString(),
    data: { room_name: id, call_id: id, call_duration: s.seconds * 1000, end_reason: "Call ended", summary: s.summary, entities: s.entities, dispositions: { pricing_leak: false }, recording_url: null, transcript: s.transcript },
  });
  console.log(`✓ ${name} (${id}, ${phone})`);
  await new Promise((r) => setTimeout(r, 800));
}
