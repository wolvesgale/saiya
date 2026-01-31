import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-2xl font-semibold mb-4">Saiya / Xrule</h1>
      <p className="text-slate-600 mb-6">
        催事販売管理のマルチテナントSaaS基盤です。ログインして各ロールの画面へ進んでください。
      </p>
      <Link className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded" href="/login">
        ログインへ
      </Link>
    </div>
  );
}
