import { useState } from "react";
import { apiPost, useApi } from "../api";
import { Copy, Pill } from "../components/ui";

const LEVELS = ["designer", "senior", "principal", "studio_head"];

export default function Designers() {
  const { data, reload } = useApi<any[]>("/designers", 15000);
  const { data: settings } = useApi<any>("/settings", 0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", seniority: "designer" });
  const add = async () => { await apiPost("/designers", form); setForm({ name: "", email: "", phone: "", seniority: "designer" }); reload(); };
  const patch = async (id: number, body: object) => { await apiPost(`/designers/${id}`, body, "PATCH"); reload(); };
  const bot = settings?.botUsername;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">Designers</h1>
        <p className="text-sm text-ink-2">
          Who receives leads. Seniors and principals get villas, offices, 2,500+ sq ft, frustrated callers and referrals from Nikhil's network; everyone else is round-robin by earliest free slot.
          {bot
            ? <>Send each designer their Telegram link below — opening it and pressing <b>Start</b> links them to <a className="text-accent" href={`https://t.me/${bot}`} target="_blank" rel="noreferrer">@{bot}</a>. Studio head: <a className="text-accent" href={`https://t.me/${bot}?start=STUDIOHEAD`} target="_blank" rel="noreferrer">escalations link</a>.</>
            : "Telegram links appear here once TELEGRAM_BOT_TOKEN is set."}
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-line">
            <tr><th className="th">Name</th><th className="th">Level</th><th className="th">Email (calendar)</th><th className="th">Telegram</th><th className="th text-right">Open leads</th><th className="th text-right">Avg accept</th><th className="th text-right">Held</th><th className="th text-right">No-shows</th><th className="th text-right">Missed</th><th className="th"></th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data?.map((d) => (
              <tr key={d.id} className={d.active ? "" : "opacity-50"}>
                <td className="td font-medium">{d.name}</td>
                <td className="td"><select className="input !py-0.5" value={d.seniority} onChange={(e) => patch(d.id, { seniority: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></td>
                <td className="td"><input className="input w-56 !py-0.5" defaultValue={d.email ?? ""} placeholder="name@studio.com" onBlur={(e) => e.target.value !== (d.email ?? "") && patch(d.id, { email: e.target.value, calendar_id: e.target.value })} /></td>
                <td className="td">
                  {d.telegram_chat_id ? <Pill tone="good">linked</Pill> : bot ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <a className="text-accent" href={`https://t.me/${bot}?start=${d.link_code}`} target="_blank" rel="noreferrer">link</a>
                      <Copy text={`https://t.me/${bot}?start=${d.link_code}`} />
                    </span>
                  ) : <span className="text-xs text-ink-2">code <code className="rounded bg-ink/5 px-1 font-semibold">{d.link_code}</code></span>}
                </td>
                <td className="td tnum text-right">{d.leads_open}</td>
                <td className="td tnum text-right">{d.avg_accept_min != null ? `${Math.round(d.avg_accept_min)}m` : "—"}</td>
                <td className="td tnum text-right">{d.meetings_attended}</td>
                <td className="td tnum text-right">{d.no_shows}</td>
                <td className="td tnum text-right">{d.missed}</td>
                <td className="td text-right"><button className="btn !py-0.5 text-xs" onClick={() => patch(d.id, { active: d.active ? 0 : 1 })}>{d.active ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card flex flex-wrap items-end gap-2 p-4">
        <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Email (Google Calendar)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <select className="input" value={form.seniority} onChange={(e) => setForm({ ...form, seniority: e.target.value })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
        <button className="btn-primary" disabled={!form.name} onClick={add}>Add designer</button>
      </div>
    </div>
  );
}
