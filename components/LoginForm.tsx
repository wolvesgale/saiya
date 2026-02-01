'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.message ?? 'ログインに失敗しました。');
      setLoading(false);
      return;
    }

    const payload = await response.json();
    if (payload.mustChangePassword) {
      router.push('/reset-password');
      return;
    }

    if (payload.role === 'SUPER_ADMIN' || payload.role === 'ADMIN') {
      router.push('/admin');
      return;
    }
    router.push('/agent');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-slate-900/80 border border-slate-800 p-6 rounded-lg">
      <div>
        <label htmlFor="email">メールアドレス</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </div>
      <div>
        <label htmlFor="password">パスワード</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button
        type="submit"
        className="bg-indigo-500 text-white w-full"
        disabled={loading}
      >
        {loading ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  );
}
