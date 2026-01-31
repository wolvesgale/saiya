'use client';

import { useEffect, useState } from 'react';

type Agency = { id: string; name: string; color: string | null };

type User = { id: string; email: string; role: string; isActive: boolean };

type Venue = { id: string; name: string; address: string | null };

type Event = { id: string; title: string; startDate: string; endDate: string };

export default function AdminDashboard() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    const [agenciesRes, usersRes, venuesRes, eventsRes] = await Promise.all([
      fetch('/api/agencies'),
      fetch('/api/users'),
      fetch('/api/venues'),
      fetch('/api/events'),
    ]);
    if (agenciesRes.ok) setAgencies(await agenciesRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());
    if (venuesRes.ok) setVenues(await venuesRes.json());
    if (eventsRes.ok) setEvents(await eventsRes.json());
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
      body: JSON.stringify({ name: formData.get('name'), color: formData.get('color') }),
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
        cashHandling: formData.get('cashHandling'),
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
      }),
    });
    if (response.ok) {
      setMessage('イベントを作成しました。');
      event.currentTarget.reset();
      refresh();
    }
  };

  return (
    <div className="space-y-10">
      {message ? <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded">{message}</div> : null}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow-sm">
          <h2 className="text-lg font-semibold mb-4">代理店管理</h2>
          <form onSubmit={handleCreateAgency} className="space-y-3">
            <div>
              <label htmlFor="agency-name">代理店名</label>
              <input id="agency-name" name="name" required />
            </div>
            <div>
              <label htmlFor="agency-color">カラー</label>
              <input id="agency-color" name="color" placeholder="#5B21B6" />
            </div>
            <button className="bg-slate-900 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            {agencies.map((agency) => (
              <li key={agency.id}>{agency.name}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-6 rounded shadow-sm">
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
                <option value="BROKER">Broker</option>
              </select>
            </div>
            <div>
              <label htmlFor="user-agency">代理店ID (任意)</label>
              <input id="user-agency" name="agencyId" placeholder="agency id" />
            </div>
            <button className="bg-slate-900 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            {users.map((user) => (
              <li key={user.id}>{user.email} ({user.role})</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow-sm">
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
              <textarea id="venue-cash" name="cashHandling" rows={2} />
            </div>
            <div>
              <label htmlFor="venue-notes">注意事項</label>
              <textarea id="venue-notes" name="notes" rows={2} />
            </div>
            <div>
              <label htmlFor="venue-hours">営業時間</label>
              <input id="venue-hours" name="hours" />
            </div>
            <div>
              <label htmlFor="venue-work">作業可能開始/終了</label>
              <input id="venue-work" name="workWindow" />
            </div>
            <div>
              <label htmlFor="venue-loadin">搬入時間</label>
              <input id="venue-loadin" name="loadInTime" />
            </div>
            <div>
              <label htmlFor="venue-loadout">搬出時間</label>
              <input id="venue-loadout" name="loadOutTime" />
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
            <button className="bg-slate-900 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            {venues.map((venue) => (
              <li key={venue.id}>{venue.name}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white p-6 rounded shadow-sm">
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
              <label htmlFor="event-agency">代理店ID (任意)</label>
              <input id="event-agency" name="eventAgency" placeholder="agency id" />
            </div>
            <div>
              <label htmlFor="event-venue">会場ID (任意)</label>
              <input id="event-venue" name="eventVenue" placeholder="venue id" />
            </div>
            <button className="bg-slate-900 text-white">作成</button>
          </form>
          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            {events.map((event) => (
              <li key={event.id}>{event.title} ({event.startDate}〜{event.endDate})</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
