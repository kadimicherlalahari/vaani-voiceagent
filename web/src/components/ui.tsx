import type { ReactNode } from "react";
import type { Tone } from "../api";

const toneCls: Record<Tone, string> = {
  neutral: "bg-ink/5 text-ink-2",
  info: "bg-s1/10 text-s1",
  good: "bg-good/10 text-[#0a7a0a] dark:text-good",
  warn: "bg-warn/15 text-[#8a5d00] dark:text-warn",
  serious: "bg-serious/15 text-[#a4461f] dark:text-serious",
  critical: "bg-critical/10 text-critical",
};
const toneIcon: Partial<Record<Tone, string>> = { good: "✓", warn: "!", serious: "!", critical: "▲" };

/** Status pill: colour is never the only signal — every status tone carries an icon + label. */
export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${toneCls[tone]}`}>
      {toneIcon[tone] && <span aria-hidden>{toneIcon[tone]}</span>}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="tnum text-2xl font-semibold tracking-tight">{value}</div>
        {tone && tone !== "neutral" && <Pill tone={tone}>{tone === "good" ? "on track" : "attention"}</Pill>}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export function Section({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-ink-3">{children}</div>;
}

export function Copy({ text }: { text: string }) {
  return (
    <button className="btn !px-2 !py-1 text-xs" onClick={() => navigator.clipboard.writeText(text)} title="Copy">
      Copy
    </button>
  );
}
