// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // saiya_session を確実に無効化
  res.cookies.set('saiya_session', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });

  // 念のため（過去互換）
  res.cookies.set('token', '', { path: '/', expires: new Date(0) });
  res.cookies.set('session', '', { path: '/', expires: new Date(0) });
  res.cookies.set('auth', '', { path: '/', expires: new Date(0) });

  return res;
}
