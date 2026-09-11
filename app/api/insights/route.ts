import { NextResponse } from 'next/server';
import { fetchReports, buildLiveSignals, buildHistoricalSignals, Category } from '@/lib/stats';
import { generateInsight } from '@/lib/llm';

export const maxDuration = 60;

const cache = new Map<string, { payload: any; at: number }>();
const TTL_MS = 10 * 60 * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';
  const scope = url.searchParams.get('scope') === 'historical' ? 'historical' : 'live';
  const categoryParam = url.searchParams.get('category');
  const category = (categoryParam && categoryParam !== 'all' ? categoryParam : null) as Category | null;

  // HistoryFilter sends a year ("2025") or "all".
  const periodParam = url.searchParams.get('period') ?? 'all';
  const year = /^\d{4}$/.test(periodParam) ? Number(periodParam) : null;

  const cacheKey = `${scope}::${category ?? 'all'}::${scope === 'live' ? (year ?? 'recent') : 'x'}`;
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ ...cached.payload, meta: { ...cached.payload.meta, cached: true } });
  }

  try {
    const reports = await fetchReports();
    const { signals, meta } =
      scope === 'historical'
        ? buildHistoricalSignals(reports, 4, category)
        : buildLiveSignals(reports, 4, category, 90, year);

    const insights = [];
    for (let i = 0; i < signals.length; i++) {
      insights.push(await generateInsight(signals[i]));
      if (i < signals.length - 1) await sleep(3500);
    }

    const payload = { insights, meta: { ...meta, generatedAt: new Date().toISOString(), cached: false } };
    cache.set(cacheKey, { payload, at: Date.now() });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('[insights] fatal:', err);
    if (cached) return NextResponse.json({ ...cached.payload, meta: { ...cached.payload.meta, cached: true, stale: true } });
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}