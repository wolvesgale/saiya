import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Saiya Xrule',
  description: 'Multi-tenant sales operations management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <header className="bg-white border-b border-slate-200">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="font-semibold">Saiya / Xrule</div>
              <nav className="text-sm text-slate-600">
                <a className="mr-4 hover:text-slate-900" href="/admin">Admin</a>
                <a className="mr-4 hover:text-slate-900" href="/agent">Agent</a>
                <a className="hover:text-slate-900" href="/broker">Broker</a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
