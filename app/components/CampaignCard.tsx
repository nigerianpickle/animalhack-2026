'use client';

import { useState } from 'react';

type ActionType =
  | 'foster_recruitment'
  | 'adoption_event'
  | 'notify_partners'
  | 'spay_neuter_outreach'
  | 'owner_support_outreach'
  | 'microchip_clinic'
  | 'no_action';

const ACTION_UI: Record<ActionType, { label: string; icon: string; accent: string }> = {
  foster_recruitment: { label: 'Foster recruitment', icon: '🏠', accent: '#1b7f6b' },
  adoption_event: { label: 'Adoption event', icon: '🐕', accent: '#1b7f6b' },
  notify_partners: { label: 'Notify partners', icon: '📣', accent: '#475467' },
  spay_neuter_outreach: { label: 'Spay/neuter outreach', icon: '🩺', accent: '#0b6bcb' },
  owner_support_outreach: { label: 'Owner support outreach', icon: '🤝', accent: '#0b6bcb' },
  microchip_clinic: { label: 'Microchip clinic', icon: '📎', accent: '#0b6bcb' },
  no_action: { label: 'Monitor only', icon: '👁', accent: '#98a2b3' },
};

type Plan = {
  objective: string;
  targetArea: string;
  audience: string;
  channels: string[];
  keyMessage: string;
  outreachDraft: string;
  successMetric: string;
  timeline: { week: string; task: string }[];
  partners: string[];
};

export default function CampaignCard({
  area,
  areaType,
  category,
  actionTypes,
  facts,
}: {
  area: string;
  areaType: string;
  category: string;
  actionTypes: ActionType[];
  facts: string[];
}) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
  const [loading, setLoading] = useState<ActionType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function build(actionType: ActionType) {
    setLoading(actionType);
    setError(null);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, areaType, category, actionType, facts }),
      });
      if (!res.ok) throw new Error('Could not build plan');
      const data = await res.json();
      setPlan(data.plan);
      setActiveAction(actionType);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  if (plan && activeAction) {
    const ui = ACTION_UI[activeAction];
    return (
      <div
        style={{
          marginTop: 10,
          border: `1px solid ${ui.accent}33`,
          background: '#fbfdfc',
          borderRadius: 10,
          padding: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ fontSize: 13, color: ui.accent }}>
            {ui.icon} {ui.label} — draft plan
          </strong>
          <button onClick={() => { setPlan(null); setActiveAction(null); }} style={ghostBtn}>
            Close
          </button>
        </div>

        <Row label="Objective" value={plan.objective} />
        <Row label="Audience" value={plan.audience} />
        <Row label="Channels" value={plan.channels?.join(' · ')} />
        <Row label="Partners" value={plan.partners?.join(' · ')} />
        <Row label="Success metric" value={plan.successMetric} />

        <div style={{ marginTop: 10 }}>
          <div style={labelStyle}>4-week timeline</div>
          <ol style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#475467', lineHeight: 1.6 }}>
            {plan.timeline?.map((t, i) => (
              <li key={i}>
                <strong style={{ color: '#344054' }}>{t.week}:</strong> {t.task}
              </li>
            ))}
          </ol>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ ...labelStyle, display: 'flex', justifyContent: 'space-between' }}>
            <span>Outreach draft</span>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(plan.outreachDraft);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              style={ghostBtn}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: '#344054',
              background: '#fff',
              border: '1px solid #e8e8ec',
              borderRadius: 8,
              padding: 10,
              fontStyle: 'italic',
            }}
          >
            {plan.outreachDraft}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {actionTypes.map((a) => {
          const ui = ACTION_UI[a];
          const isLoading = loading === a;
          return (
            <button
              key={a}
              onClick={() => build(a)}
              disabled={!!loading}
              style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${ui.accent}55`,
                background: isLoading ? '#f2f4f7' : '#fff',
                color: ui.accent,
                cursor: loading ? 'wait' : 'pointer',
              }}
            >
              {isLoading ? 'Planning…' : `${ui.icon} ${ui.label}`}
            </button>
          );
        })}
      </div>
      {error && <div style={{ fontSize: 12, color: '#c1121f', marginTop: 6 }}>{error}</div>}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#98a2b3',
};

const ghostBtn: React.CSSProperties = {
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 6,
  border: '1px solid #d0d5dd',
  background: '#fff',
  color: '#475467',
  cursor: 'pointer',
};

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={labelStyle}>{label}</div>
      <div style={{ fontSize: 12.5, color: '#344054', lineHeight: 1.5, marginTop: 2 }}>{value}</div>
    </div>
  );
}