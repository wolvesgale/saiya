'use client';

import { useEffect, useMemo, useState } from 'react';

const agencyColors = [
  'bg-indigo-500/70',
  'bg-emerald-500/70',
  'bg-amber-500/70',
  'bg-rose-500/70',
  'bg-sky-500/70',
  'bg-fuchsia-500/70',
  'bg-teal-500/70',
  'bg-lime-500/70',
];

function getAgencyColor(agencyId: string) {
  let hash = 0;
  for (let i = 0; i < agencyId.length; i += 1) {
    hash = agencyId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % agencyColors.length;
  return agencyColors[index];
}

type Agency = {
  id: string;
  name: string;
  email: string | null;
  shopName: string | null;
  isActive: boolean;
  createdAt: string;
};

type User = { id: string; email: string; role: string; isActive: boolean };

type Venue = {
  id: string;
  name: string;
  address: string | null;
  cashHandling: string | null;
  attachmentUrl: string | null;
};

type Intermediary = { id: string; name: string; reportFormUrl: string | null };

type Event = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  agencyId: string;
  venueId: string;
  intermediaryId: string | null;
  intermediaryName: string | null;
  memo: string | null;
  reportDeadline: string | null;
  cashHandling: string | null;
};

type SummaryResponse = {
  agencyTotals: Record<string, number>;
  venueAverages: Record<string, number>;
  overallAverage: number;
};

const cashHandlingOptions = [
  { value: 'HOLD', label: '預かり' },
  { value: 'TAKE_HOME', label: '持ち帰り' },
];

function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 px-4 py-2 rounded whitespace-pre-wrap">
      {message}
    </div>
  );
}

function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 px-4 py-2 rounded whitespace-pre-wrap">
      {message}
    </div>
  );
}

export default function AdminDashboard() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [intermediaries, setIntermediaries] = useState<Intermediary[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  // セクション別メッセージ
  const [agencyMessage, setAgencyMessage] = useState<string | null>(null);
  const [userMessage, setUserMessage] = useState<string | null>(null);
  const [intermediaryMessage, setIntermediaryMessage] = useState<string | null>(null);
  const [venueMessage, setVenueMessage] = useState<string | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [eventMessage, setEventMessage] = useState<string | null>(null);

  const [currentMonth, setCurrentMonth] = useState(new Date());

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
    setVenueError(null);

    const [agenciesRes, usersRes, venuesRes, eventsRes, intermediariesRes] = await Promise.all([
      fetch('/api/agencies'),
      fetch('/api/users'),
      fetch('/api/venues'),
      fetch('/api/events'),
      fetch('/api/intermediaries'),
    ]);

    if (agenciesRes.ok) setAgencies(await agenciesRes.json());
    if (usersRes.ok) setUsers(await usersRes.json());

    if (venuesRes.ok) {
      setVenues(await venuesRes.json());
    } else {
      const payload = await venuesRes.json().catch(() => null);
      setVenues([]);
      setVenueError(payload?.message ?? `会場一覧の取得に失敗しました。(${venuesRes.status})`);
    }

    if (eventsRes.ok) setEvents(await eventsRes.json());
    if (intermediariesRes.ok) setIntermediaries(await intermediariesRes.json());
  };

  const refreshSummary = async (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const response = await fetch(`/api/sales/summary?year=${year}&month=${month}`);
    if (response.ok) {
      setSummary(await response.json());
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    refreshSummary(currentMonth);
  }, [currentMonth]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  const handleCreateAgency = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAgencyMessage(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/agencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        password: formData.get('password'),
      }),
    });

    if (response.ok) {
      setAgencyMessage('代理店を作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const payload = await response.json().catch(() => null);
    if (payload?.error === 'validation') {
      const details = Array.isArray(payload.details)
        ? payload.details.map((detail: { field: string; message: string }) => `${detail.field}: ${detail.message}`)
        : ['入力内容を確認してください。'];
      setAgencyMessage(`代理店の作成に失敗しました。\n${details.join('\n')}`);
      return;
    }
    setAgencyMessage(payload?.message ?? '代理店の作成に失敗しました。');
  };

  const handleUpdateAgency = async (agencyId: string, payload: { email: string | null; shopName: string | null; password?: string }) => {
    setAgencyMessage(null);

    const response = await fetch(`/api/agencies/${agencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      setAgencyMessage('代理店情報を更新しました。');
      refresh();
      return;
    }
    const resPayload = await response.json().catch(() => null);
    setAgencyMessage(resPayload?.message ?? `代理店情報の更新に失敗しました。(${response.status})`);
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUserMessage(null);

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
      setUserMessage(`ユーザーを作成しました。仮パスワード: ${payload.tempPassword}`);
      event.currentTarget.reset();
      refresh();
      return;
    }
    const payload = await response.json().catch(() => null);
    setUserMessage(payload?.message ?? `ユーザー作成に失敗しました。(${response.status})`);
  };

  const handleUploadVenueAttachment = async (venueId: string, file: File) => {
    setVenueMessage(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'VENUE');
    formData.append('entityId', venueId);

    const response = await fetch('/api/attachments/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setVenueMessage(payload?.message ?? `添付ファイルのアップロードに失敗しました。(${response.status})`);
      return null;
    }

    const payload = await response.json();
    const attachmentUrl = payload.blobUrl ?? payload.driveWebViewLink ?? null;
    if (!attachmentUrl) {
      setVenueMessage('アップロードは成功しましたが、URLの取得に失敗しました。');
      return null;
    }

    const patchRes = await fetch(`/api/venues/${venueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachmentUrl }),
    });

    if (!patchRes.ok) {
      const patchPayload = await patchRes.json().catch(() => null);
      setVenueMessage(patchPayload?.message ?? `会場へのURL反映に失敗しました。(${patchRes.status})`);
      return null;
    }

    setVenueMessage('添付ファイルを更新しました。');
    refresh();
    return attachmentUrl;
  };

  const handleCreateVenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setVenueMessage(null);

    const formData = new FormData(event.currentTarget);

    const attachmentFile = formData.get('venueAttachmentFile');

    // 1) まず会場を作成（attachmentUrl はここでは入れない）
    const createRes = await fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('venueName'),
        address: formData.get('venueAddress'),
        note: formData.get('note'),
        cashHandling: formData.get('cashHandling') || null,
        notes: formData.get('notes'),
        hours: formData.get('hours'),
        workWindow: formData.get('workWindow'),
        loadInTime: formData.get('loadInTime'),
        loadOutTime: formData.get('loadOutTime'),
      }),
    });

    if (!createRes.ok) {
      const payload = await createRes.json().catch(() => null);
      setVenueMessage(payload?.message ?? `会場の作成に失敗しました。(${createRes.status})`);
      return;
    }

    const venue = await createRes.json();
    setVenueMessage('会場を作成しました。');

    // 2) 添付ファイルがあればアップロードして会場に反映
    if (attachmentFile instanceof File && attachmentFile.size > 0) {
      await handleUploadVenueAttachment(venue.id, attachmentFile);
    }

    event.currentTarget.reset();
    refresh();
  };

  const handleCreateEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEventMessage(null);

    const formData = new FormData(event.currentTarget);
    const response = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: formData.get('startDate'),
        endDate: formData.get('endDate'),
        agencyId: formData.get('eventAgency'),
        venueId: formData.get('eventVenue'),
        intermediaryId: formData.get('eventIntermediary') || null,
        cashHandling: formData.get('eventCashHandling') || null,
        reportDeadline: formData.get('reportDeadline') || null,
      }),
    });

    if (response.ok) {
      setEventMessage('イベントを作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const payload = await response.json().catch(() => null);
    setEventMessage(payload?.message ?? `イベントの作成に失敗しました。(${response.status})`);
  };

  const handleCreateIntermediary = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIntermediaryMessage(null);

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
      setIntermediaryMessage('仲介業者を作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const payload = await response.json().catch(() => null);
    setIntermediaryMessage(payload?.message ?? `仲介業者の作成に失敗しました。(${response.status})`);
  };

  const handleUpdateIntermediary = async (intermediaryId: string, payload: { name: string; reportFormUrl: string | null }) => {
    setIntermediaryMessage(null);

    const response = await fetch(`/api/intermediaries/${intermediaryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setIntermediaryMessage('仲介業者を更新しました。');
      refresh();
      return;
    }

    const resPayload = await response.json().catch(() => null);
    setIntermediaryMessage(resPayload?.message ?? `仲介業者の更新に失敗しました。(${response.status})`);
  };

  const handleDeleteIntermediary = async (intermediaryId: string) => {
    setIntermediaryMessage(null);

    const response = await fetch(`/api/intermediaries/${intermediaryId}`, { method: 'DELETE' });
    if (response.ok) {
      setIntermediaryMessage('仲介業者を削除しました。');
      refresh();
      return;
    }

    const payload = await response.json().catch(() => null);
    setIntermediaryMessage(payload?.message ?? `仲介業者の削除に失敗しました。(${response.status})`);
  };

  const monthLabel = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const dayCells = Array.from({ length: startWeekday + daysInMonth }, (_, index) => {
    if (index < startWeekday) return null;
    return index - startWeekday + 1;
  });

  const monthlyEvents = events.filter((eventItem) => {
    const start = new Date(eventItem.startDate);
    const end = new Date(eventItem.endDate);
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return end >= monthStart && start <= monthEnd;
  });

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div className="text-slate-200 font-semibold">管理ダッシュボード</div>
        <button className="bg-slate-800 text-slate-200" type="button" onClick={handleLogout}>
          ログアウト
        </button>
      </div>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">代理店管理</h2>
          <Notice message={agencyMessage} />
          <form onSubmit={handleCreateAgency} className="space-y-3">
            <div>
              <label htmlFor="agency-name">代理店名</label>
              <input id="agency-name" name="name" required />
            </div>
            <div>
              <label htmlFor="agency-email">メール</label>
              <input id="agency-email" name="email" type="email" required />
            </div>
            <div>
              <label htmlFor="agency-password">初期パスワード (任意)</label>
              <input id="agency-password" name="password" type="password" placeholder="未入力なら initpass" />
            </div>
            <button className="bg-indigo-500 text-white">作成</button>
          </form>

          <ul className="space-y-3 text-sm text-slate-300">
            {agencies.map((agency) => (
              <li key={agency.id} className="border border-slate-800 rounded p-3 space-y-2">
                <div className="font-medium">{agency.name}</div>
                <div className="text-xs text-slate-400">メール: {agency.email ?? '未登録'}</div>
                <div className="text-xs text-slate-400">屋号: {agency.shopName ?? '未登録'}</div>
                <div className="text-xs text-slate-400">ステータス: {agency.isActive ? '有効' : '停止'}</div>
                <div className="text-xs text-slate-400">作成日: {agency.createdAt?.slice(0, 10)}</div>

                <form
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    const fd = new FormData(submitEvent.currentTarget);
                    handleUpdateAgency(agency.id, {
                      email: (fd.get('email')?.toString() || null) as string | null,
                      shopName: (fd.get('shopName')?.toString() || null) as string | null,
                      password: fd.get('password')?.toString() || undefined,
                    });
                  }}
                  className="grid gap-2"
                >
                  <input name="email" defaultValue={agency.email ?? ''} placeholder="email" />
                  <input name="shopName" defaultValue={agency.shopName ?? ''} placeholder="屋号" />
                  <input name="password" type="password" placeholder="パスワード変更" />
                  <button className="bg-slate-700 text-white" type="submit">
                    更新
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">ユーザー管理</h2>
          <Notice message={userMessage} />
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

          <ul className="space-y-1 text-sm text-slate-300">
            {users.map((u) => (
              <li key={u.id}>
                {u.email} ({u.role})
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">仲介業者管理</h2>
          <Notice message={intermediaryMessage} />
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

          <ul className="space-y-3 text-sm text-slate-200">
            {intermediaries.map((intermediary) => (
              <li key={intermediary.id} className="space-y-2 border border-slate-800 rounded p-3">
                <div className="font-medium">{intermediary.name}</div>
                <div className="text-xs text-slate-400 break-all">
                  {intermediary.reportFormUrl ?? '報告フォームURLなし'}
                </div>

                <form
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    const fd = new FormData(submitEvent.currentTarget);
                    handleUpdateIntermediary(intermediary.id, {
                      name: fd.get('name')?.toString() ?? intermediary.name,
                      reportFormUrl: (fd.get('reportFormUrl')?.toString() || null) as string | null,
                    });
                  }}
                  className="grid gap-2"
                >
                  <input name="name" defaultValue={intermediary.name} />
                  <input name="reportFormUrl" defaultValue={intermediary.reportFormUrl ?? ''} placeholder="https://" />
                  <div className="flex gap-2">
                    <button className="bg-slate-700 text-white" type="submit">
                      更新
                    </button>
                    <button className="bg-rose-500/80 text-white" type="button" onClick={() => handleDeleteIntermediary(intermediary.id)}>
                      削除
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">会場管理</h2>
          <Notice message={venueMessage} />
          <ErrorNotice message={venueError} />

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
              <label htmlFor="venue-note">会場メモ</label>
              <textarea id="venue-note" name="note" rows={2} />
            </div>

            <div>
              <label htmlFor="venue-attachment-file">資料（アップロード / 任意）</label>
              <input id="venue-attachment-file" name="venueAttachmentFile" type="file" />
              <div className="text-xs text-slate-500 mt-1">
                ※作成後に自動でアップロードし、会場に紐づけます
              </div>
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

            <button className="bg-indigo-500 text-white">作成</button>
          </form>

          <ul className="space-y-3 text-sm text-slate-300">
            {venues.map((venue) => (
              <li key={venue.id} className="border border-slate-800 rounded p-3 space-y-2">
                <div>
                  {venue.name} (
                  {venue.cashHandling === 'HOLD' ? '預かり' : venue.cashHandling === 'TAKE_HOME' ? '持ち帰り' : '未設定'})
                </div>

                {venue.attachmentUrl ? (
                  <a className="text-xs text-indigo-300" href={venue.attachmentUrl} target="_blank" rel="noreferrer">
                    添付ファイルを開く
                  </a>
                ) : (
                  <div className="text-xs text-slate-500">添付ファイルなし</div>
                )}

                <form
                  onSubmit={(submitEvent) => {
                    submitEvent.preventDefault();
                    const fd = new FormData(submitEvent.currentTarget);
                    const file = fd.get('file');
                    if (file instanceof File && file.size > 0) {
                      handleUploadVenueAttachment(venue.id, file);
                      submitEvent.currentTarget.reset();
                    }
                  }}
                  className="space-y-2"
                >
                  <input name="file" type="file" />
                  <button className="bg-slate-700 text-white" type="submit">
                    添付をアップロード
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <h2 className="text-lg font-semibold">スケジュール/イベント</h2>
          <Notice message={eventMessage} />

          <form onSubmit={handleCreateEvent} className="space-y-3">
            <div>
              <label htmlFor="event-agency">代理店</label>
              <select id="event-agency" name="eventAgency" required>
                <option value="">選択してください</option>
                {agencies.map((agency) => (
                  <option key={agency.id} value={agency.id}>
                    {agency.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="event-venue">会場</label>
              <select id="event-venue" name="eventVenue" required>
                <option value="">選択してください</option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
              {venues.length === 0 ? (
                <div className="text-xs text-rose-200 mt-1">
                  会場が0件です（会場作成済みなのに出ない場合は、会場一覧取得エラー or tenant不一致の可能性）
                </div>
              ) : null}
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
              <label htmlFor="event-cash">売上金預かり</label>
              <select id="event-cash" name="eventCashHandling">
                <option value="">会場設定に従う</option>
                {cashHandlingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="event-report">報告締切 (HH:mm)</label>
              <input id="event-report" name="reportDeadline" list="time-options" placeholder="21:00" />
            </div>

            <button className="bg-indigo-500 text-white">作成</button>
          </form>

          <ul className="space-y-3 text-sm text-slate-300">
            {events.map((eventItem) => (
              <li key={eventItem.id} className="border border-slate-800 rounded p-3 space-y-1">
                <div className="font-medium">{eventItem.title}</div>
                <div className="text-xs text-slate-400">
                  {eventItem.startDate}〜{eventItem.endDate}
                </div>
                <div className="text-xs text-slate-400">仲介業者: {eventItem.intermediaryName ?? '未設定'}</div>
                <div className="text-xs text-slate-400">共有メモ: {eventItem.memo ? 'あり' : 'なし'}</div>
                <a className="text-xs text-indigo-300" href={`/admin/events/${eventItem.id}`}>
                  編集画面へ
                </a>
              </li>
            ))}
          </ul>
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
            {dayCells.map((day, index) => (
              <div key={`${day ?? 'blank'}-${index}`} className="min-h-[32px] text-center text-slate-300">
                {day ?? ''}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {monthlyEvents.map((eventItem) => {
              const start = new Date(eventItem.startDate);
              const end = new Date(eventItem.endDate);
              const startIndex = Math.max(1, start < monthStart ? 1 : start.getDate());
              const endIndex = Math.min(daysInMonth, end.getDate());
              return (
                <div
                  key={eventItem.id}
                  className="grid items-center"
                  style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(0, 1fr))` }}
                >
                  <a
                    href={`/admin/events/${eventItem.id}`}
                    className={`${getAgencyColor(eventItem.agencyId)} text-xs text-white rounded px-2 py-1 text-center truncate`}
                    style={{ gridColumn: `${startIndex} / ${endIndex + 1}` }}
                  >
                    {eventItem.title}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
        <h2 className="text-lg font-semibold mb-4">売上集計</h2>
        <div className="text-sm text-slate-400 mb-2">
          平均売上は「当月の売上合計 / 売上入力件数」で算出しています。
        </div>
        <div className="text-sm text-slate-300 mb-4">
          総合平均売上: {summary?.overallAverage?.toLocaleString() ?? '0'}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button
            className="bg-slate-800 text-slate-200"
            type="button"
            onClick={() => {
              const previous = new Date(currentMonth);
              previous.setMonth(previous.getMonth() - 1);
              setCurrentMonth(previous);
            }}
          >
            前月
          </button>
          <span className="text-sm text-slate-300">{monthLabel}</span>
          <button
            className="bg-slate-800 text-slate-200"
            type="button"
            onClick={() => {
              const next = new Date(currentMonth);
              next.setMonth(next.getMonth() + 1);
              setCurrentMonth(next);
            }}
          >
            次月
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm text-slate-300">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2">代理店名</th>
                <th className="py-2">月間合計売上</th>
                <th className="py-2">平均売上 (会場別)</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((agency) => {
                const total = summary?.agencyTotals?.[agency.id] ?? 0;
                return (
                  <tr key={agency.id} className="border-t border-slate-800">
                    <td className="py-2">{agency.name}</td>
                    <td className="py-2">{total.toLocaleString()}</td>
                    <td className="py-2">
                      {venues.map((venue) => {
                        const average = summary?.venueAverages?.[venue.id];
                        return average !== undefined ? (
                          <div key={venue.id} className="text-xs text-slate-400">
                            {venue.name}: {average.toLocaleString()}
                          </div>
                        ) : null;
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <datalist id="time-options">
        {timeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
