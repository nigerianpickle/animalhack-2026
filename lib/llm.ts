import type { Signal, ActionType } from './stats';
import { CATEGORY_LABEL } from './stats';

export type Insight = {
  title: string;
  finding: string;
  context: string;
  whyItMatters: string;
  action: string;
  actionTypes: ActionType[];
  generated: boolean;
  signal: Signal;
};

export const ACTION_LABEL: Record<ActionType, string> = {
  foster_recruitment: 'Foster recruitment drive',
  adoption_event: 'Adoption event',
  notify_partners: 'Notify partner rescues',
  spay_neuter_outreach: 'Spay/neuter outreach',
  owner_support_outreach: 'Owner support outreach',
  microchip_clinic: 'Microchip & ID clinic',
  no_action: 'Monitor only',
};

const FRAMING: Record<Signal['kind'], string> = {
  upcoming_peak: 'A FORECAST from prior years. Emphasise the rise is expected and can be prepared for now — staffing, foster capacity, partner notice.',
  seasonal_anomaly: 'Compared against the same window in prior years, so this is a genuine deviation from normal, not seasonality. If below norm, say so plainly and recommend monitoring only.',
  yoy_growth: 'Year-over-year change for this window. Say whether the underlying problem is growing or shrinking.',
  recurring_peak: 'A pattern that repeats every year. The value here is predictability — name the month and stress that resourcing can be scheduled in advance rather than scrambled.',
  multi_year_trend: 'A long-run trajectory across complete years. Say whether the problem is structurally growing or shrinking, and what that implies for planning beyond this season.',
  concentration: 'One area is structurally over-represented in this category versus the city, sustained over years. Likely a local access gap (vet services, spay/neuter, ID). Recommend a targeted programme, not a one-off event.',
  hotspot: 'Persistent high volume, NOT a spike. Never use "rise", "surge" or "increase". Frame as sustained baseline demand justifying standing resources.',
};

const SYSTEM = 'You are an operations analyst for animal welfare in Winnipeg. Output raw JSON only. No prose, no code fences.';

async function callGroq(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
      reasoning_effort: 'low',
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function extractJson(raw: string): any {
  const c = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(c);
  } catch {
    const s = c.indexOf('{'), e = c.lastIndexOf('}');
    if (s !== -1 && e > s) return JSON.parse(c.slice(s, e + 1));
    throw new Error('no JSON');
  }
}

function prompt(s: Signal): string {
  return `Area: ${s.area} (${s.areaType}). Category: ${CATEGORY_LABEL[s.category]}. Confidence: ${s.confidence} (n=${s.sampleSize}, ${s.priorYears} prior year(s)).
Numbers:
${s.facts.map((f) => `- ${f}`).join('\n')}

${FRAMING[s.kind]}
Rules: use only these numbers. Never invent a cause — if you offer one, label it a hypothesis. Every percentage you quote must be attached to the exact two numbers it was computed from, as stated in the facts — do not pair a percentage with a different pair of numbers. This is Winnipeg 311 data: community-reported animal issues, a leading indicator of shelter demand, not intake records. Actions only from: ${s.candidateActions.join(', ')}.
JSON: {"title":"<12 words, names the area","finding":"1-2 sentences citing the key numbers","context":"1 sentence: is this normal, and how sure are we","whyItMatters":"1-2 sentences: what it means for shelter capacity or prevention","action":"<25 words, doable within 2 weeks","actionTypes":["..."]}`;
}

function fallback(s: Signal): Insight {
  const falling = s.deviationPct < 0 && s.kind !== 'hotspot' && s.kind !== 'concentration';
  const descriptor =
    s.kind === 'recurring_peak' ? 'recurring annual peak'
    : s.kind === 'multi_year_trend' ? (falling ? 'declining over years' : 'growing over years')
    : s.kind === 'upcoming_peak' ? 'expected to rise'
    : s.kind === 'hotspot' ? 'sustained high volume'
    : s.kind === 'concentration' ? 'over-represented category'
    : falling ? 'below seasonal norm' : 'above seasonal norm';

  return {
    title: `${s.area}: ${CATEGORY_LABEL[s.category]} ${descriptor}`,
    finding: s.facts.slice(0, 2).join(' '),
    context: s.priorYears ? `Based on ${s.priorYears} prior year(s) of data; confidence ${s.confidence}.` : `Confidence ${s.confidence}.`,
    whyItMatters: falling
      ? 'Lower community reporting means less pressure on intake for now.'
      : 'Community reports lead intake pressure; acting early is cheaper than reacting at capacity.',
    action: falling ? `No action needed — keep monitoring ${s.area}.` : `Confirm against internal intake records, then scope a response for ${s.area}.`,
    actionTypes: s.candidateActions.slice(0, 2),
    generated: false,
    signal: s,
  };
}

export async function generateInsight(s: Signal): Promise<Insight> {
  try {
    const c = extractJson(await callGroq(prompt(s), 450));
    if (!c?.title?.trim() || !c?.finding?.trim()) throw new Error('empty fields');
    const valid: ActionType[] = Array.isArray(c.actionTypes)
      ? c.actionTypes.filter((a: ActionType) => s.candidateActions.includes(a))
      : [];
    return {
      title: String(c.title).trim(),
      finding: String(c.finding).trim(),
      context: String(c.context ?? '').trim(),
      whyItMatters: String(c.whyItMatters ?? '').trim(),
      action: String(c.action ?? '').trim() || 'Review at the next operations meeting.',
      actionTypes: valid.length ? valid : s.candidateActions.slice(0, 2),
      generated: true,
      signal: s,
    };
  } catch (err) {
    console.error(`[insight] ${s.area}/${s.kind}: ${(err as Error).message}`);
    return fallback(s);
  }
}

/* ---------- campaign planning ---------- */

export type CampaignPlan = {
  objective: string;
  audience: string;
  channels: string[];
  keyMessage: string;
  outreachDraft: string;
  successMetric: string;
  timeline: { week: string; task: string }[];
  partners: string[];
};

export async function generateCampaignPlan(input: {
  actionType: ActionType;
  area: string;
  facts: string[];
}): Promise<CampaignPlan> {
  const p = `Plan a 4-week ${ACTION_LABEL[input.actionType]} for ${input.area}, Winnipeg.
Triggered by:
${input.facts.slice(0, 3).map((f) => `- ${f}`).join('\n')}
Mid-sized shelter, limited staff. Use only the data given. Partners are generic types, not named orgs.
JSON: {"objective":"1 measurable sentence","audience":"1 sentence","channels":["3 items"],"keyMessage":"1 sentence","outreachDraft":"<60 words, postable","successMetric":"1 number-based measure","timeline":[{"week":"Week 1","task":"..."},{"week":"Week 2","task":"..."},{"week":"Week 3","task":"..."},{"week":"Week 4","task":"..."}],"partners":["2-3 types"]}`;

  try {
    return extractJson(await callGroq(p, 700));
  } catch (err) {
    console.error('[campaign]', (err as Error).message);
    return {
      objective: `Run a ${ACTION_LABEL[input.actionType].toLowerCase()} in ${input.area} over four weeks.`,
      audience: `Residents of ${input.area}.`,
      channels: ['Community Facebook groups', 'Vet clinic noticeboards', 'Community centre flyers'],
      keyMessage: 'Local support keeps animals out of the shelter system.',
      outreachDraft: `We need help in ${input.area}. Animal reports here are above normal, and short-term community support makes a real difference. Get in touch to find out how you can help.`,
      successMetric: 'New sign-ups from the target area within four weeks.',
      timeline: [
        { week: 'Week 1', task: 'Confirm the signal against internal records and set a target.' },
        { week: 'Week 2', task: 'Produce materials and contact partner locations.' },
        { week: 'Week 3', task: 'Run the campaign across all channels.' },
        { week: 'Week 4', task: 'Onboard respondents and measure against target.' },
      ],
      partners: ['Local veterinary clinics', 'Community centres', 'Neighbourhood associations'],
    };
  }
}