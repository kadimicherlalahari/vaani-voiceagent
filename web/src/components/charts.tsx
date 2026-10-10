// Small dependency-free charts following the dataviz method: thin marks with 4px rounded data
// ends on the baseline, 2px gaps between bars, recessive axes, a hover tooltip on every mark,
// legend whenever there are 2+ series, and a table fallback via the title/aria label.

import { useState, type ReactNode } from "react";

type Series = { key: string; label: string; color: string };

export function ColumnChart<T extends Record<string, any>>({
  data, x, series, height = 180, xLabel, shade, tickEvery = 1,
}: {
  data: T[];
  x: (d: T) => string;
  series: Series[];
  height?: number;
  xLabel?: (d: T, i: number) => string | null;
  shade?: (d: T) => boolean; // background band, e.g. after-hours
  tickEvery?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return (
    <div>
      {series.length > 1 && <Legend series={series} />}
      <div className="flex">
        <div className="relative mr-2 w-6 shrink-0" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className="tnum absolute right-0 -translate-y-1/2 text-[10px] text-ink-3" style={{ top: height - (t / top) * height }}>{t}</div>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line/70" style={{ top: height - (t / top) * height }} />
          ))}
          <div className="relative flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <div
                key={i}
                className={`relative flex h-full flex-1 items-end justify-center gap-[2px] ${shade?.(d) ? "bg-ink/[0.035]" : ""}`}
                onMouseEnter={() => setHover(i)}
                aria-label={`${x(d)}: ${series.map((s) => `${s.label} ${d[s.key]}`).join(", ")}`}
              >
                {series.map((s) => {
                  const v = Number(d[s.key]) || 0;
                  return (
                    <div
                      key={s.key}
                      className="w-full max-w-[18px] rounded-t-[4px] transition-opacity"
                      style={{ height: v ? Math.max(2, (v / top) * height) : 0, background: s.color, opacity: hover == null || hover === i ? 1 : 0.45 }}
                    />
                  );
                })}
                {hover === i && (
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 whitespace-nowrap rounded-md border border-line bg-panel px-2 py-1 text-xs shadow-lg">
                    <div className="font-medium">{x(d)}</div>
                    {series.map((s) => (
                      <div key={s.key} className="tnum flex items-center gap-1.5 text-ink-2">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                        {s.label}: <span className="text-ink">{d[s.key]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-[2px]">
            {data.map((d, i) => (
              <div key={i} className="tnum flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-ink-3">
                {i % tickEvery === 0 ? (xLabel ? xLabel(d, i) : x(d)) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BarList({ rows, color, format = (n) => String(n), empty }: { rows: { label: string; n: number; sub?: ReactNode }[]; color: string; format?: (n: number) => string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return <div className="py-6 text-center text-sm text-ink-3">{empty ?? "No data yet"}</div>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="group" title={`${r.label}: ${format(r.n)}`}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-ink-2">{r.label}</span>
            <span className="tnum font-medium">{format(r.n)}{r.sub}</span>
          </div>
          <div className="h-2 rounded-full bg-ink/5">
            <div className="h-2 rounded-r-[4px] rounded-l-full group-hover:opacity-80" style={{ width: `${(r.n / max) * 100}%`, background: color, minWidth: r.n ? 4 : 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Funnel as an ordered bar list with step conversion — a funnel chart shape would distort magnitudes. */
export function Funnel({ steps, color }: { steps: { stage: string; n: number }[]; color: string }) {
  const max = Math.max(1, steps[0]?.n ?? 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const prev = steps[i - 1]?.n;
        const conv = i > 0 && prev ? Math.round((s.n / prev) * 100) : null;
        return (
          <div key={s.stage} className="grid grid-cols-[150px_1fr_72px] items-center gap-3 text-xs" title={`${s.stage}: ${s.n}`}>
            <span className="truncate text-ink-2">{s.stage}</span>
            <div className="h-5 rounded-r-[4px] bg-ink/5">
              <div className="h-5 rounded-r-[4px]" style={{ width: `${(s.n / max) * 100}%`, background: color, minWidth: s.n ? 4 : 0 }} />
            </div>
            <span className="tnum text-right">
              <span className="font-semibold">{s.n}</span>
              {conv != null && <span className="ml-1 text-ink-3">{conv}%</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mb-2 flex gap-4 text-xs text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

function niceTicks(max: number) {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const out = [0];
  while (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}
