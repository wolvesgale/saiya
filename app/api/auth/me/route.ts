import { NextResponse } from 'next/server';
import { requireSession, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
