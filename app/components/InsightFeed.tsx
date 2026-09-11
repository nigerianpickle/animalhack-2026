'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import CampaignCard from './CampaignCard';

type Signal = {
  scope: 'live' | 'historical';
  kind: 'upcoming_peak' | 'seasonal_anomaly' | 'yoy_growth' | 'recurring_peak' | 'multi_year_trend' | 'concentration' | 'hotspot';
  area: string; areaType: string; category: string;
  windowDays: number; windowLabel: string;
  current: number; baseline: number; baselineLabel: string; deviationPct: number;
  yoy: number | null;
  forecast: { expected: number; low: number; high: number; priorYears: number } | null;
  series: { year: number; month: number; count: number }[];
  breakdown: { label: string; count: number; share: number }[];
  breakdownLabel: string;
  sampleSize: number; priorYears: number; confidence: 'high' | 'medium' | 'low';
  facts: string[];
};

type Insight = {
  title: string; finding: string; context: string; whyItMatters: string; action: string;
  actionTypes: any[]; generated: boolean; signal: Signal;
};

type Meta = {
  scope: 'live' | 'historical';
  areaLabel: string;
  reportCount: number;
  dataStart: string;
  dataEnd: string;
  yearsCovered: number;
  windowDays: number;
  windowLabel: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function kindUI(s: Signal) {
  const falling = s.deviationPct < 0;
  switch (s.kind) {
    case 'upcoming_peak': return { emoji: '🔮', label: 'Forecast: rise ahead', color: '#5b3fd6', tint: '#f1eefc' };
    case 'seasonal_anomaly': return falling
      ? { emoji: '✅', label: 'Below seasonal norm', color: '#1b7f6b', tint: '#eefaf6' }
      : { emoji: '🚨', label: 'Above seasonal norm', color: '#c1121f', tint: '#fdf0f1' };
    case 'yoy_growth': return { emoji: '📈', label: 'Year-over-year change', color: '#b26a00', tint: '#fff8ec' };
    case 'recurring_peak': return { emoji: '🔁', label: 'Recurring annual peak', color: '#5b3fd6', tint: '#f1eefc' };
    case 'multi_year_trend': return falling
      ? { emoji: '📉', label: 'Multi-year decline', color: '#1b7f6b', tint: '#eefaf6' }
      : { emoji: '📊', label: 'Multi-year growth', color: '#b26a00', tint: '#fff8ec' };
    case 'concentration': return { emoji: '🎯', label: 'Structural concentration', color: '#0b6bcb', tint: '#edf4fc' };
    default: return { emoji: '📍', label: 'Persistent hotspot', color: '#475467', tint: '#f2f4f7' };
  }
}

const CONF = { high: '#1b7f6b', medium: '#b26a00', low: '#98a2b3' } as const;

function pivot(series: Signal['series']) {
  const years = [...new Set(series.map((p) => p.year))].sort();
  const rows = MONTHS.map((m, idx) => {
    const row: Record<string, any> = { month: m };
    for (const y of years) row[y] = series.find((p) => p.year === y && p.month === idx)?.count ?? null;
    return row;
  });
  return { rows, years };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 90, background: '#f7f8fa', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#98a2b3', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#101828', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: '#667085', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function InsightCard({ ins }: { ins: Insight }) {
  const [open, setOpen] = useState(false);
  const s = ins.signal;
  const ui = kindUI(s);
  const showDelta = s.kind !== 'hotspot';
  const { rows, years } = pivot(s.series);
  const latest = years[years.length - 1];

  return (
    <article style={{ border: '1px solid #e8e8ec', borderLeft: `4px solid ${ui.color}`, borderRadius: 12, padding: 16, background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: ui.color, background: ui.tint, padding: '3px 8px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {ui.emoji} {ui.label}
        </span>
        {showDelta && (
          <span style={{ fontSize: 13, fontWeight: 700, color: s.deviationPct >= 0 ? '#c1121f' : '#1b7f6b' }}>
            {s.deviationPct > 0 ? '▲ +' : '▼ '}{Math.abs(s.deviationPct)}%
            <span style={{ fontSize: 10, fontWeight: 500, color: '#98a2b3', marginLeft: 4 }}>vs {s.baselineLabel}</span>
          </span>
        )}
      </div>

      <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#101828', lineHeight: 1.35 }}>{ins.title}</h3>
      <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.55, color: '#475467' }}>{ins.finding}</p>

      {s.forecast && (
        <div style={{ fontSize: 12.5, color: '#344054', background: '#f1eefc', border: '1px solid #e2dcf7', borderRadius: 8, padding: '7px 10px', marginBottom: 8 }}>
          <strong style={{ color: '#5b3fd6' }}>Next 30 days:</strong> ~{s.forecast.expected} reports expected
          <span style={{ color: '#667085' }}> (range {s.forecast.low}–{s.forecast.high}, from {s.forecast.priorYears} prior yr{s.forecast.priorYears > 1 ? 's' : ''})</span>
        </div>
      )}

      <div style={{ fontSize: 12.5, color: '#344054', background: '#f7f8fa', border: '1px solid #eceef1', borderRadius: 8, padding: '8px 10px', marginBottom: 8, lineHeight: 1.5 }}>
        <strong style={{ color: '#101828' }}>Recommended: </strong>{ins.action}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: '#98a2b3' }}>
        <span>{s.area}</span><span>·</span>
        <span>{String(s.category).replace(/_/g, ' ')}</span><span>·</span>
        <span>n={s.sampleSize}</span><span>·</span>
        <span style={{ color: CONF[s.confidence], fontWeight: 600 }}>{s.confidence} confidence</span>
        {!ins.generated && (<><span>·</span><span style={{ color: '#b26a00' }}>computed summary</span></>)}
        <button onClick={() => setOpen(!open)} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: ui.color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {open ? 'Hide evidence ▲' : 'Show evidence ▼'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e8e8ec' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <Stat label={s.scope === 'live' ? s.windowLabel : 'Peak / latest'} value={String(s.current)} />
            <Stat label="Baseline" value={String(s.baseline)} sub={s.baselineLabel} />
            {s.yoy !== null && <Stat label="Prior year" value={String(s.yoy)} />}
            {s.forecast && <Stat label="Next 30d" value={`~${s.forecast.expected}`} sub={`${s.forecast.low}–${s.forecast.high}`} />}
          </div>

          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#98a2b3', marginBottom: 4 }}>
            Monthly reports · {latest} vs prior years
          </div>
          <div style={{ height: 170, marginBottom: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#98a2b3' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#98a2b3' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 10.5 }} />
                {years.map((y) => (
                  <Line key={y} type="monotone" dataKey={String(y)} connectNulls dot={false}
                    stroke={y === latest ? ui.color : '#98a2b3'} strokeWidth={y === latest ? 2.5 : 1.5}
                    strokeOpacity={y === latest ? 1 : 0.55} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {s.breakdown.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#98a2b3', marginBottom: 6 }}>{s.breakdownLabel}</div>
              {s.breakdown.map((b) => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <span style={{ width: 130, color: '#344054', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.label}</span>
                  <div style={{ flex: 1, height: 8, background: '#f2f4f7', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${b.share}%`, height: '100%', background: ui.color, opacity: 0.7 }} />
                  </div>
                  <span style={{ width: 60, textAlign: 'right', color: '#667085' }}>{b.count} · {b.share}%</span>
                </div>
              ))}
            </div>
          )}

          {ins.context && <p style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5, color: '#475467' }}><strong style={{ color: '#344054' }}>Context: </strong>{ins.context}</p>}
          {ins.whyItMatters && <p style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5, color: '#475467' }}><strong style={{ color: '#344054' }}>Why it matters: </strong>{ins.whyItMatters}</p>}

          <details style={{ fontSize: 11.5, color: '#667085' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Numbers behind this insight</summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>{s.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
          </details>
        </div>
      )}

      <CampaignCard area={s.area} areaType={s.areaType} category={s.category} actionTypes={ins.actionTypes} facts={s.facts} />
    </article>
  );
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ border: '1px solid #e8e8ec', borderRadius: 12, padding: 16, background: '#fff' }}>
          <div style={{ height: 10, width: 120, background: '#eef0f3', borderRadius: 4, marginBottom: 12 }} />
          <div style={{ height: 14, width: '72%', background: '#eef0f3', borderRadius: 4, marginBottom: 10 }} />
          <div style={{ height: 10, width: '96%', background: '#f3f4f6', borderRadius: 4, marginBottom: 6 }} />
          <div style={{ height: 10, width: '84%', background: '#f3f4f6', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

export default function InsightFeed({
  scope = 'live',
  category = 'all',
  period = 'all',
}: {
  scope?: 'live' | 'historical';
  category?: string;
  period?: string;
}) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    qs.set('scope', scope);
    if (category && category !== 'all') qs.set('category', category);
    // The historical feed intentionally ignores the time filter.
    if (scope === 'live' && period && period !== 'all') qs.set('period', period);

    fetch(`/api/insights?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (${r.status})`))))
      .then((d) => {
        setInsights(d.insights ?? []);
        setMeta(d.meta ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [scope, category, period]);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div style={{ padding: 16, border: '1px solid #f2c9cd', background: '#fdf0f1', borderRadius: 12 }}>
        <div style={{ color: '#c1121f', fontSize: 13, marginBottom: 8 }}>{error}</div>
        <button onClick={load} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #d0d5dd', background: '#fff', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div style={{ padding: 16, color: '#6b7280', border: '1px dashed #d8dbe0', borderRadius: 12, fontSize: 13 }}>
        {scope === 'live'
          ? 'No significant deviations in this window. Try a longer period or a different category.'
          : 'Not enough multi-year history for this category to detect recurring patterns.'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {meta && (
        <div style={{ fontSize: 11.5, color: '#667085', lineHeight: 1.5, background: '#f7f8fa', border: '1px solid #eceef1', borderRadius: 8, padding: '8px 10px' }}>
          {scope === 'live' ? (
            <>
              Analysing the <strong>{meta.windowLabel}</strong> against the same {meta.windowDays}-day window in prior years, so seasonal effects are already removed.
              Follows the filters above.
            </>
          ) : (
            <>
              Multi-year patterns across {meta.yearsCovered} years ({meta.dataStart} to {meta.dataEnd}), aggregated by {meta.areaLabel}.
              <strong> Not affected by the time filter</strong> — these describe standing patterns, not current movement.
            </>
          )}
          {' '}Community 311 reports lead shelter demand; they are not intake records.
        </div>
      )}
      {insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
    </div>
  );
}