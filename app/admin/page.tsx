import AdminDashboard from '@/components/AdminDashboard';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

function buildBaseUrl() {
  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;
  return `${proto}://${host}`;
}

function buildCookieHeader() {
  const cookieStore = cookies();
  const all = cookieStore.getAll();
  return all.map((c) => `${c.name}=${c.value}`).join('; ');
}

export default async function AdminPage() {
  const baseUrl = buildBaseUrl();
  if (!baseUrl) {
    redirect('/login');
  }

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: {
      cookie: buildCookieHeader(),
    },
    cache: 'no-store',
  });

  if (!meRes.ok) {
    redirect('/login');
  }

  const payload = await meRes.json().catch(() => null);
  const role = payload?.user?.role;

  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    // 代理店(AGENT)は admin 画面に入れない
    redirect('/');
  }

  return <AdminDashboard />;
}
