// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // セッション cookie を確実に削除
  res.cookies.delete('saiya_session');

  // 保険（過去に別名で持っていた場合）
  res.cookies.delete('token');
  res.cookies.delete('session');
  res.cookies.delete('auth');

  return res;
}
