'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ChangePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) {
      setError('パスワードが一致しません。');
      return;
    }
    setLoading(true);
    setError(null);

    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      setError(payload.message ?? '更新に失敗しました。');
      setLoading(false);
      return;
    }

    router.push('/login');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-slate-900/80 border border-slate-800 p-6 rounded-lg">
      <div>
        <label htmlFor="password">新しいパスワード</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </div>
      <div>
        <label htmlFor="confirm">新しいパスワード（確認）</label>
        <input id="confirm" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
      </div>
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      <button type="submit" className="bg-indigo-500 text-white w-full" disabled={loading}>
        {loading ? '更新中...' : 'パスワード変更'}
      </button>
    </form>
  );
}
