'use client';

import { useEffect, useState } from 'react';

type EventSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
};

export default function BrokerDashboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const response = await fetch('/api/events');
    if (response.ok) {
      setEvents(await response.json());
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleComplete = async (eventId: string) => {
    const date = new Date().toISOString().slice(0, 10);
    const response = await fetch('/api/broker/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, date }),
    });
    if (response.ok) {
      setMessage('完了登録しました。');
      refresh();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.message ?? '完了登録に失敗しました。');
  };

  return (
    <div className="space-y-6">
      {message ? <div className="bg-slate-100 border border-slate-200 text-slate-700 px-4 py-2 rounded">{message}</div> : null}
      <div className="bg-white p-6 rounded shadow-sm">
        <h2 className="text-lg font-semibold mb-4">当日完了</h2>
        <p className="text-sm text-slate-600 mb-4">当日の入力完了ボタンを押すとAgent入力ロックが解除されます。</p>
        <ul className="space-y-2">
          {events.map((eventItem) => (
            <li key={eventItem.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div>
                <div className="font-medium">{eventItem.title}</div>
                <div className="text-xs text-slate-500">{eventItem.startDate}〜{eventItem.endDate}</div>
              </div>
              <button className="bg-emerald-600 text-white" onClick={() => handleComplete(eventItem.id)}>
                完了
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
