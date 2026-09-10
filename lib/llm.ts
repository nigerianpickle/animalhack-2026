import type { Trend } from './stats';

export type Insight = {
  type: 'trend' | 'pattern' | 'suggestion';
  title: string;
  body: string;
  neighbourhood: string;
  category: string;
  metricValue: number;
};

type ParsedInsight = { type: Insight['type']; title: string; body: string };

const CATEGORY_LABELS: Record<string, string> = {
  stray_roaming: 'stray/roaming animal reports',
  lost_found: 'lost & found reports',
  welfare_distress: 'welfare/distress reports',
  surrender_capacity: 'surrender reports',
  safety_complaint: 'safety complaints',
};

async function callGroq(prompt: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`LLM call failed: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

export async function generateInsight(trend: Trend): Promise<Insight> {
  const direction = trend.changePercent >= 0 ? 'increased' : 'decreased';
  const label = CATEGORY_LABELS[trend.category] || trend.category;

  const prompt = `You are analyzing animal welfare data for Winnipeg. Here is a real statistic:

Neighbourhood: ${trend.neighbourhood}
Category: ${label}
Current period count: ${trend.current}
Previous period count: ${trend.previous}
Change: ${direction} ${Math.abs(trend.changePercent)}%

Write a short, factual insight based ONLY on these numbers. Do not invent causes or details not given.
Never leave the body field empty.
Respond in strict JSON only, no markdown fences, no extra text:
{
  "type": "trend" | "pattern" | "suggestion",
  "title": "a short headline, under 12 words",
  "body": "1-2 sentences explaining the trend and a concrete suggested action"
}`;

  let text = await callGroq(prompt);
  let clean = text.replace(/```json|```/g, '').trim();

  let parsed: ParsedInsight | null = null;

  try {
    const attempt = JSON.parse(clean);
    if (attempt.body && attempt.body.trim().length > 0) {
      parsed = attempt as ParsedInsight;
    }
  } catch {
    parsed = null;
  }

  // one retry if body was empty or JSON parse failed
  if (!parsed) {
    text = await callGroq(prompt);
    clean = text.replace(/```json|```/g, '').trim();
    try {
      parsed = JSON.parse(clean) as ParsedInsight;
    } catch {
      parsed = {
        type: 'trend',
        title: `${label} shift in ${trend.neighbourhood}`,
        body: `${label} in ${trend.neighbourhood} ${direction} ${Math.abs(trend.changePercent)}% (${trend.previous} → ${trend.current}).`,
      };
    }
  }

  return {
    ...parsed,
    neighbourhood: trend.neighbourhood,
    category: trend.category,
    metricValue: trend.changePercent,
  };
}