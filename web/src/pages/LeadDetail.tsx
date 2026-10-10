import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiPost, duration, STAGES, useApi, when } from "../api";
import { Pill, Section } from "../components/ui";

const VERDICT = { pass: { icon: "✓", tone: "good" }, fail: { icon: "✕", tone: "critical" }, unclear: { icon: "?", tone: "warn" } } as const;

export default function LeadDetail() {
  const { id } = useParams();
  const { data, reload } = useApi<any>(`/leads/${id}`, 10000);
  if (!data) return <div className="text-sm text-ink-3">Loading…</div>;
  const { lead, calls, meetings, escalations, activity } = data;
  const rubric = JSON.parse(lead.criteria_json ?? "{}");

  const act = async (path: string, body: unknown) => { await apiPost(path, body); reload(); };

  return (
    <div className="space-y-4">
      <Link to="/leads" className="text-sm text-ink-3 hover:text-ink">← Leads</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">{lead.name ?? "Unknown caller"}</h1>
          <div className="tnum mt-1 text-sm text-ink-2">{lead.phone}{lead.email && ` · ${lead.email}`}{lead.language && lead.language !== "english" && ` · spoke ${lead.language}`}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone={STAGES[lead.stage]?.tone}>{STAGES[lead.stage]?.label ?? lead.stage}</Pill>
            {lead.priority !== "normal" && <Pill tone={lead.priority === "urgent" ? "critical" : "serious"}>{lead.priority} priority</Pill>}
            {lead.designer_name && <Pill tone="info">Designer: {lead.designer_name}</Pill>}
            {lead.source === "seed" && <Pill>September baseline</Pill>}
          </div>
        </div>
        <StageActions lead={lead} act={act} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Qualification (Nikhil's five checks)" right={<span className="text-xs text-ink-3">Outcome: <b className="text-ink">{lead.qualification ?? "—"}</b></span>}>
            {rubric.criteria?.length ? (
              <ul className="space-y-2">
                {rubric.criteria.map((c: any) => (
                  <li key={c.key} className="flex items-start gap-3 text-sm">
                    <Pill tone={VERDICT[c.verdict as keyof typeof VERDICT].tone}>{c.verdict === "unclear" ? "? " : ""}{c.label}</Pill>
                    <span className="text-ink-2">{c.reason}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-ink-2">{lead.qualification === "escalation" ? "Existing-client complaint — not a new lead." : "Not evaluated."}</p>}
            {rubric.notes?.length > 0 && <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm text-ink-2">{rubric.notes.map((n: string) => <li key={n}>⚠ {n}</li>)}</ul>}
            {lead.decline_reason && <p className="mt-3 text-sm"><b>Declined:</b> {lead.decline_reason}</p>}
          </Section>

          <Section title="What the caller told us">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {[
                ["Property", lead.property], ["Carpet area", lead.carpet_sqft && `${lead.carpet_sqft} sq ft`], ["Location", lead.location], ["Scope", lead.scope],
                ["Site", lead.site_status], ["Needed by", lead.timeline], ["Owner / tenant", lead.occupancy && `${lead.occupancy}${lead.landlord_permission && lead.landlord_permission !== "not_applicable" ? ` (landlord: ${lead.landlord_permission})` : ""}`],
                ["Decision-maker", lead.decision_maker], ["Budget (volunteered)", lead.budget ?? "not discussed"], ["Heard about us", lead.referral],
                ["Consultation", [lead.consultation_mode, lead.preferred_slot].filter(Boolean).join(" · ")], ["Mood", lead.sentiment],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-ink-3">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
          </Section>

          {meetings.map((m: any) => <MeetingCard key={m.id} m={m} act={act} />)}

          <Section title={`Calls (${calls.length})`}>
            <div className="space-y-4">
              {calls.map((c: any) => (
                <details key={c.id} className="rounded-lg border border-line">
                  <summary className="cursor-pointer px-3 py-2 text-sm">
                    <span className="font-medium">{when(c.started_at)}</span> · {duration(c.duration_sec)} · <span className="text-ink-2">{c.summary}</span>
                  </summary>
                  <div className="space-y-1.5 border-t border-line p-3 text-sm">
                    {c.recording_url && <a href={c.recording_url} className="btn mb-2" target="_blank" rel="noreferrer">▶ Recording</a>}
                    {(c.transcript ?? "No transcript").split(/\n+/).filter(Boolean).map((line: string, i: number) => (
                      <p key={i} className={`rounded px-2 py-1 ${/AGENT:/.test(line) ? "bg-ink/[0.04]" : "bg-s1/[0.07]"}`}>{line}</p>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          {escalations.map((e: any) => (
            <div key={e.id} className={`card p-4 ${e.status !== "resolved" ? "border-critical/50" : ""}`}>
              <div className="flex items-center justify-between"><Pill tone={e.status === "resolved" ? "good" : "critical"}>{e.kind === "existing_client_complaint" ? "Complaint" : "Frustrated lead"} · {e.status}</Pill><span className="text-xs text-ink-3">due {when(e.due_at)}</span></div>
              <p className="mt-2 text-sm text-ink-2">{e.details}</p>
              {e.status !== "resolved" && (
                <div className="mt-3 flex gap-2">
                  {e.status === "open" && <button className="btn" onClick={() => act(`/escalations/${e.id}`, { status: "acknowledged" })}>Calling now</button>}
                  <button className="btn-primary" onClick={() => act(`/escalations/${e.id}`, { status: "resolved" })}>Resolved</button>
                </div>
              )}
            </div>
          ))}
          {lead.handoff_note && (
            <Section title="Handoff note sent to designer">
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink-2">{lead.handoff_note}</pre>
            </Section>
          )}
          <Section title="Timeline">
            <ol className="relative space-y-3 border-l border-line pl-4">
              {activity.map((a: any) => (
                <li key={a.id} className="text-sm">
                  <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-accent" />
                  <div className="text-xs text-ink-3">{when(a.at)}</div>
                  <div className="text-ink-2">{a.message}</div>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </div>
  );
}

function StageActions({ lead, act }: { lead: any; act: (p: string, b: unknown) => Promise<void> }) {
  const canHandoff = ["qualified", "needs_info", "declined", "nurture", "no_show"].includes(lead.stage) || !lead.designer_id && lead.stage !== "escalated";
  return (
    <div className="flex flex-wrap gap-2">
      {canHandoff && lead.qualification !== "escalation" && (
        <button className="btn-primary" onClick={() => act(`/leads/${lead.id}/handoff`, { override: lead.qualification !== "qualified" })}>
          {lead.qualification === "qualified" ? "Assign designer & book" : "Override → send to designer"}
        </button>
      )}
      <select className="input" value="" onChange={(e) => e.target.value && act(`/leads/${lead.id}/stage`, { stage: e.target.value })}>
        <option value="">Move to stage…</option>
        {["proposal", "won", "lost", "nurture", "declined"].map((s) => <option key={s} value={s}>{STAGES[s].label}</option>)}
      </select>
    </div>
  );
}

function MeetingCard({ m, act }: { m: any; act: (p: string, b: unknown) => Promise<void> }) {
  const [notes, setNotes] = useState("");
  const summary = m.summary_json ? JSON.parse(m.summary_json) : null;
  const statusTone: Record<string, any> = { scheduled: "info", attended: "good", customer_no_show: "serious", designer_missed: "critical", rescheduled: "warn", cancelled: "neutral" };
  return (
    <Section title={`Consultation · ${when(m.start_at, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`}
      right={<Pill tone={statusTone[m.status]}>{m.status.replace(/_/g, " ")}</Pill>}>
      <div className="text-sm text-ink-2">{m.designer_name} · {m.mode === "studio" ? "At studio" : `Site visit${m.location ? ` — ${m.location}` : ""}`}{m.calendar_event_id ? " · calendar invite sent" : " · no calendar invite (Google not connected)"}</div>
      {m.outcome_reason && <p className="mt-2 text-sm"><b>Reason:</b> {m.outcome_reason}</p>}
      {m.status === "scheduled" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" onClick={() => act(`/meetings/${m.id}/outcome`, { outcome: "attended" })}>✓ Happened</button>
          <button className="btn" onClick={() => { const r = prompt("Why didn't the client show up?"); act(`/meetings/${m.id}/outcome`, { outcome: "customer_no_show", reason: r || undefined }); }}>Client no-show</button>
          <button className="btn" onClick={() => { const r = prompt("Why couldn't the designer attend?"); act(`/meetings/${m.id}/outcome`, { outcome: "designer_missed", reason: r || undefined }); }}>Designer missed</button>
        </div>
      )}
      {m.status === "attended" && !m.notes_raw && (
        <div className="mt-3 space-y-2">
          <textarea className="input w-full" rows={3} placeholder="Designer's notes: scope agreed, budget discussed, client priorities, next step…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn-primary" disabled={!notes.trim()} onClick={() => act(`/meetings/${m.id}/outcome`, { notes })}>Save & summarise</button>
        </div>
      )}
      {summary ? (
        <div className="mt-3 space-y-2 rounded-lg bg-ink/[0.03] p-3 text-sm">
          <p>{summary.summary}</p>
          <p><b>Scope:</b> {summary.scope_confirmed}</p>
          <p><b>Budget:</b> {summary.budget_discussed} · <b>Decision:</b> {summary.decision_timeline} · <b>Likelihood:</b> {summary.likelihood}</p>
          {summary.next_steps?.length > 0 && <p><b>Next:</b> {summary.next_steps.join("; ")}</p>}
          {summary.risks?.length > 0 && <p className="text-ink-2"><b>Risks:</b> {summary.risks.join("; ")}</p>}
        </div>
      ) : m.notes_raw && <p className="mt-3 whitespace-pre-wrap rounded-lg bg-ink/[0.03] p-3 text-sm">{m.notes_raw}</p>}
    </Section>
  );
}
