'use client';

import { useState } from 'react';

type CampaignCardProps = {
  neighbourhood: string;
  category: string;
};

const CAMPAIGN_TYPE_LABELS: Record<string, string> = {
  foster_recruitment: 'Launch Foster Recruitment Campaign',
  adoption_event: 'Create Adoption Event',
  notify_partners: 'Notify Partner Organizations',
};

export default function CampaignCard({ neighbourhood, category }: CampaignCardProps) {
  const [launched, setLaunched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function launchCampaign(type: keyof typeof CAMPAIGN_TYPE_LABELS) {
    setLoading(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighbourhood, category, type }),
      });
      if (!res.ok) throw new Error('Failed to launch campaign');
      setLaunched(type);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (launched) {
    return (
      <div
        style={{
          marginTop: '0.6rem',
          padding: '0.6rem',
          background: '#eafaf1',
          border: '1px solid #2a9d8f',
          borderRadius: '6px',
          fontSize: '0.85rem',
          color: '#1b6e5c',
        }}
      >
        ✅ {CAMPAIGN_TYPE_LABELS[launched]} launched for {neighbourhood}.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
      <button
        onClick={() => launchCampaign('foster_recruitment')}
        disabled={loading}
        style={{
          fontSize: '0.8rem',
          padding: '0.4rem 0.7rem',
          borderRadius: '6px',
          border: '1px solid #2a9d8f',
          background: loading ? '#f0f0f0' : '#fff',
          color: '#2a9d8f',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        🎯 Launch Foster Recruitment
      </button>
      <button
        onClick={() => launchCampaign('notify_partners')}
        disabled={loading}
        style={{
          fontSize: '0.8rem',
          padding: '0.4rem 0.7rem',
          borderRadius: '6px',
          border: '1px solid #999',
          background: loading ? '#f0f0f0' : '#fff',
          color: '#555',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        📣 Notify Partners
      </button>
    </div>
  );
}