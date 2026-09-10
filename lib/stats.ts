export type Report = {
  id: string;
  rawType: string;
  category: 'stray_roaming' | 'lost_found' | 'welfare_distress' | 'surrender_capacity' | 'safety_complaint';
  date: string;
  neighbourhood: string;
  ward: string;
  lat: number;
  lng: number;
};

export type Trend = {
  neighbourhood: string;
  category: Report['category'];
  current: number;
  previous: number;
  changePercent: number;
};

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function fetchReports(): Promise<Report[]> {
  const res = await fetch(`${BASE_URL}/api/reports`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch reports: ${res.status}`);
  return res.json();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export function calculateTrends(reports: Report[], windowDays = 30): Trend[] {
  const now = new Date();
  const currentStart = daysAgo(windowDays);
  const previousStart = daysAgo(windowDays * 2);

  const groups = new Map<string, { current: number; previous: number }>();

  for (const r of reports) {
    const reportDate = new Date(r.date);
    const key = `${r.neighbourhood}::${r.category}`;
    if (!groups.has(key)) groups.set(key, { current: 0, previous: 0 });
    const g = groups.get(key)!;

    if (reportDate >= currentStart && reportDate <= now) {
      g.current += 1;
    } else if (reportDate >= previousStart && reportDate < currentStart) {
      g.previous += 1;
    }
  }

  const trends: Trend[] = [];
  for (const [key, counts] of groups.entries()) {
    const [neighbourhood, category] = key.split('::');
    if (counts.previous === 0 && counts.current === 0) continue;
    const changePercent = counts.previous === 0
      ? 100
      : ((counts.current - counts.previous) / counts.previous) * 100;
    trends.push({
      neighbourhood,
      category: category as Report['category'],
      current: counts.current,
      previous: counts.previous,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }

  return trends;
}

export function getTopTrends(trends: Trend[], limit = 5): Trend[] {
  return [...trends]
    .filter(t => (t.current >= 3 || t.previous >= 3) && Math.abs(t.changePercent) >= 20)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, limit);
}