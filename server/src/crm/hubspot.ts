// One-way sync of qualified leads into HubSpot (contact + deal) for Nikhil's founder view.
// The local DB stays the source of truth; HubSpot failures never block the pipeline.

import { config } from "../config.js";
import { get, logActivity, updateRow } from "../db.js";

// HubSpot default sales pipeline stage ids
const STAGE: Record<string, string> = {
  handoff_sent: "appointmentscheduled",
  accepted: "appointmentscheduled",
  meeting_done: "qualifiedtobuy",
  proposal: "presentationscheduled",
  won: "closedwon",
  lost: "closedlost",
  no_show: "appointmentscheduled",
};

async function hs(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.hubspotToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HubSpot ${method} ${path} → ${res.status}: ${j.message ?? ""}`);
  return j;
}

export async function syncLeadToHubspot(leadId: number) {
  if (!config.hubspotToken) return;
  const lead = await get("SELECT l.*, d.name AS designer_name FROM leads l LEFT JOIN designers d ON d.id = l.designer_id WHERE l.id = ?", leadId);
  if (!lead || !STAGE[lead.stage]) return;
  try {
    let contactId = lead.hubspot_contact_id as string | null;
    if (!contactId) {
      const [firstname, ...rest] = String(lead.name ?? "Caller").split(" ");
      const found = lead.phone
        ? await hs("POST", "/crm/v3/objects/contacts/search", { filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: lead.phone }] }], limit: 1 })
        : { results: [] };
      contactId = found.results?.[0]?.id ?? (await hs("POST", "/crm/v3/objects/contacts", {
        properties: { firstname, lastname: rest.join(" "), phone: lead.phone ?? "", ...(lead.email ? { email: lead.email } : {}), city: lead.location ?? "" },
      })).id;
      await updateRow("leads", leadId, { hubspot_contact_id: contactId });
    }
    const description = [lead.property, lead.carpet_sqft && `${lead.carpet_sqft} sq ft`, lead.location, lead.scope, lead.timeline && `Timeline: ${lead.timeline}`, lead.designer_name && `Designer: ${lead.designer_name}`]
      .filter(Boolean).join(" · ");
    const properties = { dealname: `${lead.name ?? lead.phone} — ${lead.property ?? lead.project_category ?? "Interior project"}`, pipeline: "default", dealstage: STAGE[lead.stage], description };
    if (lead.hubspot_deal_id) {
      await hs("PATCH", `/crm/v3/objects/deals/${lead.hubspot_deal_id}`, { properties });
    } else {
      const deal = await hs("POST", "/crm/v3/objects/deals", { properties });
      await hs("PUT", `/crm/v4/objects/deals/${deal.id}/associations/default/contacts/${contactId}`);
      await updateRow("leads", leadId, { hubspot_deal_id: deal.id });
    }
  } catch (e) {
    await logActivity(leadId, "hubspot_error", (e as Error).message);
  }
}
