'use client';

import { useEffect, useState } from 'react';
import CampaignCard from './CampaignCard';

type Insight = {
  type: 'trend' | 'pattern' | 'suggestion' | 'baseline';
  title: string;
  body: string;
  action: string;
  actionTypes: any[];
  area: string;
  areaType: string;
  category: string;
  metricValue: number;
  sampleSize: number;
  confidence: 'high' | 'medium' | 'low';
  kind: string;
  generated: boolean;
  _facts: string[];
};

const TYPE_CONFIG = {
  trend: { emoji: '🚨', label: 'Emerging trend', color: '#c1121f', tint: '#fdf0f1' },
  pattern: { emoji: '📈', label: 'Recurring pattern', color: '#b26a00', tint: '#fff8ec' },
  suggestion: { emoji: '💡', label: 'Structural finding', color: '#1b7f6b', tint: '#eefaf6' },
  baseline: { emoji: '📍', label: 'Sustained hotspot', color: '#475467', tint: '#f2f4f7' },
} as const;

const CONFIDENCE_UI = {
  high: { label: 'High confidence', color: '#1b7f6b' },
  medium: { label: 'Medium confidence', color: '#b26a00' },
  low: { label: 'Low confidence', color: '#98a2b3' },
} as const;

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

export default function InsightFeed() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [meta, setMeta] = useState<{ areaLabel?: string; reportCount?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    fetch('/api/insights')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Request failed (${r.status})`))))
      .then((d) => {
        setInsights(d.insights ?? []);
        setMeta(d.meta ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {meta && (
        <div style={{ fontSize: 11.5, color: '#98a2b3', lineHeight: 1.5 }}>
          Analysed {meta.reportCount?.toLocaleString()} City of Winnipeg 311 animal service requests, aggregated by{' '}
          {meta.areaLabel}. These are community reports, a proxy for shelter demand — not shelter intake records.
        </div>
      )}

      {insights.map((ins, i) => {
        const cfg = TYPE_CONFIG[ins.type] ?? TYPE_CONFIG.trend;
        const conf = CONFIDENCE_UI[ins.confidence] ?? CONFIDENCE_UI.low;
        const showDelta = ins.kind !== 'sustained' && ins.metricValue !== 0;

        return (
          <article
            key={i}
            style={{
              border: '1px solid #e8e8ec',
              borderLeft: `4px solid ${cfg.color}`,
              borderRadius: 12,
              padding: 16,
              background: '#fff',
              boxShadow: '0 1px 2px rgba(16,24,40,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: cfg.color,
                  background: cfg.tint,
                  padding: '3px 8px',
                  borderRadius: 999,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {cfg.emoji} {cfg.label}
              </span>
              {showDelta && (
                <span style={{ fontSize: 13, fontWeight: 700, color: ins.metricValue >= 0 ? '#c1121f' : '#1b7f6b' }}>
                  {ins.metricValue > 0 ? '▲ +' : '▼ '}
                  {Math.abs(ins.metricValue)}%
                </span>
              )}
            </div>

            <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#101828', lineHeight: 1.35 }}>
              {ins.title}
            </h3>
            <p style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.55, color: '#475467' }}>{ins.body}</p>

            <div
              style={{
                fontSize: 12.5,
                color: '#344054',
                background: '#f7f8fa',
                border: '1px solid #eceef1',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 10,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: '#101828' }}>Recommended: </strong>
              {ins.action}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, color: '#98a2b3' }}>
              <span>{ins.area}</span>
              <span>·</span>
              <span>{String(ins.category).replace(/_/g, ' ')}</span>
              <span>·</span>
              <span>n={ins.sampleSize}</span>
              <span>·</span>
              <span style={{ color: conf.color, fontWeight: 600 }}>{conf.label}</span>
              {!ins.generated && (
                <>
                  <span>·</span>
                  <span style={{ color: '#b26a00' }}>computed summary</span>
                </>
              )}
            </div>

            <CampaignCard
              area={ins.area}
              areaType={ins.areaType}
              category={ins.category}
              actionTypes={ins.actionTypes}
              facts={ins._facts ?? []}
            />
          </article>
        );
      })}
    </div>
  );
}