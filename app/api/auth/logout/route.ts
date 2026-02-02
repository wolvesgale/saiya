import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // セッションクッキーを確実に消す
  res.cookies.delete('saiya_session');

  // 保険でよくある名前も削除
  res.cookies.delete('token');
  res.cookies.delete('session');
  res.cookies.delete('auth');

  return res;
}
