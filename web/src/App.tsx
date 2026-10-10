import { createContext, useContext, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { getToken, setToken, useApi } from "./api";
import Overview from "./pages/Overview";
import Calls from "./pages/Calls";
import Leads from "./pages/Leads";
import LeadDetail from "./pages/LeadDetail";
import Escalations from "./pages/Escalations";
import Designers from "./pages/Designers";
import Setup from "./pages/Setup";

type Filters = { days: number; seed: boolean; qs: string; setDays: (d: number) => void; setSeed: (s: boolean) => void };
const FiltersCtx = createContext<Filters>(null!);
export const useFilters = () => useContext(FiltersCtx);

const load = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export default function App() {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const onLogout = () => setLocked(true);
    window.addEventListener("aangan:logout", onLogout);
    return () => window.removeEventListener("aangan:logout", onLogout);
  }, []);
  if (locked) return <Login onDone={() => setLocked(false)} />;
  return <Shell />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/settings", { headers: { Authorization: `Bearer ${pw}` } });
    if (r.ok) { setToken(pw); onDone(); } else setErr(true);
  };
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3 p-6">
        <div><span className="font-display text-2xl text-accent">Aangan</span> <span className="text-ink-2">Enquiry Desk</span></div>
        <p className="text-sm text-ink-2">Studio staff only — this dashboard holds callers' details.</p>
        <input className="input w-full" type="password" autoFocus placeholder="Dashboard password" value={pw} onChange={(e) => { setPw(e.target.value); setErr(false); }} />
        {err && <p className="text-sm text-critical">Wrong password.</p>}
        <button className="btn-primary w-full justify-center" disabled={!pw}>Sign in</button>
      </form>
    </div>
  );
}

function Shell() {
  const [days, setDays] = useState(Number(load("days", "30")));
  const [seed, setSeed] = useState(load("seed", "0") === "1");
  useEffect(() => save("days", String(days)), [days]);
  useEffect(() => save("seed", seed ? "1" : "0"), [seed]);
  const qs = `days=${days}&seed=${seed ? 1 : 0}`;
  const { data: esc } = useApi<any[]>("/escalations", 20000);
  const openEsc = esc?.filter((e) => e.status !== "resolved").length ?? 0;

  const nav = [
    ["/", "Overview"], ["/calls", "Calls"], ["/leads", "Leads"], ["/escalations", "Escalations"], ["/designers", "Designers"], ["/setup", "Setup"],
  ];
  return (
    <FiltersCtx.Provider value={{ days, seed, qs, setDays, setSeed }}>
      <div className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-xl text-accent">Aangan</span>
              <span className="text-sm text-ink-2">Enquiry Desk</span>
            </div>
            <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto">
              {nav.map(([to, label]) => (
                <NavLink key={to} to={to} end={to === "/"}
                  className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${isActive ? "bg-ink/[0.06] font-medium text-ink" : "text-ink-2 hover:text-ink"}`}>
                  {label}
                  {label === "Escalations" && openEsc > 0 && <span className="ml-1.5 rounded-full bg-critical px-1.5 text-[10px] font-semibold text-white">{openEsc}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="flex items-center gap-3 text-sm">
              {getToken() && <button className="text-ink-3 hover:text-ink" onClick={() => { setToken(""); location.reload(); }}>Sign out</button>}
              <select className="input !py-1" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Date range">
                <option value={1}>Today</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-ink-2" title="Include the 20 September 2026 phone enquiries handled by the front desk, for comparison">
                <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="accent-[rgb(var(--accent))]" />
                Sept baseline
              </label>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/leads/:id" element={<LeadDetail />} />
            <Route path="/escalations" element={<Escalations />} />
            <Route path="/designers" element={<Designers />} />
            <Route path="/setup" element={<Setup />} />
          </Routes>
        </main>
      </div>
    </FiltersCtx.Provider>
  );
}
