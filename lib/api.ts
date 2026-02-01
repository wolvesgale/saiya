import { NextResponse } from 'next/server';
import { getSessionUserFromToken } from '@/lib/auth';

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';').map((part) => part.trim());
  for (const part of parts) {
    if (part.startsWith(`${name}=`)) {
      return decodeURIComponent(part.slice(name.length + 1));
    }
  }
  return null;
}

export async function requireSession(request: Request) {
  const token = getCookieValue(request.headers.get('cookie'), 'saiya_session');
  if (!token) {
    return { user: null, response: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }) };
  }
  const user = await getSessionUserFromToken(token);
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
