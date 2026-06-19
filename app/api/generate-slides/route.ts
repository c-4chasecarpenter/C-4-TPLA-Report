import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateDeck } from '@/lib/slidesBuilder';
import { SlidesPayload } from '@/lib/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as any)?.accessToken as string | undefined;
  if (!session || !accessToken) {
    return NextResponse.json({ error: 'Not signed in. Sign in with your C-4 Google account first.' }, { status: 401 });
  }
  try {
    const payload = (await req.json()) as SlidesPayload;
    const url = await generateDeck(accessToken, payload);
    return NextResponse.json({ url });
  } catch (err: any) {
    console.error('Slides generation failed:', err?.message || err);
    return NextResponse.json({ error: 'Could not generate the deck. ' + (err?.message || 'Unknown error') }, { status: 500 });
  }
}
