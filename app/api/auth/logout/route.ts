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
  const lowered = name.toLowerCase();
  return (
    lowered.includes('token') ||
    lowered.includes('session') ||
    lowered.includes('auth') ||
    lowered.includes('jwt') ||
    lowered.startsWith('saiya') ||
    lowered.startsWith('next-auth')
  );
}

// “消す” は delete だけだと取りこぼすので、maxAge=0 の上書きを path 違いで複数打つ
function expireCookie(res: NextResponse, name: string) {
  const base = {
    name,
    value: '',
    maxAge: 0,
  } as const;

  // 最も多いパターン
  res.cookies.set({ ...base, path: '/' });

  // もし /admin 配下で path 指定して set していた場合の保険
  res.cookies.set({ ...base, path: '/admin' });

  // もし /api 配下で path 指定して set していた場合の保険
  res.cookies.set({ ...base, path: '/api' });
}

function withPrefixes(name: string) {
  // Cookie の prefix 変種も消す（__Host- / __Secure-）
  return [name, `__Host-${name}`, `__Secure-${name}`];
}

export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });

  // 1) 現在リクエストに乗ってきた cookie 名をまず全部候補にする
  const cookieHeader = request.headers.get('cookie');
  const names = parseCookieNames(cookieHeader);

  const toClear = new Set<string>();

  for (const name of names) {
    if (isAuthCookieName(name)) {
      for (const v of withPrefixes(name)) toClear.add(v);
    }
  }

  // 2) 代表的な cookie 名を保険で追加（プロジェクトで使ってそうなもの）
  const commonNames = ['token', 'session', 'auth', 'jwt', 'saiya', 'saiya_token', 'saiya_session'];
  for (const base of commonNames) {
    for (const v of withPrefixes(base)) toClear.add(v);
  }

  // 3) 全消し（maxAge=0 上書き）
  for (const name of toClear) {
    expireCookie(res, name);
  }

  // キャッシュ抑止（ブラウザが古い状態を保持しないように）
  res.headers.set('Cache-Control', 'no-store');

  return res;
}
