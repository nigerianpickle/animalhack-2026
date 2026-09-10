import { NextResponse } from 'next/server';

// In-memory store for the demo — swap for a real Campaign table if you add one to Prisma later
const campaigns: {
  id: string;
  neighbourhood: string;
  category: string;
  type: 'foster_recruitment' | 'adoption_event' | 'notify_partners';
  status: 'launched';
  createdAt: string;
}[] = [];

export async function GET() {
  return NextResponse.json(campaigns);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { neighbourhood, category, type } = body;

  if (!neighbourhood || !category || !type) {
    return NextResponse.json(
      { error: 'Missing required fields: neighbourhood, category, type' },
      { status: 400 }
    );
  }

  const campaign = {
    id: crypto.randomUUID(),
    neighbourhood,
    category,
    type,
    status: 'launched' as const,
    createdAt: new Date().toISOString(),
  };

  campaigns.push(campaign);

  return NextResponse.json(campaign, { status: 201 });
}