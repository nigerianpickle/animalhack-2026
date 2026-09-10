import type { Signal, ActionType } from './stats';

export type Insight = {
  type: 'trend' | 'pattern' | 'suggestion' | 'baseline';
  title: string;
  body: string;
  action: string;
  actionTypes: ActionType[];
  area: string;
  areaType: Signal['areaType'];
  category: string;
  metricValue: number;
  sampleSize: number;
  confidence: Signal['confidence'];
  kind: Signal['kind'];
  generated: boolean;          // true = model output, false = deterministic fallback
};

const KIND_META: Record<Signal['kind'], { type: Insight['type']; framing: string }> = {
  surge: {
    type: 'trend',
    framing:
      'This is a short-term change in overall reporting volume for one area. Say plainly whether load is rising or falling and what that means for staffing and capacity planning this month.',
  },
  citywide: {
    type: 'trend',
    framing:
      'This is a city-wide movement in one category. Emphasise that it is not localised, so the response should be a city-level programme rather than a single neighbourhood campaign.',
  },
  seasonal: {
    type: 'pattern',
    framing:
      'This is a recurring annual pattern. Emphasise predictability: because it repeats, resourcing can be scheduled in advance instead of scrambled reactively.',
  },
  concentration: {
    type: 'suggestion',
    framing:
      'One area is structurally over-represented in this category compared to the city. Emphasise that this is a standing condition, likely reflecting local access or infrastructure gaps, and that it warrants a targeted programme rather than a one-off event.',
  },
  sustained: {
    type: 'baseline',
    framing:
      'This is a persistently high-volume area, not a spike. Do NOT describe it as an increase, surge, rise or spike. Describe it as sustained baseline demand.',
  },
};

const ACTION_LABEL: Record<ActionType, string> = {
  foster_recruitment: 'Foster recruitment drive',
  adoption_event: 'Adoption event',
  notify_partners: 'Notify partner rescues',
  spay_neuter_outreach: 'Spay/neuter outreach',
  owner_support_outreach: 'Owner support outreach',
  microchip_clinic: 'Microchip & ID clinic',
  no_action: 'Monitor only',
};

async function callGroq(prompt: string, maxTokens = 500): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-20b',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '{}';
}

function insightPrompt(signal: Signal): string {
  const meta = KIND_META[signal.kind];
  const allowed = signal.candidateActions.map((a) => `"${a}"`).join(', ');

  return `You are a data analyst at an animal welfare organisation in Winnipeg, writing one operational insight for shelter leadership.

AREA: ${signal.area} (${signal.areaType})
CONFIDENCE: ${signal.confidence} (based on n=${signal.sampleSize} reports)

VERIFIED FACTS — these are the only facts you may use:
${signal.facts.map((f) => `- ${f}`).join('\n')}

FRAMING: ${meta.framing}

IMPORTANT CONTEXT you must respect:
- This data is City of Winnipeg 311 service requests. It measures community-level animal issues reported to the city. It is a PROXY for shelter demand, not a direct count of shelter intake.
- Never state or imply that these numbers are shelter intake, surrender counts, or adoption figures.
- Never invent a cause. If you suggest a possible driver, phrase it explicitly as a hypothesis to check.

Choose 1-2 recommended actions ONLY from this list: [${allowed}]

Respond with JSON only:
{
  "title": "under 12 words, names the area, states the finding",
  "body": "exactly 2 sentences. First: what the data shows, including at least one real number from the facts. Second: why it matters operationally for a shelter.",
  "action": "one concrete step a shelter could start this week, under 22 words",
  "actionTypes": ["chosen action ids from the allowed list"]
}`;
}

function fallbackInsight(signal: Signal): Insight {
  const meta = KIND_META[signal.kind];
  return {
    type: meta.type,
    title: `${signal.area}: ${signal.kind === 'sustained' ? 'sustained high report volume' : 'notable change in reports'}`,
    body: signal.facts.slice(0, 2).join(' '),
    action: `Review ${signal.area} at the next operations meeting and confirm against internal intake records.`,
    actionTypes: signal.candidateActions.slice(0, 2),
    area: signal.area,
    areaType: signal.areaType,
    category: signal.category,
    metricValue: signal.changePercent,
    sampleSize: signal.sampleSize,
    confidence: signal.confidence,
    kind: signal.kind,
    generated: false,
  };
}

export async function generateInsight(signal: Signal): Promise<Insight> {
  const meta = KIND_META[signal.kind];
  const prompt = insightPrompt(signal);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callGroq(prompt);
      const c = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (!c?.title?.trim() || !c?.body?.trim()) throw new Error('empty fields');

      const validActions: ActionType[] = Array.isArray(c.actionTypes)
        ? c.actionTypes.filter((a: ActionType) => signal.candidateActions.includes(a))
        : [];

      return {
        type: meta.type,
        title: String(c.title).trim(),
        body: String(c.body).trim(),
        action: String(c.action ?? '').trim() || 'Review at the next operations meeting.',
        actionTypes: validActions.length ? validActions : signal.candidateActions.slice(0, 2),
        area: signal.area,
        areaType: signal.areaType,
        category: signal.category,
        metricValue: signal.changePercent,
        sampleSize: signal.sampleSize,
        confidence: signal.confidence,
        kind: signal.kind,
        generated: true,
      };
    } catch (err) {
      console.error(`[insight] attempt ${attempt + 1} failed for ${signal.area}:`, (err as Error).message);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }

  return fallbackInsight(signal);
}

/* ---------- campaign planning ---------- */

export type CampaignPlan = {
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

export async function generateCampaignPlan(input: {
  actionType: ActionType;
  area: string;
  areaType: string;
  category: string;
  facts: string[];
}): Promise<CampaignPlan> {
  const prompt = `You are planning a community campaign for an animal welfare organisation in Winnipeg.

CAMPAIGN TYPE: ${ACTION_LABEL[input.actionType]}
TARGET AREA: ${input.area} (${input.areaType})
TRIGGERING DATA:
${input.facts.map((f) => `- ${f}`).join('\n')}

Constraints:
- The organisation is a mid-sized shelter with limited staff. Everything must be achievable in 4 weeks.
- Use only the data given. Do not invent statistics.
- The outreach draft must be under 60 words and usable as a social post or flyer.
- Partners should be plausible generic types (e.g. "local veterinary clinics", "community centres"), not invented named organisations.

Respond with JSON only:
{
  "objective": "one sentence, measurable",
  "targetArea": "${input.area}",
  "audience": "who specifically is being reached, one sentence",
  "channels": ["3-4 concrete channels"],
  "keyMessage": "the single core message, one sentence",
  "outreachDraft": "under 60 words, ready to post",
  "successMetric": "one number-based way to judge if this worked",
  "timeline": [{"week": "Week 1", "task": "..."}, {"week": "Week 2", "task": "..."}, {"week": "Week 3", "task": "..."}, {"week": "Week 4", "task": "..."}],
  "partners": ["2-4 partner types"]
}`;

  try {
    const raw = await callGroq(prompt, 900);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[campaign] plan generation failed:', (err as Error).message);
    return {
      objective: `Run a ${ACTION_LABEL[input.actionType].toLowerCase()} in ${input.area} over the next four weeks.`,
      targetArea: input.area,
      audience: `Residents of ${input.area}.`,
      channels: ['Community Facebook groups', 'Local vet clinic noticeboards', 'Community centre flyers'],
      keyMessage: 'Local support keeps animals out of the shelter system.',
      outreachDraft: `We're looking for help in ${input.area}. Local animal reports are above normal, and short-term community support makes a real difference. Get in touch to find out how you can help.`,
      successMetric: 'Number of new sign-ups from the target area within four weeks.',
      timeline: [
        { week: 'Week 1', task: 'Confirm the signal against internal records and set the target number.' },
        { week: 'Week 2', task: 'Produce outreach materials and contact partner locations.' },
        { week: 'Week 3', task: 'Run the campaign across all chosen channels.' },
        { week: 'Week 4', task: 'Onboard respondents and measure against the target.' },
      ],
      partners: ['Local veterinary clinics', 'Community centres', 'Neighbourhood associations'],
    };
  }
}

export { ACTION_LABEL };