'use client';

import { useEffect, useState } from 'react';
import CampaignCard from './CampaignCard';

type Insight = {
  type: 'trend' | 'pattern' | 'suggestion';
  title: string;
  body: string;
  neighbourhood: string;
  category: string;
  metricValue: number;
};

const TYPE_CONFIG: Record<Insight['type'], { emoji: string; label: string; color: string }> = {
  trend: { emoji: '🚨', label: 'Emerging Trend', color: '#e63946' },
  pattern: { emoji: '📈', label: 'Pattern Detected', color: '#f4a261' },
  suggestion: { emoji: '💡', label: 'Suggestion', color: '#2a9d8f' },
};

export default function InsightFeed() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/insights')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load insights: ${res.status}`);
        return res.json();
      })
      .then((data: Insight[]) => setInsights(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '1rem', color: '#666' }}>
        Analyzing recent reports...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem', color: '#e63946' }}>
        Couldn&apos;t load insights: {error}
      </div>
    );
  }

  if (insights.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#666' }}>
        No significant trends detected right now.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {insights.map((insight, i) => {
        const config = TYPE_CONFIG[insight.type];
        return (
          <div
            key={i}
            style={{
              border: '1px solid #e0e0e0',
              borderLeft: `4px solid ${config.color}`,
              borderRadius: '8px',
              padding: '1rem',
              background: '#fff',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: config.color,
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
                marginBottom: '0.4rem',
              }}
            >
              {config.emoji} {config.label}
            </div>
            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
              {insight.title}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#444', marginBottom: '0.5rem' }}>
              {insight.body}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#999' }}>
              {insight.neighbourhood} · {insight.category.replace('_', ' ')} ·{' '}
              {insight.metricValue > 0 ? '+' : ''}
              {insight.metricValue}%
            </div>
            <CampaignCard neighbourhood={insight.neighbourhood} category={insight.category} />
          </div>
        );
      })}
    </div>
  );
}