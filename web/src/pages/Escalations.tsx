import { Link } from "react-router-dom";
import { ago, apiPost, useApi, when } from "../api";
import { Empty, Pill } from "../components/ui";

export default function Escalations() {
  const { data, reload } = useApi<any[]>("/escalations", 10000);
  const set = async (id: number, status: string) => { await apiPost(`/escalations/${id}`, { status }); reload(); };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">Escalations</h1>
        <p className="text-sm text-ink-2">Existing-client complaints (15-minute callback promised on the call) and frustrated leads (senior designer, same day).</p>
      </div>
      <div className="space-y-3">
        {data?.map((e) => {
          const overdue = e.status === "open" && new Date(e.due_at) < new Date();
          return (
            <div key={e.id} className={`card flex flex-wrap items-start justify-between gap-4 p-4 ${overdue ? "border-critical" : ""}`}>
              <div className="max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={e.kind === "existing_client_complaint" ? "critical" : "serious"}>{e.kind === "existing_client_complaint" ? "Client complaint" : "Frustrated lead"}</Pill>
                  <Pill tone={e.status === "resolved" ? "good" : e.status === "acknowledged" ? "info" : overdue ? "critical" : "warn"}>{overdue ? "OVERDUE" : e.status}</Pill>
                  <span className="text-xs text-ink-3">raised {ago(e.created_at)}</span>
                </div>
                <div className="mt-2 font-medium">{e.lead_id ? <Link className="hover:text-accent" to={`/leads/${e.lead_id}`}>{e.lead_name ?? e.phone}</Link> : "Unknown"} <span className="tnum font-normal text-ink-3">{e.phone}</span></div>
                <p className="mt-1 text-sm text-ink-2">{e.details}</p>
                <p className="mt-1 text-xs text-ink-3">Owner: {e.assigned_name ?? "studio head"} · callback due {when(e.due_at)}</p>
              </div>
              {e.status !== "resolved" && (
                <div className="flex gap-2">
                  {e.status === "open" && <button className="btn" onClick={() => set(e.id, "acknowledged")}>Calling now</button>}
                  <button className="btn-primary" onClick={() => set(e.id, "resolved")}>Resolved</button>
                </div>
              )}
            </div>
          );
        })}
        {data && !data.length && <div className="card"><Empty>No escalations. 🎉</Empty></div>}
      </div>
    </div>
  );
}
