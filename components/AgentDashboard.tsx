'use client';

import { useEffect, useMemo, useState } from 'react';
import { getAgencyColor } from '@/lib/agencyColor';
import { buildWeekLanes, getMonthWeeks } from '@/lib/calendar';

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
  reportDeadline: string | null; // "21:00" など想定
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
  date: string; // ISO文字列想定
  amount: number;
};

type SummaryResponse = {
  agencyTotals: Record<string, number>;
  venueAverages?: Record<string, number>;
};

type WeeklySummaryItem = {
  agencyId: string;
  agencyName: string;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  week5: number;
  total: number;
  prevMonthTotal: number;
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
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryItem[]>([]);

  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [reportPrompt, setReportPrompt] = useState<ReportPrompt | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});

  const refresh = async () => {
    const [eventsResponse, venuesResponse, salesResponse] = await Promise.all([
      fetch('/api/events'),
      fetch('/api/venues'),
      fetch('/api/sales'),
    ]);

    if (eventsResponse.ok) setEvents(await eventsResponse.json());
    if (venuesResponse.ok) setVenues(await venuesResponse.json());
    if (salesResponse.ok) setSales(await salesResponse.json());
  };

  const refreshSummary = async () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;
    const [summaryResponse, weeklyResponse] = await Promise.all([
      fetch(`/api/sales/summary?year=${year}&month=${month}`),
      fetch(`/api/sales/summary/weekly?year=${year}&month=${month}`),
    ]);
    if (summaryResponse.ok) setSummary(await summaryResponse.json());
    if (weeklyResponse.ok) {
      const payload = await weeklyResponse.json();
      setWeeklySummary(payload.items ?? []);
    }
  };

  useEffect(() => {
    refresh();

    const now = new Date();
    if (now.getHours() >= 21) {
      setWarning('21時を過ぎています。未入力の売上がある場合は督促対象です。');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // 期限超過の業者報告ポップアップ（1イベントにつき1回だけ）
  useEffect(() => {
    if (!events.length) return;

    const now = new Date();

    const candidate = events.find((eventItem) => {
      if (!eventItem.intermediaryReportFormUrl) return false;

      const deadline = eventItem.reportDeadline ?? '21:00';
      const [hours, minutes] = deadline.split(':').map((v) => Number(v));

      const endDate = new Date(eventItem.endDate);
      const deadlineDateTime = new Date(endDate);
      deadlineDateTime.setHours(hours || 21, minutes || 0, 0, 0);

      if (now < deadlineDateTime) return false;
      if (typeof window === 'undefined') return false;

      return !window.localStorage.getItem(reportPromptKey(eventItem.id));
    });

    if (candidate?.intermediaryReportFormUrl) {
      setReportPrompt({
        eventId: candidate.id,
        eventTitle: candidate.title,
        reportFormUrl: candidate.intermediaryReportFormUrl,
      });
      window.localStorage.setItem(reportPromptKey(candidate.id), 'true');
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
  const monthLabel = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const calendarWeeks = useMemo(() => getMonthWeeks(currentMonth), [currentMonth]);
  const laneHeight = 24;
  const headerHeight = 24;

  return (
    <div className="space-y-6">
      {warning ? (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-2 rounded">{warning}</div>
      ) : null}

      {message ? (
        <div className="bg-slate-900 border border-slate-800 text-slate-200 px-4 py-2 rounded">{message}</div>
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
        <h2 className="text-lg font-semibold mb-4">週次売上（当月）</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2">代理店</th>
                <th className="py-2">1週目</th>
                <th className="py-2">2週目</th>
                <th className="py-2">3週目</th>
                <th className="py-2">4週目</th>
                <th className="py-2">5週目</th>
                <th className="py-2">合計</th>
                <th className="py-2">前月合計</th>
              </tr>
            </thead>
            <tbody>
              {weeklySummary.map((item) => (
                <tr key={item.agencyId} className="border-t border-slate-800">
                  <td className="py-2">{item.agencyName}</td>
                  <td className="py-2">{item.week1.toLocaleString()}</td>
                  <td className="py-2">{item.week2.toLocaleString()}</td>
                  <td className="py-2">{item.week3.toLocaleString()}</td>
                  <td className="py-2">{item.week4.toLocaleString()}</td>
                  <td className="py-2">{item.week5.toLocaleString()}</td>
                  <td className="py-2">{item.total.toLocaleString()}</td>
                  <td className="py-2">{item.prevMonthTotal.toLocaleString()}</td>
                </tr>
              ))}
              {!weeklySummary.length ? (
                <tr className="border-t border-slate-800">
                  <td className="py-2 text-slate-400" colSpan={8}>
                    売上データがありません。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">イベントカレンダー</h2>
          <div className="flex items-center gap-2">
            <button
              className="bg-slate-800 text-slate-200"
              onClick={() => {
                const previous = new Date(currentMonth);
                previous.setMonth(previous.getMonth() - 1);
                setCurrentMonth(previous);
              }}
              type="button"
            >
              前月
            </button>
            <span className="text-sm text-slate-300">{monthLabel}</span>
            <button
              className="bg-slate-800 text-slate-200"
              onClick={() => {
                const next = new Date(currentMonth);
                next.setMonth(next.getMonth() + 1);
                setCurrentMonth(next);
              }}
              type="button"
            >
              次月
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-xs text-slate-400">
          {['日', '月', '火', '水', '木', '金', '土'].map((label) => (
            <div key={label} className="text-center py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {calendarWeeks.map((week) => {
            const lanes = buildWeekLanes(events, week.start, week.end);
            const rowHeight = headerHeight + Math.max(1, lanes.length) * laneHeight;
            return (
              <div
                key={week.start.toISOString()}
                className="relative rounded border border-slate-800/80 bg-slate-900/40"
                style={{ minHeight: `${rowHeight}px` }}
              >
                <div className="grid grid-cols-7 text-[11px] text-slate-400">
                  {week.days.map((day) => {
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                    return (
                      <div
                        key={day.toISOString()}
                        className={`border-r border-slate-800/70 last:border-r-0 px-2 py-1 text-right ${
                          isCurrentMonth ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
                <div className="absolute left-0 right-0" style={{ top: `${headerHeight}px` }}>
                  {lanes.map((lane, laneIndex) =>
                    lane.map((segment) => {
                      const span = segment.endIndex - segment.startIndex + 1;
                      const left = (segment.startIndex / 7) * 100;
                      const width = (span / 7) * 100;
                      const details = `${segment.event.title}\n${segment.event.startDate}〜${segment.event.endDate}\n${
                        segment.event.venueName ?? '会場未設定'
                      } / ${segment.event.agencyName ?? '代理店未設定'}`;
                      return (
                        <div
                          key={`${segment.event.id}-${segment.start.toISOString()}`}
                          title={details}
                          className={`${getAgencyColor(segment.event.agencyId)} absolute text-[11px] text-white rounded px-2 py-1 truncate shadow-sm`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            top: `${laneIndex * laneHeight + 2}px`,
                          }}
                        >
                          {segment.event.title}
                        </div>
                      );
                    }),
                  )}
                  {!lanes.length ? (
                    <div className="text-[11px] text-slate-600 px-2 py-1">イベントなし</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">会場別平均売上（当月）</h2>
        <div className="space-y-2 text-sm text-slate-300">
          {venues.map((venue) => {
            const average = summary?.venueAverages?.[venue.id] ?? 0;
            return (
              <div key={venue.id} className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span>{venue.name}</span>
                <span className="text-slate-200">{average.toLocaleString()} 円</span>
              </div>
            );
          })}
          {!venues.length ? <div className="text-slate-400">会場データがありません。</div> : null}
        </div>
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
                  <div className="text-xs text-slate-400">仲介業者: {eventItem.intermediaryName ?? '未設定'}</div>
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
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300" htmlFor={`memo-${eventItem.id}`}>
                      メモ追記（代理店のみ）
                    </label>
                    <textarea
                      className="w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                      id={`memo-${eventItem.id}`}
                      name="memo"
                      rows={2}
                      required
                    />
                  </div>
                  <button className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded">追記する</button>
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-slate-300" htmlFor={`sales-date-${eventItem.id}`}>
                        売上日付
                      </label>
                      <input
                        className="w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
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

                    <div className="space-y-1">
                      <label className="text-xs text-slate-300" htmlFor={`sales-amount-${eventItem.id}`}>
                        日次売上額
                      </label>
                      <input
                        className="w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                        id={`sales-amount-${eventItem.id}`}
                        name="amount"
                        type="number"
                        required
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-400">
                    入力済み日: {eventSales.map((sale) => sale.date.slice(0, 10)).join(', ') || 'なし'}
                  </div>

                  {isLocked ? <div className="text-xs text-rose-300">この日付は入力済みのため編集できません。</div> : null}

                  <button className="bg-indigo-500 hover:bg-indigo-400 text-white px-3 py-2 rounded" disabled={isLocked}>
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
