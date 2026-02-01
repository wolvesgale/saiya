'use client';

import { useEffect, useMemo, useState } from 'react';

type EventSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyName: string | null;
  venueName: string | null;
  intermediaryName: string | null;
  intermediaryReportFormUrl: string | null;
  memo: string | null;
};

type VenueSummary = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  notes: string | null;
  hours: string | null;
  workWindow: string | null;
  loadInTime: string | null;
  loadOutTime: string | null;
};

type ReportPrompt = {
  eventId: string;
  eventTitle: string;
  reportFormUrl: string;
};

const reportPromptKey = (eventId: string) => `reportPromptShown:${eventId}`;

export default function AgentDashboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reportPrompt, setReportPrompt] = useState<ReportPrompt | null>(null);

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
    const [eventsResponse, venuesResponse] = await Promise.all([
      fetch('/api/events'),
      fetch('/api/venues'),
    ]);
    if (eventsResponse.ok) {
      setEvents(await eventsResponse.json());
    }
    if (venuesResponse.ok) {
      setVenues(await venuesResponse.json());
    }
  };

  useEffect(() => {
    refresh();
    const now = new Date();
    if (now.getHours() >= 21) {
      setWarning('21時を過ぎています。未入力の売上がある場合は督促対象です。');
    }
  }, []);

  useEffect(() => {
    if (!events.length) return;
    const now = new Date();
    if (now.getHours() < 21) return;

    const today = now.toISOString().slice(0, 10);
    const candidate = events.find((eventItem) => {
      if (!eventItem.intermediaryReportFormUrl) return false;
      if (eventItem.endDate !== today) return false;
      if (typeof window === 'undefined') return false;
      return !window.localStorage.getItem(reportPromptKey(eventItem.id));
    });

    if (candidate && candidate.intermediaryReportFormUrl) {
      setReportPrompt({
        eventId: candidate.id,
        eventTitle: candidate.title,
        reportFormUrl: candidate.intermediaryReportFormUrl,
      });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(reportPromptKey(candidate.id), 'true');
      }
    }
  }, [events]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: formData.get('eventId'),
        date: formData.get('date'),
        amount: Number(formData.get('amount')),
        commissionType: formData.get('commissionType'),
        commissionValue: Number(formData.get('commissionValue')),
        parkingFee: Number(formData.get('parkingFee') || 0),
        managerName: formData.get('managerName'),
        memoAppend: formData.get('memoAppend'),
        partyType: 'AGENT',
      }),
    });
    if (response.ok) {
      setMessage('売上を登録しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message ?? '売上登録に失敗しました。');
  };

  const handleMemoAppend = async (eventId: string, memo: string, reset: () => void) => {
    const response = await fetch(`/api/events/${eventId}/memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memo }),
    });
    if (response.ok) {
      setMessage('メモを追記しました。');
      reset();
      refresh();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message ?? 'メモ追記に失敗しました。');
  };

  return (
    <div className="space-y-6">
      {warning ? (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-2 rounded">
          {warning}
        </div>
      ) : null}
      {message ? (
        <div className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2 rounded">
          {message}
        </div>
      ) : null}
      {reportPrompt ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full space-y-4">
            <h3 className="text-lg font-semibold">業者報告が必要です</h3>
            <p className="text-sm text-slate-300">
              {reportPrompt.eventTitle} の仲介業者報告が必要です。こちらのフォームから報告してください。
            </p>
            <div className="flex flex-col gap-2">
              <a
                className="bg-indigo-500 text-white text-center py-2 rounded"
                href={reportPrompt.reportFormUrl}
                target="_blank"
                rel="noreferrer"
              >
                フォームを開く
              </a>
              <button className="text-slate-300 text-sm" onClick={() => setReportPrompt(null)}>
                後で確認する
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">売上入力</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="sales-event">イベント</label>
            <select id="sales-event" name="eventId" required>
              <option value="">選択してください</option>
              {events.map((eventItem) => (
                <option key={eventItem.id} value={eventItem.id}>
                  {eventItem.title} ({eventItem.startDate}〜{eventItem.endDate})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sales-date">日付</label>
            <input id="sales-date" name="date" type="date" required />
          </div>
          <div>
            <label htmlFor="sales-amount">売上額</label>
            <input id="sales-amount" name="amount" type="number" required />
          </div>
          <div>
            <label htmlFor="commission-type">歩率/固定</label>
            <select id="commission-type" name="commissionType" required>
              <option value="PERCENT">歩率</option>
              <option value="FIXED">固定</option>
            </select>
          </div>
          <div>
            <label htmlFor="commission-value">歩率/固定値</label>
            <input id="commission-value" name="commissionValue" type="number" required />
          </div>
          <div>
            <label htmlFor="parking-fee">駐車場（任意）</label>
            <input id="parking-fee" name="parkingFee" type="number" />
          </div>
          <div>
            <label htmlFor="manager-name">責任者名</label>
            <input id="manager-name" name="managerName" required />
          </div>
          <div>
            <label htmlFor="memo-append">メモ追記</label>
            <textarea id="memo-append" name="memoAppend" rows={3} />
          </div>
          <button className="bg-indigo-500 text-white">送信</button>
        </form>
      </div>
      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">イベント一覧</h2>
        <ul className="text-sm text-slate-300 space-y-4">
          {events.map((eventItem) => (
            <li key={eventItem.id} className="border border-slate-800 rounded p-4 space-y-3">
              <div>
                <div className="font-medium text-slate-100">{eventItem.title}</div>
                <div className="text-xs text-slate-400">
                  {eventItem.startDate}〜{eventItem.endDate}
                </div>
                <div className="text-xs text-slate-400">
                  {eventItem.agencyName ?? '代理店未設定'} / {eventItem.venueName ?? '会場未設定'}
                </div>
                <div className="text-xs text-slate-400">
                  仲介業者: {eventItem.intermediaryName ?? '未設定'}
                </div>
              </div>
              <div className="text-xs text-slate-400 whitespace-pre-wrap">
                {eventItem.memo || '共有メモはまだありません。'}
              </div>
              <form
                className="space-y-2"
                onSubmit={(formEvent) => {
                  formEvent.preventDefault();
                  const formData = new FormData(formEvent.currentTarget);
                  const memo = formData.get('memo')?.toString() ?? '';
                  handleMemoAppend(eventItem.id, memo, () => formEvent.currentTarget.reset());
                }}
              >
                <div>
                  <label htmlFor={`memo-${eventItem.id}`}>メモ追記（代理店のみ）</label>
                  <textarea id={`memo-${eventItem.id}`} name="memo" rows={2} required />
                </div>
                <button className="bg-slate-700 text-white">追記する</button>
              </form>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">会場一覧</h2>
        <ul className="text-sm text-slate-300 space-y-4">
          {venues.map((venue) => (
            <li key={venue.id} className="border border-slate-800 rounded p-4 space-y-1">
              <div className="font-medium text-slate-100">{venue.name}</div>
              <div className="text-xs text-slate-400">住所: {venue.address ?? '未登録'}</div>
              <div className="text-xs text-slate-400">電話: {venue.phone ?? '未登録'}</div>
              <div className="text-xs text-slate-400 whitespace-pre-wrap">注意事項: {venue.notes ?? '未登録'}</div>
              <div className="text-xs text-slate-400">営業時間: {venue.hours ?? '未登録'}</div>
              <div className="text-xs text-slate-400">作業可能: {venue.workWindow ?? '未登録'}</div>
              <div className="text-xs text-slate-400">搬入: {venue.loadInTime ?? '未登録'}</div>
              <div className="text-xs text-slate-400">搬出: {venue.loadOutTime ?? '未登録'}</div>
            </li>
          ))}
        </ul>
        <datalist id="time-options">
          {timeOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
