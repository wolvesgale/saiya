import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Saiya Xrule',
  description: 'Multi-tenant sales operations management',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className="dark">
      <body className="min-h-screen">
        <div className="min-h-screen flex flex-col">
          <header className="bg-slate-950 border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div className="font-semibold text-slate-100">Saiya / Xrule</div>
              <nav className="text-sm text-slate-300">
                <a className="mr-4 hover:text-white" href="/admin">Admin</a>
                <a className="hover:text-white" href="/agent">Agent</a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
