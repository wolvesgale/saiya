import './globals.css';
import type { ReactNode } from 'react';
import { cookies, headers } from 'next/headers';

export const metadata = {
  title: 'Saiya Xrule',
  description: 'Multi-tenant sales operations management',
};

async function getRoleFromSession() {
  const sessionCookie = cookies().get('saiya_session');
  if (!sessionCookie) return null;

  const h = headers();
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (!host) return null;
  const baseUrl = `${proto}://${host}`;

  const cookieHeader = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!meRes.ok) return null;

  const payload = await meRes.json().catch(() => null);
  return payload?.user?.role ?? null;
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const role = await getRoleFromSession();
  const isAdminRole = role === 'SUPER_ADMIN' || role === 'ADMIN';
  const isAgentRole = role === 'AGENT';
  const showAdminLink = role ? isAdminRole : true;
  const showAgentLink = role ? isAgentRole : true;

  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <header className="bg-slate-950 border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="font-semibold text-slate-100">Saiya / Xrule</div>
              <nav className="text-sm text-slate-300">
                {showAdminLink ? (
                  <a className="mr-4 hover:text-white" href="/admin">
                    Admin
                  </a>
                ) : null}
                {showAgentLink ? (
                  <a className="hover:text-white" href="/agent">
                    Agent
                  </a>
                ) : null}
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
