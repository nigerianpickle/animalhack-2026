import { NextResponse } from 'next/server';
import { fetchReports, buildSignals } from '@/lib/stats';
import { generateInsight } from '@/lib/llm';

export const maxDuration = 60;

export async function GET() {
  try {
    const reports = await fetchReports();
    const { signals, areaLabel } = buildSignals(reports, 6);

    // Sequential, not Promise.all — free-tier Groq rejects parallel bursts,
    // which was silently pushing every card into the fallback path.
    const insights = [];
    for (const signal of signals) {
      insights.push({
        ...(await generateInsight(signal)),
        _facts: signal.facts,   // carried through so campaign planning has the same grounding
      });
    }

    return NextResponse.json({
      insights,
      meta: {
        areaLabel,
        reportCount: reports.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[insights] fatal:', err);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}