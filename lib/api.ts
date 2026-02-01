import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export async function requireSession() {
  const user = await getSessionUser();
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
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return NextResponse.json({ message }, { status });
}
