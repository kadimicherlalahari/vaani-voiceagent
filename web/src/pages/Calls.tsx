import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { duration, inr, STAGES, useApi, when } from "../api";
import { useFilters } from "../App";
import { Empty, Pill } from "../components/ui";

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "serious" | "info" | "neutral" }> = {
  completed: { label: "Answered", tone: "good" },
  in_progress: { label: "Live now", tone: "info" },
  dropped: { label: "Dropped — call back", tone: "warn" },
  missed: { label: "Missed — call back", tone: "serious" },
  failed: { label: "Failed", tone: "serious" },
};

export default function Calls() {
  const { seed } = useFilters();
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data } = useApi<any[]>(`/calls?seed=${seed ? 1 : 0}${status ? `&status=${status}` : ""}`, 8000);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Calls</h1>
          <p className="text-sm text-ink-2">Every incoming call, with transcript. Dropped and missed calls stay here until someone calls back.</p>
        </div>
        <div className="flex gap-1">
          {[["", "All"], ["completed", "Answered"], ["dropped", "Dropped"], ["missed", "Missed"]].map(([v, l]) => (
            <button key={v} onClick={() => setStatus(v)} className={`btn ${status === v ? "!border-accent !text-accent" : ""}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-line">
            <tr><th className="th">When</th><th className="th">Caller</th><th className="th">Status</th><th className="th">Outcome</th><th className="th">Summary</th><th className="th text-right">Length</th><th className="th text-right">Cost</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.map((c) => {
              const st = STATUS[c.status] ?? { label: c.status, tone: "neutral" as const };
              const leak = (() => { try { return String(JSON.parse(c.dispositions_json ?? "{}").pricing_leak) === "true"; } catch { return false; } })();
              return (
                <tr key={c.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(c.id)}>
                  <td className="td whitespace-nowrap">
                    <div>{when(c.started_at)}</div>
                    <div className="flex gap-1 text-xs text-ink-3">{c.after_hours ? "after hours" : "office hours"}{c.source !== "vaani" && <span>· {c.source}</span>}</div>
                  </td>
                  <td className="td"><div className="font-medium">{c.lead_name ?? "—"}</div><div className="tnum text-xs text-ink-3">{c.from_number ?? "unknown number"}</div></td>
                  <td className="td"><Pill tone={st.tone}>{st.label}</Pill></td>
                  <td className="td">{c.stage ? <Pill tone={STAGES[c.stage]?.tone}>{STAGES[c.stage]?.label ?? c.stage}</Pill> : "—"}{leak && <div className="mt-1"><Pill tone="critical">Price stated</Pill></div>}</td>
                  <td className="td max-w-md text-ink-2"><div className="line-clamp-2">{c.summary ?? "—"}</div></td>
                  <td className="td tnum text-right">{duration(c.duration_sec)}</td>
                  <td className="td tnum text-right">{inr(c.cost_inr, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data && !data.length && <Empty>No calls yet. Once Vaani's webhook is connected, calls appear here within seconds.</Empty>}
      </div>
      {open && <CallDrawer id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CallDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c } = useApi<any>(`/calls/${encodeURIComponent(id)}`, 0);
  const entities = c ? Object.entries(JSON.parse(c.entities_json ?? "{}")).filter(([, v]) => v != null && v !== "") : [];
  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-panel p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-ink-3">{id}</div>
            <h2 className="text-lg font-semibold">{c?.from_number ?? "Call"}</h2>
            <div className="text-sm text-ink-2">{when(c?.started_at)} · {duration(c?.duration_sec)}</div>
          </div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {c?.lead_id && <Link to={`/leads/${c.lead_id}`} className="btn-primary mt-3">Open lead →</Link>}
        {c?.recording_url && <a className="btn mt-3 ml-2" href={c.recording_url} target="_blank" rel="noreferrer">▶ Recording</a>}
        {c?.summary && <><h3 className="mt-5 text-xs font-semibold uppercase text-ink-3">Summary</h3><p className="mt-1 text-sm">{c.summary}</p></>}
        {entities.length > 0 && (
          <>
            <h3 className="mt-5 text-xs font-semibold uppercase text-ink-3">Extracted by the agent</h3>
            <dl className="mt-2 grid grid-cols-[160px_1fr] gap-x-3 gap-y-1 text-sm">
              {entities.map(([k, v]) => (<Fragment key={k}><dt className="text-ink-3">{k.replace(/_/g, " ")}</dt><dd>{String(v)}</dd></Fragment>))}
            </dl>
          </>
        )}
        <h3 className="mt-5 text-xs font-semibold uppercase text-ink-3">Transcript</h3>
        <div className="mt-2 space-y-2 text-sm">
          {(c?.transcript ?? "No transcript").split(/\n+/).filter(Boolean).map((line: string, i: number) => {
            const agent = /AGENT:/.test(line);
            return <p key={i} className={`rounded-lg px-3 py-2 ${agent ? "bg-ink/[0.04]" : "bg-s1/[0.07]"}`}>{line.replace(/^\[[\d:]+\]\s*/, "")}</p>;
          })}
        </div>
      </aside>
    </div>
  );
}
