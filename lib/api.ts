// lib/api.ts
import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth';

export async function requireSession(request: Request) {
  const user = await getSessionUserFromRequest(request);
  if (!user) {
    return { user: null, response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  }
  return { user, response: null };
}

export function requireRoles(userRole: string, allowed: string[]) {
  if (!allowed.includes(userRole)) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export function errorResponse(error: unknown) {
  const status = (error as Error & { status?: number }).status ?? 500;
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return NextResponse.json({ error: { name, message } }, { status });
}
