export type Category =
  | 'stray_roaming'
  | 'lost_found'
  | 'welfare_distress'
  | 'surrender_capacity'
  | 'safety_complaint';

export type Report = {
  id: string;
  rawType: string;
  category: Category;
  date: string;
  neighbourhood: string;
  ward: string;
  lat: number;
  lng: number;
};

export type ActionType =
  | 'foster_recruitment'
  | 'adoption_event'
  | 'notify_partners'
  | 'spay_neuter_outreach'
  | 'owner_support_outreach'
  | 'microchip_clinic'
  | 'no_action';

export type Signal = {
  kind: 'surge' | 'seasonal' | 'concentration' | 'sustained' | 'citywide';
  area: string;               // ward or neighbourhood
  areaType: 'ward' | 'neighbourhood' | 'city';
  category: Category | 'all';
  current: number;
  baseline: number;
  changePercent: number;
  sampleSize: number;         // total observations behind the signal
  confidence: 'high' | 'medium' | 'low';
  windowDays: number;
  facts: string[];            // hard facts handed to the LLM verbatim
  candidateActions: ActionType[];
  score: number;
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch(`${BASE_URL}/api/reports`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  return res.json();
}

/* ---------- helpers ---------- */

const CATEGORY_LABEL: Record<string, string> = {
  stray_roaming: 'stray/roaming animals',
  lost_found: 'lost & found',
  welfare_distress: 'welfare & distress',
  surrender_capacity: 'surrender & capacity',
  safety_complaint: 'safety complaints',
  all: 'all animal reports',
};

/**
 * Which actions plausibly follow from a given category and direction.
 * This is deliberately rule-based, not LLM-decided: we never want the model
 * inventing an intervention that makes no sense for the signal.
 */
function actionsFor(category: Category | 'all', rising: boolean): ActionType[] {
  if (!rising) return ['notify_partners', 'no_action'];
  switch (category) {
    case 'stray_roaming':
      return ['spay_neuter_outreach', 'microchip_clinic', 'foster_recruitment'];
    case 'surrender_capacity':
      return ['owner_support_outreach', 'foster_recruitment', 'adoption_event'];
    case 'welfare_distress':
      return ['owner_support_outreach', 'notify_partners'];
    case 'lost_found':
      return ['microchip_clinic', 'notify_partners'];
    case 'safety_complaint':
      return ['notify_partners', 'owner_support_outreach'];
    default:
      return ['foster_recruitment', 'adoption_event', 'notify_partners'];
  }
}

function confidenceFor(current: number, baseline: number): Signal['confidence'] {
  const n = current + baseline;
  if (n >= 60) return 'high';
  if (n >= 25) return 'medium';
  return 'low';
}

function latestDate(reports: Report[]): Date {
  let max = 0;
  for (const r of reports) {
    const t = new Date(r.date).getTime();
    if (!Number.isNaN(t) && t > max) max = t;
  }
  return max ? new Date(max) : new Date();
}

function shift(d: Date, days: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() - days);
  return c;
}

function pct(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

/**
 * Pick the aggregation level with enough density to be meaningful.
 * Ward if it's populated on most records, else neighbourhood.
 */
export function resolveAreaKey(reports: Report[]): { key: 'ward' | 'neighbourhood'; label: 'ward' | 'neighbourhood' } {
  const withWard = reports.filter((r) => r.ward && String(r.ward).trim().length > 0).length;
  const coverage = reports.length ? withWard / reports.length : 0;
  const distinctWards = new Set(reports.map((r) => r.ward).filter(Boolean)).size;
  if (coverage > 0.8 && distinctWards >= 4 && distinctWards <= 40) {
    return { key: 'ward', label: 'ward' };
  }
  return { key: 'neighbourhood', label: 'neighbourhood' };
}

function areaOf(r: Report, key: 'ward' | 'neighbourhood'): string {
  return String(r[key] ?? '').trim() || 'Unknown';
}

function inWindow(d: Date, start: Date, end: Date): boolean {
  return d > start && d <= end;
}

/* ---------- detectors ---------- */

/** 1. Area-level surge: total reports, 90d vs prior 90d. Volume-gated. */
export function detectSurges(reports: Report[], areaKey: 'ward' | 'neighbourhood', windowDays = 90): Signal[] {
  const anchor = latestDate(reports);
  const curStart = shift(anchor, windowDays);
  const prevStart = shift(anchor, windowDays * 2);

  const totals = new Map<string, { cur: number; prev: number; curCats: Map<string, number> }>();

  for (const r of reports) {
    const d = new Date(r.date);
    const a = areaOf(r, areaKey);
    if (!totals.has(a)) totals.set(a, { cur: 0, prev: 0, curCats: new Map() });
    const t = totals.get(a)!;
    if (inWindow(d, curStart, anchor)) {
      t.cur += 1;
      t.curCats.set(r.category, (t.curCats.get(r.category) ?? 0) + 1);
    } else if (inWindow(d, prevStart, curStart)) {
      t.prev += 1;
    }
  }

  const out: Signal[] = [];
  for (const [area, t] of totals) {
    if (area === 'Unknown') continue;
    if (t.cur < 15 || t.prev < 15) continue;               // need real volume both sides
    const change = pct(t.cur, t.prev);
    if (Math.abs(change) < 20) continue;

    const topCat = [...t.curCats.entries()].sort((a, b) => b[1] - a[1])[0];
    const rising = change > 0;

    out.push({
      kind: 'surge',
      area,
      areaType: areaKey,
      category: 'all',
      current: t.cur,
      baseline: t.prev,
      changePercent: change,
      sampleSize: t.cur + t.prev,
      confidence: confidenceFor(t.cur, t.prev),
      windowDays,
      facts: [
        `${t.cur} animal-related 311 reports in the last ${windowDays} days, versus ${t.prev} in the ${windowDays} days before that (${change > 0 ? '+' : ''}${change}%).`,
        topCat
          ? `The largest category in the current window is ${CATEGORY_LABEL[topCat[0]]} at ${topCat[1]} reports (${Math.round((topCat[1] / t.cur) * 100)}% of the area's total).`
          : '',
      ].filter(Boolean),
      candidateActions: actionsFor((topCat?.[0] as Category) ?? 'all', rising),
      score: Math.abs(change) * Math.log1p(t.cur + t.prev),
    });
  }
  return out;
}

/** 2. City-wide category movement — catches kitten season, seizure waves, etc. */
export function detectCitywideCategoryShifts(reports: Report[], windowDays = 90): Signal[] {
  const anchor = latestDate(reports);
  const curStart = shift(anchor, windowDays);
  const prevStart = shift(anchor, windowDays * 2);

  const cur = new Map<string, number>();
  const prev = new Map<string, number>();

  for (const r of reports) {
    const d = new Date(r.date);
    if (inWindow(d, curStart, anchor)) cur.set(r.category, (cur.get(r.category) ?? 0) + 1);
    else if (inWindow(d, prevStart, curStart)) prev.set(r.category, (prev.get(r.category) ?? 0) + 1);
  }

  const out: Signal[] = [];
  for (const [cat, c] of cur) {
    const p = prev.get(cat) ?? 0;
    if (c < 20 || p < 20) continue;
    const change = pct(c, p);
    if (Math.abs(change) < 15) continue;

    out.push({
      kind: 'citywide',
      area: 'Winnipeg',
      areaType: 'city',
      category: cat as Category,
      current: c,
      baseline: p,
      changePercent: change,
      sampleSize: c + p,
      confidence: confidenceFor(c, p),
      windowDays,
      facts: [
        `City-wide, ${CATEGORY_LABEL[cat]} reports moved from ${p} to ${c} between consecutive ${windowDays}-day windows (${change > 0 ? '+' : ''}${change}%).`,
        `This is a city-level movement, not confined to one ${'area'}.`,
      ],
      candidateActions: actionsFor(cat as Category, change > 0),
      score: Math.abs(change) * Math.log1p(c + p) * 1.15,  // city-wide slightly prioritised
    });
  }
  return out;
}

/** 3. Seasonal recurrence: same calendar month across ≥2 prior years. */
export function detectSeasonal(reports: Report[], areaKey: 'ward' | 'neighbourhood'): Signal[] {
  const anchor = latestDate(reports);
  const month = anchor.getMonth();
  const year = anchor.getFullYear();
  const monthName = anchor.toLocaleString('en-CA', { month: 'long' });

  const byAreaYear = new Map<string, Map<number, number>>();
  for (const r of reports) {
    const d = new Date(r.date);
    if (d.getMonth() !== month) continue;
    const a = areaOf(r, areaKey);
    if (!byAreaYear.has(a)) byAreaYear.set(a, new Map());
    const m = byAreaYear.get(a)!;
    m.set(d.getFullYear(), (m.get(d.getFullYear()) ?? 0) + 1);
  }

  const out: Signal[] = [];
  for (const [area, byYear] of byAreaYear) {
    if (area === 'Unknown') continue;
    const priors = [...byYear.entries()].filter(([y]) => y < year);
    if (priors.length < 2) continue;

    const current = byYear.get(year) ?? 0;
    const avg = priors.reduce((s, [, v]) => s + v, 0) / priors.length;
    if (avg < 8 || current < 8) continue;                   // seasonal claims need volume

    const change = pct(current, avg);
    out.push({
      kind: 'seasonal',
      area,
      areaType: areaKey,
      category: 'all',
      current,
      baseline: Math.round(avg * 10) / 10,
      changePercent: change,
      sampleSize: current + Math.round(avg * priors.length),
      confidence: priors.length >= 3 ? 'high' : 'medium',
      windowDays: 30,
      facts: [
        `${monthName} in this ${areaKey} has averaged ${Math.round(avg * 10) / 10} reports across ${priors.length} prior years.`,
        `This ${monthName} the count is ${current} (${change > 0 ? '+' : ''}${change}% vs the multi-year average).`,
        `Because this window recurs annually, it can be staffed and resourced in advance rather than reacted to.`,
      ],
      candidateActions: actionsFor('all', change > 0),
      score: 55 + Math.abs(change) * 0.4 + priors.length * 6,
    });
  }
  return out;
}

/** 4. Category concentration: area over-indexed vs the city baseline. */
export function detectConcentration(reports: Report[], areaKey: 'ward' | 'neighbourhood', windowDays = 180): Signal[] {
  const anchor = latestDate(reports);
  const start = shift(anchor, windowDays);
  const recent = reports.filter((r) => inWindow(new Date(r.date), start, anchor));
  if (recent.length < 100) return [];

  const cityCat = new Map<string, number>();
  const areaTotal = new Map<string, number>();
  const areaCat = new Map<string, number>();

  for (const r of recent) {
    const a = areaOf(r, areaKey);
    cityCat.set(r.category, (cityCat.get(r.category) ?? 0) + 1);
    areaTotal.set(a, (areaTotal.get(a) ?? 0) + 1);
    const k = `${a}::${r.category}`;
    areaCat.set(k, (areaCat.get(k) ?? 0) + 1);
  }

  const out: Signal[] = [];
  for (const [k, count] of areaCat) {
    const [area, cat] = k.split('::');
    if (area === 'Unknown') continue;
    const total = areaTotal.get(area) ?? 0;
    if (total < 40 || count < 15) continue;

    const localShare = count / total;
    const cityShare = (cityCat.get(cat) ?? 0) / recent.length;
    if (cityShare === 0) continue;
    const ratio = localShare / cityShare;
    if (ratio < 1.5) continue;

    const expected = Math.round(cityShare * total);
    out.push({
      kind: 'concentration',
      area,
      areaType: areaKey,
      category: cat as Category,
      current: count,
      baseline: expected,
      changePercent: Math.round((ratio - 1) * 1000) / 10,
      sampleSize: total,
      confidence: confidenceFor(count, expected),
      windowDays,
      facts: [
        `Over the last ${windowDays} days this ${areaKey} logged ${total} animal reports, of which ${count} (${Math.round(localShare * 100)}%) were ${CATEGORY_LABEL[cat]}.`,
        `City-wide that category is ${Math.round(cityShare * 100)}% of reports, so the expected count here would be about ${expected}.`,
        `That is ${Math.round(ratio * 10) / 10}x the city rate — a structural over-representation, not a short-term spike.`,
      ],
      candidateActions: actionsFor(cat as Category, true),
      score: 45 + (ratio - 1) * 45 + Math.log1p(count) * 6,
    });
  }
  return out;
}

/** 5. Sustained hotspot — reliable fallback so the feed is never empty. */
export function detectSustained(reports: Report[], areaKey: 'ward' | 'neighbourhood', windowDays = 180): Signal[] {
  const anchor = latestDate(reports);
  const start = shift(anchor, windowDays);
  const totals = new Map<string, { n: number; cats: Map<string, number> }>();

  for (const r of reports) {
    if (!inWindow(new Date(r.date), start, anchor)) continue;
    const a = areaOf(r, areaKey);
    if (!totals.has(a)) totals.set(a, { n: 0, cats: new Map() });
    const t = totals.get(a)!;
    t.n += 1;
    t.cats.set(r.category, (t.cats.get(r.category) ?? 0) + 1);
  }

  const ranked = [...totals.entries()].filter(([a]) => a !== 'Unknown').sort((a, b) => b[1].n - a[1].n);
  const cityMedian = ranked.length ? ranked[Math.floor(ranked.length / 2)][1].n : 0;

  return ranked.slice(0, 4).map(([area, t]) => {
    const topCat = [...t.cats.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      kind: 'sustained' as const,
      area,
      areaType: areaKey,
      category: 'all' as const,
      current: t.n,
      baseline: cityMedian,
      changePercent: pct(t.n, cityMedian),
      sampleSize: t.n,
      confidence: 'high' as const,
      windowDays,
      facts: [
        `${t.n} animal reports over the last ${windowDays} days, against a city median of ${cityMedian} per ${areaKey}.`,
        topCat ? `Driven mainly by ${CATEGORY_LABEL[topCat[0]]} (${topCat[1]} reports).` : '',
        `This is a persistent load, not a spike — it reflects ongoing baseline demand.`,
      ].filter(Boolean),
      candidateActions: actionsFor((topCat?.[0] as Category) ?? 'all', true),
      score: 30 + Math.log1p(t.n) * 9,
    };
  });
}

/* ---------- orchestration ---------- */

export function buildSignals(reports: Report[], limit = 6): { signals: Signal[]; areaLabel: string } {
  const { key } = resolveAreaKey(reports);

  const all = [
    ...detectCitywideCategoryShifts(reports),
    ...detectSurges(reports, key),
    ...detectSeasonal(reports, key),
    ...detectConcentration(reports, key),
    ...detectSustained(reports, key),
  ].sort((a, b) => b.score - a.score);

  const picked: Signal[] = [];
  const perArea = new Map<string, number>();
  const kinds = new Set<string>();

  // First pass: one of each kind, for variety.
  for (const s of all) {
    if (kinds.has(s.kind)) continue;
    picked.push(s);
    kinds.add(s.kind);
    perArea.set(s.area, (perArea.get(s.area) ?? 0) + 1);
    if (picked.length >= limit) break;
  }
  // Second pass: fill remaining slots by score, capped per area.
  for (const s of all) {
    if (picked.length >= limit) break;
    if (picked.includes(s)) continue;
    if ((perArea.get(s.area) ?? 0) >= 2) continue;
    picked.push(s);
    perArea.set(s.area, (perArea.get(s.area) ?? 0) + 1);
  }

  return { signals: picked.slice(0, limit), areaLabel: key };
}