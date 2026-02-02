// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';
import { getSessionCookieName } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
  return res;
}
