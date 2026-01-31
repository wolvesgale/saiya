'use client';

import { useEffect, useState } from 'react';

type EventSummary = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyName: string | null;
  venueName: string | null;
};

export default function AgentDashboard() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const refresh = async () => {
    const response = await fetch('/api/events');
    if (response.ok) {
      setEvents(await response.json());
    }
  };

  useEffect(() => {
    refresh();
    const now = new Date();
    if (now.getHours() >= 21) {
      setWarning('21時を過ぎています。未入力の売上がある場合は督促対象です。');
    }
  }, []);

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

  return (
    <div className="space-y-6">
      {warning ? <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded">{warning}</div> : null}
      {message ? <div className="bg-slate-100 border border-slate-200 text-slate-700 px-4 py-2 rounded">{message}</div> : null}
      <div className="bg-white p-6 rounded shadow-sm">
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
          <button className="bg-slate-900 text-white">送信</button>
        </form>
      </div>
      <div className="bg-white p-6 rounded shadow-sm">
        <h2 className="text-lg font-semibold mb-4">イベント一覧</h2>
        <ul className="text-sm text-slate-600 space-y-1">
          {events.map((eventItem) => (
            <li key={eventItem.id}>
              {eventItem.title} - {eventItem.agencyName ?? '代理店未設定'} / {eventItem.venueName ?? '会場未設定'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
