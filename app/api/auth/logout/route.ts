import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // 本命
  res.cookies.delete('saiya_session');

  // 念のため（過去互換）
  res.cookies.delete('token');
  res.cookies.delete('session');
  res.cookies.delete('auth');

  return res;
}
