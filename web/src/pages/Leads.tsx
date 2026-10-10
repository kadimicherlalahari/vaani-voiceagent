import { useState } from "react";
import { Link } from "react-router-dom";
import { STAGES, ago, useApi, when } from "../api";
import { useFilters } from "../App";
import { Empty, Pill } from "../components/ui";

const TABS: [string, string, (l: any) => boolean][] = [
  ["action", "Needs action", (l) => ["qualified", "needs_info", "no_show", "escalated"].includes(l.stage) || (l.stage === "handoff_sent")],
  ["active", "With designers", (l) => ["handoff_sent", "accepted", "meeting_done", "proposal"].includes(l.stage)],
  ["won", "Won / lost", (l) => ["won", "lost"].includes(l.stage)],
  ["declined", "Declined", (l) => l.stage === "declined"],
  ["nurture", "Nurture", (l) => l.stage === "nurture"],
  ["all", "All", () => true],
];

export default function Leads() {
  const { seed } = useFilters();
  const [tab, setTab] = useState("action");
  const [q, setQ] = useState("");
  const { data } = useApi<any[]>(`/leads?seed=${seed ? 1 : 0}`, 10000);
  const filter = TABS.find((t) => t[0] === tab)![2];
  const rows = (data ?? []).filter(filter).filter((l) => !q || JSON.stringify([l.name, l.phone, l.location, l.property]).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Leads</h1>
          <p className="text-sm text-ink-2">One row per caller. The agent's rubric decides the first step; you can override it on the lead.</p>
        </div>
        <input className="input w-64" placeholder="Search name, phone, area…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map(([k, label, f]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn whitespace-nowrap ${tab === k ? "!border-accent !text-accent" : ""}`}>
            {label} <span className="tnum text-ink-3">{(data ?? []).filter(f).length}</span>
          </button>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-line">
            <tr><th className="th">Caller</th><th className="th">Project</th><th className="th">Stage</th><th className="th">Designer</th><th className="th">Consultation</th><th className="th">First call</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((l) => (
              <tr key={l.id} className="hover:bg-surface">
                <td className="td">
                  <Link to={`/leads/${l.id}`} className="font-medium hover:text-accent">{l.name ?? "Unknown caller"}</Link>
                  <div className="tnum text-xs text-ink-3">{l.phone}</div>
                  {l.priority !== "normal" && <div className="mt-1"><Pill tone={l.priority === "urgent" ? "critical" : "serious"}>{l.priority}</Pill></div>}
                </td>
                <td className="td text-ink-2">
                  <div>{[l.property, l.carpet_sqft && `${l.carpet_sqft} sq ft`].filter(Boolean).join(" · ") || "—"}</div>
                  <div className="text-xs text-ink-3">{l.location ?? ""}</div>
                </td>
                <td className="td">
                  <Pill tone={STAGES[l.stage]?.tone}>{STAGES[l.stage]?.label ?? l.stage}</Pill>
                  {l.decline_reason && <div className="mt-1 max-w-xs text-xs text-ink-3">{l.decline_reason}</div>}
                  {l.stage === "nurture" && l.reengage_on && <div className="mt-1 text-xs text-ink-3">Re-engage {l.reengage_on}</div>}
                </td>
                <td className="td">{l.designer_name ?? "—"}</td>
                <td className="td">{l.meeting_at ? <><div>{when(l.meeting_at)}</div><div className="text-xs text-ink-3">{l.meeting_status}</div></> : "—"}</td>
                <td className="td whitespace-nowrap text-ink-2">{ago(l.first_contact_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !rows.length && <Empty>Nothing here.</Empty>}
      </div>
    </div>
  );
}
