'use client';

import { useEffect, useMemo, useState } from 'react';

type Agency = { id: string; name: string };

type User = { id: string; email: string; role: string; isActive: boolean };

type Venue = { id: string; name: string; address: string | null };

type Intermediary = { id: string; name: string; reportFormUrl: string | null };

type Event = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  intermediaryId: string | null;
  intermediaryName: string | null;
  memo: string | null;
};

const cashHandlingOptions = [
  { value: 'HOLD', label: '預かり' },
  { value: 'TAKE_HOME', label: '持ち帰り' },
];

export default function AdminDashboard() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
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
    const [agenciesRes, usersRes, venuesRes, eventsRes, intermediariesRes] = await Promise.all([
      fetch('/api/agencies'),
      fetch('/api/users'),
      fetch('/api/venues'),
      fetch('/api/events'),
      fetch('/api/intermediaries'),
    ]);
    if (agenciesRes.ok) setAgencies(await agenciesRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
    if (venuesRes.ok) setVenues(await venuesRes.json());
    if (eventsRes.ok) setEvents(await eventsRes.json());
    if (intermediariesRes.ok) setIntermediaries(await intermediariesRes.json());
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleCreateAgency = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: formData.get('name') }),
    });
    if (response.ok) {
      setMessage('代理店を作成しました。');
      event.currentTarget.reset();
      refresh();
    }
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: formData.get('email'),
        role: formData.get('role'),
        agencyId: formData.get('agencyId') || undefined,
      }),
    });
    if (response.ok) {
      const payload = await response.json();
      setMessage(`ユーザーを作成しました。仮パスワード: ${payload.tempPassword}`);
      event.currentTarget.reset();
      refresh();
    }
  };

  const handleCreateVenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('venueName'),
        address: formData.get('venueAddress'),
        phone: formData.get('venuePhone'),
        contactName: formData.get('contactName'),
        trashRule: formData.get('trashRule'),
        cashHandling: formData.get('cashHandling') || null,
        notes: formData.get('notes'),
        hours: formData.get('hours'),
        workWindow: formData.get('workWindow'),
        loadInTime: formData.get('loadInTime'),
        loadOutTime: formData.get('loadOutTime'),
        preContactRequired: formData.get('preContactRequired') === 'on',
        brokerNote: formData.get('brokerNote'),
        agencyId: formData.get('venueAgency') || undefined,
      }),
    });
    if (response.ok) {
      setMessage('会場を作成しました。');
      event.currentTarget.reset();
      refresh();
    }
  };

  const handleCreateEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('eventTitle'),
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        agencyId: formData.get('eventAgency') || undefined,
        venueId: formData.get('eventVenue') || undefined,
        intermediaryId: formData.get('eventIntermediary') || null,
      }),
    });
    if (response.ok) {
      setMessage('イベントを作成しました。');
      event.currentTarget.reset();
      refresh();
    }
  };

  const handleUpdateEventIntermediary = async (eventId: string, intermediaryId: string | null) => {
    const response = await fetch(`/api/events/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intermediaryId }),
    });
    if (response.ok) {
      setMessage('仲介業者情報を更新しました。');
      refresh();
    }
  };

  const handleCreateIntermediary = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/intermediaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('intermediaryName'),
        reportFormUrl: formData.get('reportFormUrl') || null,
      }),
    });
    if (response.ok) {
      setMessage('仲介業者を作成しました。');
      event.currentTarget.reset();
      refresh();
    }
  };

  const handleUpdateIntermediary = async (eventId: string, payload: { name: string; reportFormUrl: string | null }) => {
    const response = await fetch(`/api/intermediaries/${eventId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setMessage('仲介業者を更新しました。');
      refresh();
    }
  };

  const handleDeleteIntermediary = async (eventId: string) => {
    const response = await fetch(`/api/intermediaries/${eventId}`, { method: 'DELETE' });
    if (response.ok) {
      setMessage('仲介業者を削除しました。');
      refresh();
    }
  };

  return (
    <div className="space-y-10">
      {message ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 px-4 py-2 rounded">
          {message}
        </div>
      ) : null}
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">代理店管理</h2>
          <form onSubmit={handleCreateAgency} className="space-y-3">
            <div>
              <label htmlFor="agency-name">代理店名</label>
              <input id="agency-name" name="name" required />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-300">
            {agencies.map((agency) => (
              <li key={agency.id}>{agency.name}</li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">ユーザー管理</h2>
          <form onSubmit={handleCreateUser} className="space-y-3">
            <div>
              <label htmlFor="user-email">メール</label>
              <input id="user-email" name="email" type="email" required />
            </div>
            <div>
              <label htmlFor="user-role">ロール</label>
              <select id="user-role" name="role" required>
                <option value="ADMIN">Admin</option>
                <option value="AGENT">Agent</option>
              </select>
            </div>
            <div>
              <label htmlFor="user-agency">代理店ID (任意)</label>
              <input id="user-agency" name="agencyId" placeholder="agency id" />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-300">
            {users.map((user) => (
              <li key={user.id}>
                {user.email} ({user.role})
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">仲介業者管理</h2>
          <form onSubmit={handleCreateIntermediary} className="space-y-3">
            <div>
              <label htmlFor="intermediary-name">業者名</label>
              <input id="intermediary-name" name="intermediaryName" required />
            </div>
            <div>
              <label htmlFor="report-form-url">報告フォームURL (任意)</label>
              <input id="report-form-url" name="reportFormUrl" type="url" placeholder="https://" />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-3 text-sm text-slate-200">
            {intermediaries.map((intermediary) => (
              <li key={intermediary.id} className="space-y-2 border border-slate-800 rounded p-3">
                <div className="font-medium">{intermediary.name}</div>
                <div className="text-xs text-slate-400 break-all">
                  {intermediary.reportFormUrl ?? '報告フォームURLなし'}
                </div>
                <form
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    const formData = new FormData(submitEvent.currentTarget);
                    handleUpdateIntermediary(intermediary.id, {
                      name: formData.get('name')?.toString() ?? intermediary.name,
                      reportFormUrl: (formData.get('reportFormUrl')?.toString() || null) as string | null,
                    });
                  }}
                  className="grid gap-2"
                >
                  <input name="name" defaultValue={intermediary.name} />
                  <input
                    name="reportFormUrl"
                    defaultValue={intermediary.reportFormUrl ?? ''}
                    placeholder="https://"
                  />
                  <div className="flex gap-2">
                    <button className="bg-slate-700 text-white" type="submit">
                      更新
                    </button>
                    <button
                      className="bg-rose-500/80 text-white"
                      type="button"
                      onClick={() => handleDeleteIntermediary(intermediary.id)}
                    >
                      削除
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">会場管理</h2>
          <form onSubmit={handleCreateVenue} className="space-y-3">
            <div>
              <label htmlFor="venue-name">会場名</label>
              <input id="venue-name" name="venueName" required />
            </div>
            <div>
              <label htmlFor="venue-address">住所</label>
              <input id="venue-address" name="venueAddress" />
            </div>
            <div>
              <label htmlFor="venue-phone">電話番号</label>
              <input id="venue-phone" name="venuePhone" />
            </div>
            <div>
              <label htmlFor="venue-contact">先方担当者名</label>
              <input id="venue-contact" name="contactName" />
            </div>
            <div>
              <label htmlFor="venue-trash">ゴミ出しルール</label>
              <textarea id="venue-trash" name="trashRule" rows={2} />
            </div>
            <div>
              <label htmlFor="venue-cash">売上金預かり</label>
              <select id="venue-cash" name="cashHandling">
                <option value="">選択してください</option>
                {cashHandlingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="venue-notes">注意事項</label>
              <textarea id="venue-notes" name="notes" rows={2} />
            </div>
            <div>
              <label htmlFor="venue-hours">営業時間</label>
              <input id="venue-hours" name="hours" list="time-options" placeholder="09:00" />
            </div>
            <div>
              <label htmlFor="venue-work">作業可能開始/終了</label>
              <input id="venue-work" name="workWindow" list="time-options" placeholder="09:00-18:00" />
            </div>
            <div>
              <label htmlFor="venue-loadin">搬入時間</label>
              <input id="venue-loadin" name="loadInTime" list="time-options" placeholder="09:00" />
            </div>
            <div>
              <label htmlFor="venue-loadout">搬出時間</label>
              <input id="venue-loadout" name="loadOutTime" list="time-options" placeholder="18:00" />
            </div>
            <div className="flex items-center gap-2">
              <input id="venue-precontact" name="preContactRequired" type="checkbox" className="w-4 h-4" />
              <label htmlFor="venue-precontact">前日連絡が必要</label>
            </div>
            <div>
              <label htmlFor="venue-broker-note">仲介業者欄</label>
              <input id="venue-broker-note" name="brokerNote" />
            </div>
            <div>
              <label htmlFor="venue-agency">代理店ID (任意)</label>
              <input id="venue-agency" name="venueAgency" placeholder="agency id" />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-300">
            {venues.map((venue) => (
              <li key={venue.id}>{venue.name}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">スケジュール/イベント</h2>
          <form onSubmit={handleCreateEvent} className="space-y-3">
            <div>
              <label htmlFor="event-title">タイトル</label>
              <input id="event-title" name="eventTitle" required />
            </div>
            <div>
              <label htmlFor="event-start">開始日</label>
              <input id="event-start" name="startDate" type="date" required />
            </div>
            <div>
              <label htmlFor="event-end">終了日</label>
              <input id="event-end" name="endDate" type="date" required />
            </div>
            <div>
              <label htmlFor="event-intermediary">仲介業者</label>
              <select id="event-intermediary" name="eventIntermediary">
                <option value="">未設定</option>
                {intermediaries.map((intermediary) => (
                  <option key={intermediary.id} value={intermediary.id}>
                    {intermediary.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="event-agency">代理店ID (任意)</label>
              <input id="event-agency" name="eventAgency" placeholder="agency id" />
            </div>
            <div>
              <label htmlFor="event-venue">会場ID (任意)</label>
              <input id="event-venue" name="eventVenue" placeholder="venue id" />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            {events.map((event) => (
              <li key={event.id} className="border border-slate-800 rounded p-3 space-y-2">
                <div>
                  <div className="font-medium">{event.title}</div>
                  <div className="text-xs text-slate-400">
                    {event.startDate}〜{event.endDate}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">仲介業者</label>
                  <select
                    className="mt-1"
                    value={event.intermediaryId ?? ''}
                    onChange={(eventItem) =>
                      handleUpdateEventIntermediary(event.id, eventItem.target.value || null)
                    }
                  >
                    <option value="">未設定</option>
                    {intermediaries.map((intermediary) => (
                      <option key={intermediary.id} value={intermediary.id}>
                        {intermediary.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">共有メモ</div>
                  <div className="whitespace-pre-wrap text-xs text-slate-200">
                    {event.memo || 'メモはまだありません。'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
          <h2 className="text-lg font-semibold mb-4">時間候補</h2>
          <p className="text-sm text-slate-400 mb-3">プルダウン候補から選択するか、直接入力できます。</p>
          <datalist id="time-options">
            {timeOptions.map((option) => (
              <option key={option} value={option} />
            ))}
          </datalist>
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
            {timeOptions.slice(0, 9).map((option) => (
              <div key={option}>{option}</div>
            ))}
            <div>...</div>
          </div>
        </div>
      </section>
    </div>
  );
}
