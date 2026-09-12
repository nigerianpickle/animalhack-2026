import { prisma } from '@/lib/db';
export type Category =
  | 'stray_roaming'
  | 'lost_found'
  | 'welfare_distress'
  | 'surrender_capacity'
  | 'safety_complaint';

export const CATEGORIES: Category[] = [
  'stray_roaming', 'lost_found', 'welfare_distress', 'surrender_capacity', 'safety_complaint',
];

export const CATEGORY_LABEL: Record<string, string> = {
  stray_roaming: 'stray / roaming animals',
  lost_found: 'lost & found',
  welfare_distress: 'welfare & distress',
  surrender_capacity: 'surrender & capacity',
  safety_complaint: 'safety complaints',
  all: 'all animal reports',
};

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

export type Scope = 'live' | 'historical';

export type SignalKind =
  | 'upcoming_peak'
  | 'seasonal_anomaly'
  | 'yoy_growth'
  | 'recurring_peak'
  | 'multi_year_trend'
  | 'concentration'
  | 'hotspot';

export type MonthPoint = { year: number; month: number; count: number };
export type Breakdown = { label: string; count: number; share: number };
export type Forecast = { expected: number; low: number; high: number; priorYears: number };

export type Signal = {
  scope: Scope;
  kind: SignalKind;
  area: string;
  areaType: 'ward' | 'neighbourhood' | 'city';
  category: Category | 'all';
  windowDays: number;
  windowLabel: string;
  current: number;
  baseline: number;
  baselineLabel: string;
  deviationPct: number;
  yoy: number | null;
  forecast: Forecast | null;
  series: MonthPoint[];
  breakdown: Breakdown[];
  breakdownLabel: string;
  sampleSize: number;
  priorYears: number;
  confidence: 'high' | 'medium' | 'low';
  facts: string[];
  candidateActions: ActionType[];
  score: number;
};

export type DatasetMeta = {
  scope: Scope;
  areaLabel: 'ward' | 'neighbourhood';
  reportCount: number;
  dataStart: string;
  dataEnd: string;
  yearsCovered: number;
  windowDays: number;
  windowLabel: string;
};

export async function fetchReports(): Promise<Report[]> {
  const reports = await prisma.report.findMany({
    orderBy: {
      date: 'asc',
    },
  });

  return reports.map((report) => ({
    id: report.id,
    rawType: report.rawType,
    category: report.category as Category,
    date: report.date.toISOString(),
    neighbourhood: report.neighbourhood,
    ward: report.ward ?? '',
    lat: report.lat,
    lng: report.lng,
  }));
}

/* ---------------- helpers ---------------- */

const DAY = 86_400_000;
const DEFAULT_WINDOW = 90;
const AHEAD = 30;
const LAG_TRIM_DAYS = 0; // set to ~7 if the 311 export lags and produces false declines

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type Item = { r: Report; t: number };

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const addYears = (d: Date, n: number) => { const c = new Date(d); c.setFullYear(c.getFullYear() + n); return c; };
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const pctDiff = (cur: number, base: number) => (base > 0 ? r1(((cur - base) / base) * 100) : 0);

export function windowLabelFor(days: number): string {
  if (days <= 31) return 'last 30 days';
  if (days <= 95) return 'last 90 days';
  if (days <= 200) return 'last 180 days';
  return `last ${days} days`;
}

function prepare(reports: Report[]) {
  const items: Item[] = reports
    .map((r) => ({ r, t: new Date(r.date).getTime() }))
    .filter((i) => !Number.isNaN(i.t));
  let min = Infinity, max = -Infinity;
  for (const i of items) { if (i.t < min) min = i.t; if (i.t > max) max = i.t; }
  return { items, dataStart: new Date(min), anchor: addDays(new Date(max), -LAG_TRIM_DAYS) };
}

function countBetween(items: Item[], start: Date, end: Date): number {
  const s = start.getTime(), e = end.getTime();
  let n = 0;
  for (const i of items) if (i.t > s && i.t <= e) n++;
  return n;
}

function priorWindows(items: Item[], anchor: Date, windowDays: number, dataStart: Date, maxYears = 4): number[] {
  const out: number[] = [];
  for (let k = 1; k <= maxYears; k++) {
    const e = addYears(anchor, -k);
    const s = addDays(e, -windowDays);
    if (s < dataStart) break;
    out.push(countBetween(items, s, e));
  }
  return out;
}

function priorLookAhead(items: Item[], anchor: Date, aheadDays: number, dataStart: Date, maxYears = 4): number[] {
  const out: number[] = [];
  for (let k = 1; k <= maxYears; k++) {
    const s = addYears(anchor, -k);
    if (s < dataStart) break;
    out.push(countBetween(items, s, addDays(s, aheadDays)));
  }
  return out;
}

function monthlySeries(items: Item[]): MonthPoint[] {
  const m = new Map<string, MonthPoint>();
  for (const i of items) {
    const d = new Date(i.t);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const p = m.get(k) ?? { year: d.getFullYear(), month: d.getMonth(), count: 0 };
    p.count++;
    m.set(k, p);
  }
  return [...m.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

function breakdownBy(items: Item[], keyFn: (i: Item) => string, top = 5): Breakdown[] {
  const c = new Map<string, number>();
  for (const i of items) { const k = keyFn(i) || 'Unknown'; c.set(k, (c.get(k) ?? 0) + 1); }
  const total = items.length || 1;
  return [...c.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([label, count]) => ({ label, count, share: Math.round((count / total) * 100) }));
}

function confidenceFor(n: number, priorYears: number): Signal['confidence'] {
  if (priorYears >= 2 && n >= 40) return 'high';
  if (priorYears >= 1 && n >= 20) return 'medium';
  return 'low';
}

function actionsFor(category: Category | 'all', rising: boolean): ActionType[] {
  if (!rising) return ['no_action', 'notify_partners'];
  switch (category) {
    case 'stray_roaming': return ['spay_neuter_outreach', 'microchip_clinic', 'foster_recruitment'];
    case 'surrender_capacity': return ['owner_support_outreach', 'foster_recruitment', 'adoption_event'];
    case 'welfare_distress': return ['owner_support_outreach', 'notify_partners'];
    case 'lost_found': return ['microchip_clinic', 'notify_partners'];
    case 'safety_complaint': return ['notify_partners', 'owner_support_outreach'];
    default: return ['foster_recruitment', 'spay_neuter_outreach', 'notify_partners'];
  }
}

export function resolveAreaKey(reports: Report[]): 'ward' | 'neighbourhood' {
  const withWard = reports.filter((r) => r.ward && String(r.ward).trim()).length;
  const distinct = new Set(reports.map((r) => r.ward).filter(Boolean)).size;
  return withWard / Math.max(reports.length, 1) > 0.8 && distinct >= 4 && distinct <= 40 ? 'ward' : 'neighbourhood';
}

/* ---------------- cells ---------------- */

type Cell = { area: string; areaType: Signal['areaType']; category: Category | 'all'; items: Item[] };

function buildCells(items: Item[], areaKey: 'ward' | 'neighbourhood'): Cell[] {
  const byArea = new Map<string, Item[]>();
  for (const i of items) {
    const a = String(i.r[areaKey] ?? '').trim();
    if (!a) continue;
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a)!.push(i);
  }
  const cells: Cell[] = [{ area: 'Winnipeg', areaType: 'city', category: 'all', items }];
  for (const c of CATEGORIES) cells.push({ area: 'Winnipeg', areaType: 'city', category: c, items: items.filter((i) => i.r.category === c) });
  for (const [area, ai] of byArea) {
    cells.push({ area, areaType: areaKey, category: 'all', items: ai });
    for (const c of CATEGORIES) cells.push({ area, areaType: areaKey, category: c, items: ai.filter((i) => i.r.category === c) });
  }
  return cells;
}

function cellBreakdown(cell: Cell, items: Item[], areaKey: 'ward' | 'neighbourhood', label: string) {
  if (cell.category === 'all') {
    return { breakdown: breakdownBy(items, (i) => CATEGORY_LABEL[i.r.category]), breakdownLabel: `By category (${label})` };
  }
  if (cell.areaType === 'city') {
    return { breakdown: breakdownBy(items, (i) => String(i.r[areaKey] ?? '')), breakdownLabel: `Top ${areaKey}s (${label})` };
  }
  return {
    breakdown: breakdownBy(items, (i) => (areaKey === 'ward' ? i.r.neighbourhood : i.r.rawType)),
    breakdownLabel: areaKey === 'ward' ? `Top neighbourhoods (${label})` : `By request type (${label})`,
  };
}

/* ---------------- LIVE detectors ---------------- */

function analyseLive(
  cell: Cell,
  anchor: Date,
  dataStart: Date,
  areaKey: 'ward' | 'neighbourhood',
  windowDays: number,
  windowLabelOverride?: string
): Signal[] {
  const label = CATEGORY_LABEL[cell.category];
  const wLabel = windowLabelOverride ?? windowLabelFor(windowDays);
  const cur = countBetween(cell.items, addDays(anchor, -windowDays), anchor);
  const prior = priorWindows(cell.items, anchor, windowDays, dataStart);
  const expected = prior.length ? mean(prior) : null;
  const yoy = prior.length ? prior[0] : null;
  const ahead = priorLookAhead(cell.items, anchor, AHEAD, dataStart);

  let forecast: Forecast | null = null;
  if (ahead.length) {
    const trend = expected && expected >= 5 ? clamp(cur / expected, 0.6, 1.8) : 1;
    forecast = {
      expected: Math.round(mean(ahead) * trend),
      low: Math.round(Math.min(...ahead) * trend * 0.85),
      high: Math.round(Math.max(...ahead) * trend * 1.15),
      priorYears: ahead.length,
    };
  }

  const windowItems = cell.items.filter((i) => i.t > addDays(anchor, -windowDays).getTime() && i.t <= anchor.getTime());
  const { breakdown, breakdownLabel } = cellBreakdown(cell, windowItems, areaKey, wLabel);

  const base = {
    scope: 'live' as const,
    area: cell.area,
    areaType: cell.areaType,
    category: cell.category,
    windowDays,
    windowLabel: wLabel,
    current: cur,
    yoy,
    forecast,
    series: monthlySeries(cell.items),
    breakdown,
    breakdownLabel,
    priorYears: prior.length,
  };

  const out: Signal[] = [];
  const perDay = r1(cur / windowDays);

  const pace30 = (cur / windowDays) * AHEAD;
  if (forecast && forecast.expected >= 10 && pace30 > 0) {
    const ratio = forecast.expected / pace30;
    if (ratio >= 1.3) {
      const dev = r1((ratio - 1) * 100);
      const n = cur + Math.round(mean(ahead));
      out.push({
        ...base,
        kind: 'upcoming_peak',
        baseline: Math.round(pace30),
        baselineLabel: 'current 30-day pace',
        deviationPct: dev,
        sampleSize: n,
        confidence: confidenceFor(n, ahead.length),
        facts: [
          `${cur} ${label} in the ${wLabel} — a rate of ${perDay}/day, which projects to about ${Math.round(pace30)} reports per 30 days.`,
          `In ${ahead.length} prior year(s), the 30 days after this point in the calendar averaged ${Math.round(mean(ahead))} reports. Comparing that ${Math.round(mean(ahead))} against the projected ${Math.round(pace30)} gives the ${dev}% figure.`,
          `Adjusted for this year's activity, expect roughly ${forecast.expected} reports in the next 30 days (range ${forecast.low}–${forecast.high}).`,
        ],
        candidateActions: actionsFor(cell.category, true),
        score: 100 + (ratio - 1) * 40 + Math.log1p(forecast.expected) * 4,
      });
    }
  }

  if (expected !== null && expected >= 6 && cur + expected >= 20) {
    const dev = pctDiff(cur, expected);
    if (Math.abs(dev) >= 30) {
      const rising = dev > 0;
      const n = cur + Math.round(expected);
      out.push({
        ...base,
        kind: 'seasonal_anomaly',
        baseline: r1(expected),
        baselineLabel: `${prior.length}-year average for this window`,
        deviationPct: dev,
        sampleSize: n,
        confidence: confidenceFor(n, prior.length),
        facts: [
          `${cur} ${label} in the ${wLabel}.`,
          `The same ${windowDays}-day window averaged ${r1(expected)} across ${prior.length} prior year(s). Comparing ${cur} against ${r1(expected)} gives the ${Math.abs(dev)}% ${rising ? 'above' : 'below'} figure.`,
          yoy !== null ? `Same window last year: ${yoy}.` : '',
          forecast ? `Next 30 days: about ${forecast.expected} expected (range ${forecast.low}–${forecast.high}).` : '',
        ].filter(Boolean),
        candidateActions: actionsFor(cell.category, rising),
        score: rising ? 80 + Math.abs(dev) * 0.4 + Math.log1p(n) * 3 : 30 + Math.abs(dev) * 0.2,
      });
    }
  }

  if (cell.areaType === 'city' && cell.category !== 'all' && yoy !== null && yoy >= 15 && cur >= 15) {
    const dev = pctDiff(cur, yoy);
    if (Math.abs(dev) >= 15) {
      out.push({
        ...base,
        kind: 'yoy_growth',
        baseline: yoy,
        baselineLabel: 'same window last year',
        deviationPct: dev,
        sampleSize: cur + yoy,
        confidence: confidenceFor(cur + yoy, 1),
        facts: [
          `City-wide ${label}: ${cur} reports in the ${wLabel} versus ${yoy} in the same window last year. Comparing ${cur} against ${yoy} gives ${dev > 0 ? '+' : ''}${dev}%.`,
          forecast ? `Next 30 days: about ${forecast.expected} expected (range ${forecast.low}–${forecast.high}).` : '',
        ].filter(Boolean),
        candidateActions: actionsFor(cell.category, dev > 0),
        score: dev > 0 ? 65 + Math.abs(dev) * 0.4 : 25,
      });
    }
  }

  return out;
}

/* ---------------- HISTORICAL detectors ---------------- */

function detectRecurringPeak(cell: Cell, areaKey: 'ward' | 'neighbourhood', anchor: Date): Signal | null {
  const series = monthlySeries(cell.items);
  if (series.length < 12) return null;

  const byMonth = new Map<number, number[]>();
  for (const p of series) {
    if (!byMonth.has(p.month)) byMonth.set(p.month, []);
    byMonth.get(p.month)!.push(p.count);
  }

  const monthAvgs = [...byMonth.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([m, v]) => ({ month: m, avg: mean(v), years: v.length, counts: v }));
  if (monthAvgs.length < 6) return null;

  const overall = mean(monthAvgs.map((m) => m.avg));
  if (overall < 3) return null;

  const peak = monthAvgs.reduce((a, b) => (b.avg > a.avg ? b : a));
  const lift = pctDiff(peak.avg, overall);
  if (lift < 35 || peak.avg < 6) return null;

  const aboveAverageYears = peak.counts.filter((c) => c > overall).length;
  if (aboveAverageYears < Math.max(2, Math.ceil(peak.counts.length * 0.6))) return null;

  const monthsUntil = (peak.month - anchor.getMonth() + 12) % 12;
  const timing =
    monthsUntil === 0 ? 'That peak window is happening now.'
    : monthsUntil <= 2 ? `That peak is about ${monthsUntil} month(s) away.`
    : `That peak is ${monthsUntil} months away — there is time to plan for it.`;

  const { breakdown, breakdownLabel } = cellBreakdown(cell, cell.items, areaKey, 'all time');

  return {
    scope: 'historical',
    kind: 'recurring_peak',
    area: cell.area,
    areaType: cell.areaType,
    category: cell.category,
    windowDays: 30,
    windowLabel: 'full history',
    current: Math.round(peak.avg),
    baseline: Math.round(overall),
    baselineLabel: 'average month',
    deviationPct: lift,
    yoy: null,
    forecast: null,
    series,
    breakdown,
    breakdownLabel,
    sampleSize: cell.items.length,
    priorYears: peak.years,
    confidence: peak.years >= 3 ? 'high' : 'medium',
    facts: [
      `${MONTH_NAMES[peak.month]} averages ${r1(peak.avg)} ${CATEGORY_LABEL[cell.category]} reports here, against an average month of ${r1(overall)}. Comparing ${r1(peak.avg)} against ${r1(overall)} gives ${lift}% higher.`,
      `That holds across ${peak.years} year(s) on record, running above the monthly average in ${aboveAverageYears} of them, so it is a repeating pattern rather than a one-off.`,
      timing,
    ],
    candidateActions: actionsFor(cell.category, true),
    score: 90 + lift * 0.3 + peak.years * 6 - monthsUntil * 2,
  };
}

function detectMultiYearTrend(cell: Cell, areaKey: 'ward' | 'neighbourhood', anchor: Date): Signal | null {
  const byYear = new Map<number, number>();
  for (const i of cell.items) {
    const y = new Date(i.t).getFullYear();
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  const years = [...byYear.entries()].filter(([y]) => y < anchor.getFullYear()).sort((a, b) => a[0] - b[0]);
  if (years.length < 2) return null;

  const first = years[0], last = years[years.length - 1];
  if (last[1] < 25 && first[1] < 25) return null;

  const change = pctDiff(last[1], first[1]);
  if (Math.abs(change) < 20) return null;

  const span = last[0] - first[0];
  const perYear = span > 0 ? r1(change / span) : change;
  const { breakdown, breakdownLabel } = cellBreakdown(cell, cell.items, areaKey, 'all time');

  return {
    scope: 'historical',
    kind: 'multi_year_trend',
    area: cell.area,
    areaType: cell.areaType,
    category: cell.category,
    windowDays: 365,
    windowLabel: 'full years',
    current: last[1],
    baseline: first[1],
    baselineLabel: `${first[0]} total`,
    deviationPct: change,
    yoy: years.length >= 2 ? years[years.length - 2][1] : null,
    forecast: null,
    series: monthlySeries(cell.items),
    breakdown,
    breakdownLabel,
    sampleSize: years.reduce((s, [, v]) => s + v, 0),
    priorYears: years.length,
    confidence: years.length >= 3 ? 'high' : 'medium',
    facts: [
      `Annual totals: ${years.map(([y, v]) => `${y}: ${v}`).join(', ')}.`,
      `Comparing ${first[0]} (${first[1]}) against ${last[0]} (${last[1]}) gives ${change > 0 ? '+' : ''}${change}%, about ${perYear}% per year.`,
      `Only complete years are counted, so the current partial year is excluded.`,
    ],
    candidateActions: actionsFor(cell.category, change > 0),
    score: (change > 0 ? 80 : 35) + Math.abs(change) * 0.25 + years.length * 5,
  };
}

function detectStructural(cells: Cell[], items: Item[], areaKey: 'ward' | 'neighbourhood'): Signal[] {
  if (items.length < 200) return [];

  const cityCat = new Map<string, number>();
  for (const i of items) cityCat.set(i.r.category, (cityCat.get(i.r.category) ?? 0) + 1);

  const areaCells = cells.filter((c) => c.areaType !== 'city');
  const areaTotal = new Map<string, number>();
  for (const c of areaCells) if (c.category === 'all') areaTotal.set(c.area, c.items.length);

  const out: Signal[] = [];

  for (const c of areaCells) {
    if (c.category === 'all') continue;
    const total = areaTotal.get(c.area) ?? 0;
    const count = c.items.length;
    if (total < 60 || count < 25) continue;
    const localShare = count / total;
    const cityShare = (cityCat.get(c.category) ?? 0) / items.length;
    const ratio = cityShare > 0 ? localShare / cityShare : 0;
    if (ratio < 1.5) continue;
    const expected = Math.round(cityShare * total);
    const { breakdown, breakdownLabel } = cellBreakdown(c, c.items, areaKey, 'all time');

    out.push({
      scope: 'historical',
      kind: 'concentration',
      area: c.area,
      areaType: c.areaType,
      category: c.category,
      windowDays: 0,
      windowLabel: 'full history',
      current: count,
      baseline: expected,
      baselineLabel: 'expected at the city-wide rate',
      deviationPct: r1((ratio - 1) * 100),
      yoy: null,
      forecast: null,
      series: monthlySeries(c.items),
      breakdown,
      breakdownLabel,
      sampleSize: total,
      priorYears: 0,
      confidence: total >= 120 ? 'high' : 'medium',
      facts: [
        `Across the full record, ${c.area} logged ${total} animal reports; ${count} (${Math.round(localShare * 100)}%) were ${CATEGORY_LABEL[c.category]}.`,
        `City-wide that category is ${Math.round(cityShare * 100)}% of reports, so about ${expected} would be expected here. Comparing the actual ${count} against the expected ${expected} gives ${r1(ratio)}x.`,
        `This holds over years, which points to a standing local condition rather than a temporary spike.`,
      ],
      candidateActions: actionsFor(c.category, true),
      score: 60 + (ratio - 1) * 40 + Math.log1p(count) * 4,
    });
  }

  const ranked = [...areaTotal.entries()].sort((a, b) => b[1] - a[1]);
  const median = ranked.length ? ranked[Math.floor(ranked.length / 2)][1] : 0;
  for (const [area, n] of ranked.slice(0, 3)) {
    if (n < 40) continue;
    const c = areaCells.find((x) => x.area === area && x.category === 'all');
    if (!c) continue;
    const top = breakdownBy(c.items, (i) => CATEGORY_LABEL[i.r.category], 1)[0];
    const topKey = top ? (Object.keys(CATEGORY_LABEL).find((k) => CATEGORY_LABEL[k] === top.label) as Category) : undefined;

    out.push({
      scope: 'historical',
      kind: 'hotspot',
      area,
      areaType: c.areaType,
      category: 'all',
      windowDays: 0,
      windowLabel: 'full history',
      current: n,
      baseline: median,
      baselineLabel: `median ${areaKey}`,
      deviationPct: pctDiff(n, median),
      yoy: null,
      forecast: null,
      series: monthlySeries(c.items),
      breakdown: breakdownBy(c.items, (i) => CATEGORY_LABEL[i.r.category]),
      breakdownLabel: 'By category (all time)',
      sampleSize: n,
      priorYears: 0,
      confidence: 'high',
      facts: [
        `${n} animal reports across the full record — ${Math.round((n / items.length) * 100)}% of the city total, against a median of ${median} per ${areaKey}.`,
        top ? `Largest category: ${top.label} (${top.count}, ${top.share}%).` : '',
        `This is persistent baseline load, not a spike.`,
      ].filter(Boolean),
      candidateActions: actionsFor(topKey ?? 'all', true),
      score: 40 + Math.log1p(n) * 6,
    });
  }

  return out;
}

/* ---------------- orchestration ---------------- */

const LIVE_ORDER: SignalKind[] = ['upcoming_peak', 'seasonal_anomaly', 'yoy_growth'];
const HISTORICAL_ORDER: SignalKind[] = ['recurring_peak', 'multi_year_trend', 'concentration', 'hotspot'];

function pick(all: Signal[], order: SignalKind[], limit: number): Signal[] {
  all.sort((a, b) => b.score - a.score);
  const picked: Signal[] = [];
  const perArea = new Map<string, number>();
  const seen = new Set<string>();
  const take = (s: Signal) => {
    picked.push(s);
    perArea.set(s.area, (perArea.get(s.area) ?? 0) + 1);
    seen.add(`${s.area}|${s.category}|${s.kind}`);
  };

  for (const kind of order) {
    const best = all.find((s) => s.kind === kind && !seen.has(`${s.area}|${s.category}|${s.kind}`));
    if (best && picked.length < limit) take(best);
  }
  for (const s of all) {
    if (picked.length >= limit) break;
    if (seen.has(`${s.area}|${s.category}|${s.kind}`)) continue;
    if ((perArea.get(s.area) ?? 0) >= 2) continue;
    take(s);
  }
  return picked.sort((a, b) => b.score - a.score);
}

function metaFor(
  scope: Scope,
  reports: Report[],
  items: Item[],
  areaKey: 'ward' | 'neighbourhood',
  dataStart: Date,
  anchor: Date,
  windowDays: number,
  windowLabel: string
): DatasetMeta {
  const years = new Set(items.map((i) => new Date(i.t).getFullYear()));
  return {
    scope,
    areaLabel: areaKey,
    reportCount: reports.length,
    dataStart: dataStart.toISOString().slice(0, 10),
    dataEnd: anchor.toISOString().slice(0, 10),
    yearsCovered: years.size,
    windowDays,
    windowLabel,
  };
}

export function buildLiveSignals(
  reports: Report[],
  limit = 4,
  categoryFilter?: Category | null,
  windowDays: number = DEFAULT_WINDOW,
  year?: number | null
): { signals: Signal[]; meta: DatasetMeta } {
  const areaKey = resolveAreaKey(reports);
  const { items, anchor: dataEnd, dataStart } = prepare(reports);

  let anchor = dataEnd;
  let win = windowDays;
  let wLabel = windowLabelFor(windowDays);

  if (year) {
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const yearStart = new Date(year, 0, 1);
    anchor = yearEnd.getTime() < dataEnd.getTime() ? yearEnd : dataEnd;
    win = Math.max(1, Math.round((anchor.getTime() - yearStart.getTime()) / DAY));
    wLabel = anchor.getTime() < yearEnd.getTime() ? `${year} year-to-date` : `${year}`;
  }

  const cells = buildCells(items, areaKey);
  const relevant = categoryFilter ? cells.filter((c) => c.category === categoryFilter) : cells;

  const all: Signal[] = [];
  for (const c of relevant) all.push(...analyseLive(c, anchor, dataStart, areaKey, win, wLabel));

  return {
    signals: pick(all, LIVE_ORDER, limit),
    meta: metaFor('live', reports, items, areaKey, dataStart, anchor, win, wLabel),
  };
}

export function buildHistoricalSignals(
  reports: Report[],
  limit = 4,
  categoryFilter?: Category | null
): { signals: Signal[]; meta: DatasetMeta } {
  const areaKey = resolveAreaKey(reports);
  const { items, anchor, dataStart } = prepare(reports);
  const cells = buildCells(items, areaKey);
  const relevant = categoryFilter ? cells.filter((c) => c.category === categoryFilter) : cells;

  const all: Signal[] = [];
  for (const c of relevant) {
    if (c.items.length < 25) continue;
    const rp = detectRecurringPeak(c, areaKey, anchor);
    if (rp) all.push(rp);
    const mt = detectMultiYearTrend(c, areaKey, anchor);
    if (mt) all.push(mt);
  }
  const structural = detectStructural(cells, items, areaKey);
  all.push(...(categoryFilter ? structural.filter((s) => s.category === categoryFilter) : structural));

  return {
    signals: pick(all, HISTORICAL_ORDER, limit),
    meta: metaFor('historical', reports, items, areaKey, dataStart, anchor, 0, 'full history'),
  };
}
