'use client';

import { useEffect, useState } from 'react';

type EventSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyName: string | null;
  venueName: string | null;
  venueId: string;
  intermediaryName: string | null;
  intermediaryReportFormUrl: string | null;
  memo: string | null;
  cashHandling: string | null;
  reportDeadline: string | null;
};

type VenueSummary = {
  id: string;
  name: string;
  address: string | null;
  note: string | null;
  attachmentUrl: string | null;
  cashHandling: string | null;
  notes: string | null;
  hours: string | null;
  workWindow: string | null;
  loadInTime: string | null;
  loadOutTime: string | null;
};

type Sale = {
  id: string;
  eventId: string;
  date: string;
  amount: number;
};

type SummaryResponse = {
  agencyTotals: Record<string, number>;
};

type ReportPrompt = {
  eventId: string;
  eventTitle: string;
  reportFormUrl: string;
};

const reportPromptKey = (eventId: string) => `reportPromptShown:${eventId}`;

const cashHandlingLabel = (value: string | null) => {
  if (value === 'HOLD') return '預かり';
  if (value === 'TAKE_HOME') return '持ち帰り';
  return '未設定';
};

export default function AgentDashboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [venues, setVenues] = useState<VenueSummary[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reportPrompt, setReportPrompt] = useState<ReportPrompt | null>(null);
  const [currentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});

  const refresh = async () => {
    const [eventsResponse, venuesResponse, salesResponse] = await Promise.all([
      fetch('/api/events'),
      fetch('/api/venues'),
      fetch('/api/sales'),
    ]);
    if (eventsResponse.ok) {
      setEvents(await eventsResponse.json());
    }
    if (venuesResponse.ok) {
      setVenues(await venuesResponse.json());
    }
    if (salesResponse.ok) {
      setSales(await salesResponse.json());
    }
  };

  const refreshSummary = async () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const response = await fetch(`/api/sales/summary?year=${year}&month=${month}`);
    if (response.ok) {
      setSummary(await response.json());
    }
  };

  useEffect(() => {
    refresh();
    refreshSummary();
    const now = new Date();
    if (now.getHours() >= 21) {
      setWarning('21時を過ぎています。未入力の売上がある場合は督促対象です。');
    }
  }, []);

  useEffect(() => {
    if (!events.length) return;
    const now = new Date();

    const candidate = events.find((eventItem) => {
      if (!eventItem.intermediaryReportFormUrl) return false;
      const deadline = eventItem.reportDeadline ?? '21:00';
      const [hours, minutes] = deadline.split(':').map((value) => Number(value));
      const endDate = new Date(eventItem.endDate);
      const deadlineDateTime = new Date(endDate);
      deadlineDateTime.setHours(hours || 21, minutes || 0, 0, 0);
      if (now < deadlineDateTime) return false;
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

  const handleMemoAppend = async (eventId: string, text: string, reset: () => void) => {
    const response = await fetch(`/api/events/${eventId}/memo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
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

  const handleSalesSubmit = async (eventId: string, date: string, amount: string, reset: () => void) => {
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, date, amount: Number(amount) }),
    });
    if (response.ok) {
      setMessage('売上を登録し、Google Sheetsへ保存しました。');
      reset();
      setSelectedDates((prev) => ({ ...prev, [eventId]: '' }));
      refresh();
      refreshSummary();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message ?? '売上登録に失敗しました。');
  };

  const monthlyTotal = Object.values(summary?.agencyTotals ?? {}).reduce((sum, value) => sum + value, 0);

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
        <h2 className="text-lg font-semibold mb-2">今月の累計売上</h2>
        <div className="text-2xl font-semibold text-indigo-200">{monthlyTotal.toLocaleString()} 円</div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">イベント一覧</h2>
        <ul className="text-sm text-slate-300 space-y-4">
          {events.map((eventItem) => {
            const eventSales = sales.filter((sale) => sale.eventId === eventItem.id);
            const selectedDate = selectedDates[eventItem.id] ?? '';
            const isLocked = selectedDate
              ? eventSales.some((sale) => sale.date.slice(0, 10) === selectedDate)
              : false;
            return (
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
                  <div className="text-xs text-slate-400">売上金預かり: {cashHandlingLabel(eventItem.cashHandling)}</div>
                </div>
                <div className="text-xs text-slate-400 whitespace-pre-wrap">
                  {eventItem.memo || '共有メモはまだありません。'}
                </div>
                <form
                  className="space-y-2"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    const formData = new FormData(formEvent.currentTarget);
                    const text = formData.get('memo')?.toString() ?? '';
                    handleMemoAppend(eventItem.id, text, () => formEvent.currentTarget.reset());
                  }}
                >
                  <div>
                    <label htmlFor={`memo-${eventItem.id}`}>メモ追記（代理店のみ）</label>
                    <textarea id={`memo-${eventItem.id}`} name="memo" rows={2} required />
                  </div>
                  <button className="bg-slate-700 text-white">追記する</button>
                </form>
                <form
                  className="space-y-2"
                  onSubmit={(formEvent) => {
                    formEvent.preventDefault();
                    const formData = new FormData(formEvent.currentTarget);
                    const date = formData.get('date')?.toString() ?? '';
                    const amount = formData.get('amount')?.toString() ?? '';
                    handleSalesSubmit(eventItem.id, date, amount, () => formEvent.currentTarget.reset());
                  }}
                >
                  <div>
                    <label htmlFor={`sales-date-${eventItem.id}`}>売上日付</label>
                    <input
                      id={`sales-date-${eventItem.id}`}
                      name="date"
                      type="date"
                      required
                      value={selectedDate}
                      onChange={(eventData) =>
                        setSelectedDates((prev) => ({ ...prev, [eventItem.id]: eventData.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <label htmlFor={`sales-amount-${eventItem.id}`}>日次売上額</label>
                    <input id={`sales-amount-${eventItem.id}`} name="amount" type="number" required />
                  </div>
                  <div className="text-xs text-slate-400">
                    入力済み日: {eventSales.map((sale) => sale.date.slice(0, 10)).join(', ') || 'なし'}
                  </div>
                  {isLocked ? (
                    <div className="text-xs text-rose-300">この日付は入力済みのため編集できません。</div>
                  ) : null}
                  <button className="bg-indigo-500 text-white" disabled={isLocked}>
                    売上を登録
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">会場一覧</h2>
        <ul className="text-sm text-slate-300 space-y-4">
          {venues.map((venue) => (
            <li key={venue.id} className="border border-slate-800 rounded p-4 space-y-1">
              <div className="font-medium text-slate-100">{venue.name}</div>
              <div className="text-xs text-slate-400">住所: {venue.address ?? '未登録'}</div>
              <div className="text-xs text-slate-400">会場メモ: {venue.note ?? '未登録'}</div>
              <div className="text-xs text-slate-400">注意事項: {venue.notes ?? '未登録'}</div>
              <div className="text-xs text-slate-400">売上金預かり: {cashHandlingLabel(venue.cashHandling)}</div>
              <div className="text-xs text-slate-400">営業時間: {venue.hours ?? '未登録'}</div>
              <div className="text-xs text-slate-400">作業可能: {venue.workWindow ?? '未登録'}</div>
              <div className="text-xs text-slate-400">搬入: {venue.loadInTime ?? '未登録'}</div>
              <div className="text-xs text-slate-400">搬出: {venue.loadOutTime ?? '未登録'}</div>
              {venue.attachmentUrl ? (
                <a className="text-xs text-indigo-300" href={venue.attachmentUrl} target="_blank" rel="noreferrer">
                  資料を見る
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}
