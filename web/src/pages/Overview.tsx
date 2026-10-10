import { Link } from "react-router-dom";
import { useApi, inr, lakh } from "../api";
import { useFilters } from "../App";
import { BarList, ColumnChart, Funnel } from "../components/charts";
import { Section, Stat } from "../components/ui";

const S1 = "rgb(var(--s1))";
const S2 = "rgb(var(--s2))";

export default function Overview() {
  const { qs, days, seed } = useFilters();
  const { data: o, error } = useApi<any>(`/overview?${qs}`);
  if (error) return <div className="card p-6 text-sm text-critical">Can't reach the server: {error}</div>;
  if (!o) return <div className="text-sm text-ink-3">Loading…</div>;

  const handoff = o.speed.medianHandoffMin;
  const afterPct = o.calls.total ? Math.round((o.calls.afterHours / o.calls.total) * 100) : 0;
  const leadsTotal = o.outcomes.qualified + o.outcomes.declined + o.outcomes.nurture + o.outcomes.needsInfo + o.outcomes.escalation;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">How the phone line is doing</h1>
          <p className="text-sm text-ink-2">
            {days === 1 ? "Today" : `Last ${days} days`} · every call answered by the AI agent or front desk
            {seed && " · including September baseline (front desk only)"}
          </p>
        </div>
        {o.escalations.overdue > 0 && (
          <Link to="/escalations" className="rounded-lg bg-critical px-3 py-1.5 text-sm font-medium text-white">▲ {o.escalations.overdue} overdue escalation{o.escalations.overdue > 1 ? "s" : ""}</Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Calls answered" value={o.calls.answered} sub={`${o.calls.total} total · ${o.calls.dropped} dropped · ${o.calls.missed} missed`} />
        <Stat label="Outside 10am–7pm" value={`${afterPct}%`} sub={`${o.calls.afterHours} calls the front desk would have missed`} />
        <Stat label="Qualified for a designer" value={o.outcomes.qualified} sub={leadsTotal ? `${Math.round((o.outcomes.qualified / leadsTotal) * 100)}% of enquiries` : "—"} />
        <Stat
          label="Call → designer handoff (median)"
          value={handoff == null ? "—" : handoff < 1 ? "<1 min" : `${Math.round(handoff)} min`}
          sub={o.speed.handoffWithin5MinPct != null ? `${o.speed.handoffWithin5MinPct}% within 5 min · target: 5 min` : "Target: 5 min"}
          tone={handoff == null ? undefined : handoff <= 5 ? "good" : "serious"}
        />
        <Stat
          label="Designer accepted (median)"
          value={o.speed.medianAcceptMin == null ? "—" : `${Math.round(o.speed.medianAcceptMin)} min`}
          sub={o.speed.acceptedWithin1hPct != null ? `${o.speed.acceptedWithin1hPct}% within 1 hour (4× conversion)` : "Answered <1 hr converts 4×"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Calls and qualified leads per day" className="lg:col-span-2">
          <ColumnChart
            data={o.byDay}
            x={(d: any) => new Date(d.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            xLabel={(d: any) => new Date(d.day).toLocaleDateString("en-IN", { day: "numeric" })}
            tickEvery={days > 30 ? 7 : days > 7 ? 3 : 1}
            series={[{ key: "calls", label: "Calls", color: S1 }, { key: "qualified", label: "Qualified", color: S2 }]}
          />
        </Section>
        <Section title="When people call (IST)" right={<span className="text-xs text-ink-3">shaded = front desk closed</span>}>
          <ColumnChart data={o.byHour} x={(d: any) => `${d.hour}:00–${d.hour + 1}:00`} xLabel={(d: any) => (d.hour % 6 === 0 ? String(d.hour) : "")} shade={(d: any) => d.afterHours} series={[{ key: "calls", label: "Calls", color: S1 }]} />
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="From call to signed project" className="lg:col-span-2">
          <Funnel steps={o.funnel} color={S1} />
        </Section>
        <Section title="Why enquiries were declined">
          <BarList rows={o.declineReasons.map((r: any) => ({ label: r.reason, n: r.n }))} color={S1} empty="No declines in this period" />
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center text-xs text-ink-2">
            <div><div className="tnum text-lg font-semibold text-ink">{o.outcomes.nurture}</div>Nurture</div>
            <div><div className="tnum text-lg font-semibold text-ink">{o.outcomes.needsInfo}</div>Need info</div>
            <div><div className="tnum text-lg font-semibold text-ink">{o.outcomes.escalation}</div>Complaints</div>
          </div>
        </Section>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold">What it costs and what it's generating</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Stat label="Run cost this period" value={inr(o.cost.totalInr)} sub={`Voice ${inr(o.cost.vaaniInr)} · AI summaries ${inr(o.cost.aiInr)} (Gemini free tier)`} />
          <Stat label="Cost per call" value={inr(o.cost.perCallInr, 1)} />
          <Stat label="Cost per qualified lead" value={inr(o.cost.perQualifiedLeadInr)} />
          <Stat label="Monthly run-rate" value={inr(o.cost.monthlyRunRateInr)} sub="At this period's volume" />
          <Stat label="Qualified pipeline (est.)" value={lakh(o.value.estPipelineInr)} sub={o.value.assumption} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Consultations">
          <div className="grid grid-cols-4 gap-2 text-center text-xs text-ink-2">
            {[
              ["Upcoming", o.meetings.scheduled],
              ["Held", o.meetings.attended],
              ["Client no-show", o.meetings.customerNoShow],
              ["Designer missed", o.meetings.designerMissed],
            ].map(([l, n]) => (
              <div key={l as string}><div className="tnum text-xl font-semibold text-ink">{n}</div>{l}</div>
            ))}
          </div>
          {o.meetings.awaitingUpdate > 0 && <p className="mt-3 text-xs text-ink-3">{o.meetings.awaitingUpdate} past consultation(s) waiting for the designer's update on Telegram.</p>}
        </Section>
        <Section title="Quality checks">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><span className="text-ink-2">Calls where the agent stated a price</span><span className={`tnum font-semibold ${o.calls.pricingLeaks ? "text-critical" : ""}`}>{o.calls.pricingLeaks ? `▲ ${o.calls.pricingLeaks}` : "0 ✓"}</span></li>
            <li className="flex justify-between"><span className="text-ink-2">Escalations open / total</span><span className="tnum font-semibold">{o.escalations.open} / {o.escalations.total}</span></li>
            <li className="flex justify-between"><span className="text-ink-2">Average call length</span><span className="tnum font-semibold">{Math.floor(o.calls.avgDurationSec / 60)}m {o.calls.avgDurationSec % 60}s</span></li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
