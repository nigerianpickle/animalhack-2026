import { NextResponse } from 'next/server';
import { fetchReports, calculateTrends, getTopTrends } from '@/lib/stats';
import { generateInsight } from '@/lib/llm';

export async function GET() {
  try {
    const reports = await fetchReports();
    const trends = calculateTrends(reports); // defaults to 30-day window now
    const topTrends = getTopTrends(trends, 5);
    const insights = await Promise.all(topTrends.map(generateInsight));
    return NextResponse.json(insights);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}