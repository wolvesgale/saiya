'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

type Agency = { id: string; name: string };

type Venue = { id: string; name: string; cashHandling: string | null };

type Intermediary = { id: string; name: string };

type EventDetail = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyId: string;
  venueId: string;
  intermediaryId: string | null;
  memo: string | null;
  cashHandling: string | null;
  reportDeadline: string | null;
};

const cashHandlingOptions = [
  { value: 'HOLD', label: '預かり' },
  { value: 'TAKE_HOME', label: '持ち帰り' },
];

export default function AdminEventEditPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.id as string;
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [intermediaries, setIntermediaries] = useState<Intermediary[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let hour = 7; hour <= 23; hour += 1) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        options.push(`${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
      }
    }
    return options;
  }, []);

  const refresh = async () => {
    const [eventRes, agenciesRes, venuesRes, intermediariesRes] = await Promise.all([
      fetch(`/api/events/${eventId}`),
      fetch('/api/agencies'),
      fetch('/api/venues'),
      fetch('/api/intermediaries'),
    ]);
    if (eventRes.ok) setEventDetail(await eventRes.json());
    if (agenciesRes.ok) setAgencies(await agenciesRes.json());
    if (venuesRes.ok) setVenues(await venuesRes.json());
    if (intermediariesRes.ok) setIntermediaries(await intermediariesRes.json());
  };

  useEffect(() => {
    refresh();
  }, [eventId]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    // イベント情報の更新
    const eventResponse = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        agencyId: formData.get('agencyId'),
        venueId: formData.get('venueId'),
        intermediaryId: formData.get('intermediaryId') || null,
        cashHandling: formData.get('cashHandling') || null,
        reportDeadline: formData.get('reportDeadline') || null,
      }),
    });

    // メモの更新（管理者による全文編集）
    const memoText = formData.get('memoEdit')?.toString() ?? '';
    const memoResponse = await fetch(`/api/events/${eventId}/memo`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: memoText }),
    });

    if (eventResponse.ok && memoResponse.ok) {
      setMessage('イベントを更新しました。');
      refresh();
    } else {
      setMessage('更新に一部失敗しました。再度お試しください。');
    }
  };

  if (!eventDetail) {
    return <div className="max-w-3xl mx-auto px-6 py-10 text-slate-300">読み込み中...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">イベント編集</h1>
          <p className="text-sm text-slate-400">タイトルは自動生成されます。</p>
        </div>
        <button className="bg-slate-800 text-slate-200" onClick={() => router.push('/admin')} type="button">
          戻る
        </button>
      </div>
      {message ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 px-4 py-2 rounded">
          {message}
        </div>
      ) : null}
      <form onSubmit={handleSubmit} className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-3">
        <div>
          <label htmlFor="title">タイトル</label>
          <input id="title" value={eventDetail.title} readOnly />
        </div>
        <div>
          <label htmlFor="agencyId">代理店</label>
          <select id="agencyId" name="agencyId" defaultValue={eventDetail.agencyId} required>
            {agencies.map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="venueId">会場</label>
          <select id="venueId" name="venueId" defaultValue={eventDetail.venueId} required>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startDate">開始日</label>
          <input id="startDate" name="startDate" type="date" defaultValue={eventDetail.startDate} required />
        </div>
        <div>
          <label htmlFor="endDate">終了日</label>
          <input id="endDate" name="endDate" type="date" defaultValue={eventDetail.endDate} required />
        </div>
        <div>
          <label htmlFor="intermediaryId">仲介業者</label>
          <select id="intermediaryId" name="intermediaryId" defaultValue={eventDetail.intermediaryId ?? ''}>
            <option value="">未設定</option>
            {intermediaries.map((intermediary) => (
              <option key={intermediary.id} value={intermediary.id}>
                {intermediary.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cashHandling">売上金預かり</label>
          <select id="cashHandling" name="cashHandling" defaultValue={eventDetail.cashHandling ?? ''}>
            <option value="">会場設定に従う</option>
            {cashHandlingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="reportDeadline">報告締切</label>
          <input id="reportDeadline" name="reportDeadline" list="time-options" defaultValue={eventDetail.reportDeadline ?? '21:00'} />
        </div>
        <div>
          <label htmlFor="memoEdit">共有メモ（管理者編集）</label>
          <textarea
            id="memoEdit"
            name="memoEdit"
            rows={6}
            className="w-full bg-slate-950/60 border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 whitespace-pre-wrap"
            defaultValue={eventDetail.memo ?? ''}
          />
          <p className="text-xs text-slate-400 mt-1">代理店の追記内容を含む全文を自由に編集できます。空にするとメモを削除します。</p>
        </div>
        <button className="bg-indigo-500 text-white" type="submit">
          更新
        </button>
      </form>
      <datalist id="time-options">
        {timeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
