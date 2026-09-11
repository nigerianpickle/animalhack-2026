import { NextResponse } from 'next/server';
import { generateCampaignPlan } from '@/lib/llm';
import type { ActionType } from '@/lib/stats';

export const maxDuration = 60;

type StoredCampaign = {
  id: string;
  area: string;
  category: string;
  actionType: ActionType;
  plan: Awaited<ReturnType<typeof generateCampaignPlan>>;
  status: 'planned';
  createdAt: string;
};

const campaigns: StoredCampaign[] = [];

export async function GET() {
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  try {
    const { area, areaType, category, actionType, facts } = await req.json();

    if (!area || !actionType) {
      return NextResponse.json({ error: 'Missing area or actionType' }, { status: 400 });
    }

    const plan = await generateCampaignPlan({
      actionType,
      area,
      facts: Array.isArray(facts) ? facts : [],
    });

    const campaign: StoredCampaign = {
      id: crypto.randomUUID(),
      area,
      category: category ?? 'all',
      actionType,
      plan,
      status: 'planned',
      createdAt: new Date().toISOString(),
    };
    campaigns.push(campaign);

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error('[campaigns] fatal:', err);
    return NextResponse.json({ error: 'Failed to build campaign plan' }, { status: 500 });
  }
}