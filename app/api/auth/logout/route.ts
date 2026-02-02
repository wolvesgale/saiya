import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function parseCookieNames(cookieHeader: string | null) {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .map((kv) => kv.split('=')[0])
    .filter(Boolean);
}

function isAuthCookieName(name: string) {
  // 必要に応じてプロジェクトの実cookie名に寄せてください
  const lowered = name.toLowerCase();
  return (
    lowered.includes('token') ||
    lowered.includes('session') ||
    lowered.includes('auth') ||
    lowered.includes('jwt') ||
    lowered.startsWith('saiya') ||
    lowered.startsWith('next-auth') // もし next-auth 由来がある場合
  );
}

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });

  const cookieHeader = request.headers.get('cookie');
  const names = parseCookieNames(cookieHeader);

  // auth系っぽい cookie を削除
  for (const name of names) {
    if (isAuthCookieName(name)) {
      // NextResponse.cookies.delete は Next.js の cookie 操作に準拠 :contentReference[oaicite:4]{index=4}
      res.cookies.delete(name);
    }
  }

  // 明示的にこれらも消す（保険）
  res.cookies.delete('token');
  res.cookies.delete('session');
  res.cookies.delete('auth');

  return res;
}
