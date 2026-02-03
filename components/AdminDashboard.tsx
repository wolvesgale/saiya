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

type Venue = { id: string; name: string; address: string | null; cashHandling: string | null; attachmentUrl: string | null };

type Attachment = { id: string; filename: string; url: string | null; createdAt: string };

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

type VenueDailyItem = {
  venueId: string;
  venueName: string;
  total: number;
  count: number;
  average: number;
};

type SectionKey = 'agency' | 'user' | 'intermediary' | 'venue' | 'event' | 'global';
type TabKey = 'events' | 'venues' | 'agencies' | 'intermediaries' | 'users' | 'reports';

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
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryItem[]>([]);
  const [venueDailySummary, setVenueDailySummary] = useState<VenueDailyItem[]>([]);
  const [venueAttachments, setVenueAttachments] = useState<Record<string, Attachment[]>>({});
  const [venueAttachmentLoading, setVenueAttachmentLoading] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<SectionKey, string | null>>({
    agency: null,
    user: null,
    intermediary: null,
    venue: null,
    event: null,
    global: null,
  });
  const [activeTab, setActiveTab] = useState<TabKey>('events');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [venueFrom, setVenueFrom] = useState<string>('');
  const [venueTo, setVenueTo] = useState<string>('');
  const [agencyQuery, setAgencyQuery] = useState('');
  const [agencySort, setAgencySort] = useState<'name-asc' | 'name-desc' | 'created-desc' | 'created-asc'>('name-asc');
  const [userQuery, setUserQuery] = useState('');
  const [venueQuery, setVenueQuery] = useState('');
  const [eventQuery, setEventQuery] = useState('');
  const [intermediaryQuery, setIntermediaryQuery] = useState('');

  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);

  const getMonthDateRange = (date: Date) => {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { start, end };
  };

  const timeOptions = useMemo(() => {
    const options: string[] = [];
    for (let hour = 7; hour <= 23; hour += 1) {
      for (let minutes = 0; minutes < 60; minutes += 15) {
        options.push(`${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`);
      }
    }
    return options;
  }, []);

  const setSectionMessage = (section: SectionKey, text: string | null) => {
    setMessages((prev) => ({ ...prev, [section]: text }));
  };

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

  const loadVenueAttachments = async (venueId: string) => {
    setVenueAttachmentLoading((prev) => ({ ...prev, [venueId]: true }));
    try {
      const response = await fetch(`/api/attachments?entityType=VENUE&entityId=${venueId}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSectionMessage('venue', body?.message ?? '添付ファイルの取得に失敗しました。');
        return;
      }
      const data = await response.json();
      setVenueAttachments((prev) => ({ ...prev, [venueId]: data }));
    } finally {
      setVenueAttachmentLoading((prev) => ({ ...prev, [venueId]: false }));
    }
  };

  const refreshSummary = async (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const [summaryResponse, weeklyResponse] = await Promise.all([
      fetch(`/api/sales/summary?year=${year}&month=${month}`),
      fetch(`/api/sales/summary/weekly?year=${year}&month=${month}`),
    ]);
    if (summaryResponse.ok) {
      setSummary(await summaryResponse.json());
    }
    if (weeklyResponse.ok) {
      const payload = await weeklyResponse.json();
      setWeeklySummary(payload.items ?? []);
    }
  };

  const refreshVenueDailySummary = async (from: string, to: string) => {
    if (!from || !to) return;
    const response = await fetch(`/api/sales/summary/venue-daily?from=${from}&to=${to}`);
    if (response.ok) {
      const payload = await response.json();
      setVenueDailySummary(payload.items ?? []);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (activeTab !== 'venues' || venues.length === 0) return;
    Promise.all(venues.map((venue) => loadVenueAttachments(venue.id))).catch(() => null);
  }, [activeTab, venues]);

  useEffect(() => {
    refreshSummary(currentMonth);
    const { start, end } = getMonthDateRange(currentMonth);
    setVenueFrom(formatDateInput(start));
    setVenueTo(formatDateInput(end));
  }, [currentMonth]);

  useEffect(() => {
    if (venueFrom && venueTo) {
      refreshVenueDailySummary(venueFrom, venueTo);
    }
  }, [venueFrom, venueTo]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    window.location.href = '/login';
  };

  const Banner = ({ section }: { section: SectionKey }) => {
    const msg = messages[section];
    if (!msg) return null;
    const isError = msg.toLowerCase().includes('failed') || msg.toLowerCase().includes('error') || msg.includes('失敗') || msg.includes('required');
    return (
      <div className={`mb-3 border px-4 py-2 rounded whitespace-pre-wrap ${isError ? 'bg-rose-500/10 border-rose-500/30 text-rose-200' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'}`}>
        {msg}
      </div>
    );
  };

  const handleCreateAgency = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSectionMessage('agency', null);

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
      setSectionMessage('agency', '代理店を作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const payload = await response.json().catch(() => null);
    if (payload?.error === 'validation') {
      const details = Array.isArray(payload.details)
        ? payload.details.map((detail: { field: string; message: string }) => `${detail.field}: ${detail.message}`)
        : ['入力内容を確認してください。'];
      setSectionMessage('agency', `代理店の作成に失敗しました。\n${details.join('\n')}`);
      return;
    }
    setSectionMessage('agency', payload?.message ?? '代理店の作成に失敗しました。');
  };

  const handleUpdateAgency = async (agencyId: string, payload: { email: string | null; shopName: string | null; password?: string }) => {
    setSectionMessage('agency', null);

    const response = await fetch(`/api/agencies/${agencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setSectionMessage('agency', '代理店情報を更新しました。');
      refresh();
      return;
    }
    const body = await response.json().catch(() => null);
    setSectionMessage('agency', body?.message ?? '代理店情報の更新に失敗しました。');
  };

  const handleCreateUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSectionMessage('user', null);

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
      setSectionMessage('user', `ユーザーを作成しました。仮パスワード: ${payload.tempPassword}`);
      event.currentTarget.reset();
      refresh();
      return;
    }
    const body = await response.json().catch(() => null);
    setSectionMessage('user', body?.message ?? 'ユーザーの作成に失敗しました。');
  };

  const handleUploadVenueAttachments = async (venueId: string, files: File[]) => {
    if (!files.length) return;
    setSectionMessage('venue', null);

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', 'VENUE');
      formData.append('entityId', venueId);

      const response = await fetch('/api/attachments/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setSectionMessage('venue', body?.message ?? '添付ファイルのアップロードに失敗しました。');
        return;
      }
    }

    setSectionMessage('venue', '添付ファイルを追加しました。');
    await loadVenueAttachments(venueId);
  };

  const handleCreateVenue = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSectionMessage('venue', null);

    const formData = new FormData(event.currentTarget);
    const files = formData
      .getAll('venueFile')
      .filter((item): item is File => item instanceof File && item.size > 0);

    const response = await fetch('/api/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('venueName'),
        address: formData.get('venueAddress'),
        note: formData.get('note'),
        // attachmentUrl は「URL入力」ではなくアップロードで埋める運用にする
        cashHandling: formData.get('cashHandling') || null,
        notes: formData.get('notes'),
        hours: formData.get('hours'),
        workWindow: formData.get('workWindow'),
        loadInTime: formData.get('loadInTime'),
        loadOutTime: formData.get('loadOutTime'),
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setSectionMessage('venue', body?.message ?? '会場の作成に失敗しました。');
      return;
    }

    const createdVenue = await response.json().catch(() => null);
    setSectionMessage('venue', '会場を作成しました。');

    // 作成後にファイルがあれば自動アップロードして紐付け
    if (createdVenue?.id && files.length > 0) {
      await handleUploadVenueAttachments(createdVenue.id, files);
    }

    event.currentTarget.reset();
    refresh();
  };

  const handleCreateEvent = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSectionMessage('event', null);

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
      setSectionMessage('event', 'イベントを作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const body = await response.json().catch(() => null);
    setSectionMessage('event', body?.message ?? 'イベントの作成に失敗しました。');
  };

  const handleCreateIntermediary = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSectionMessage('intermediary', null);

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
      setSectionMessage('intermediary', '仲介業者を作成しました。');
      event.currentTarget.reset();
      refresh();
      return;
    }

    const body = await response.json().catch(() => null);
    setSectionMessage('intermediary', body?.message ?? '仲介業者の作成に失敗しました。');
  };

  const handleDeleteAttachment = async (venueId: string, attachmentId: string) => {
    const response = await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setSectionMessage('venue', body?.message ?? '添付ファイルの削除に失敗しました。');
      return;
    }
    setSectionMessage('venue', '添付ファイルを削除しました。');
    await loadVenueAttachments(venueId);
  };

  const handleUpdateIntermediary = async (intermediaryId: string, payload: { name: string; reportFormUrl: string | null }) => {
    setSectionMessage('intermediary', null);

    const response = await fetch(`/api/intermediaries/${intermediaryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      setSectionMessage('intermediary', '仲介業者を更新しました。');
      refresh();
      return;
    }

    const body = await response.json().catch(() => null);
    setSectionMessage('intermediary', body?.message ?? '仲介業者の更新に失敗しました。');
  };

  const handleDeleteIntermediary = async (intermediaryId: string) => {
    setSectionMessage('intermediary', null);

    const response = await fetch(`/api/intermediaries/${intermediaryId}`, { method: 'DELETE' });
    if (response.ok) {
      setSectionMessage('intermediary', '仲介業者を削除しました。');
      refresh();
      return;
    }

    const body = await response.json().catch(() => null);
    setSectionMessage('intermediary', body?.message ?? '仲介業者の削除に失敗しました。');
  };

  const monthLabel = `${currentMonth.getFullYear()}年${currentMonth.getMonth() + 1}月`;
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const dayCells = Array.from({ length: startWeekday + daysInMonth }, (_, index) => {
    if (index < startWeekday) return null;
    return index - startWeekday + 1;
  });

  const filteredAgencies = useMemo(() => {
    const query = agencyQuery.trim().toLowerCase();
    const results = agencies.filter((agency) => {
      if (!query) return true;
      return [agency.name, agency.email ?? '', agency.shopName ?? ''].some((value) => value.toLowerCase().includes(query));
    });
    const sorted = [...results];
    sorted.sort((a, b) => {
      switch (agencySort) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'created-desc':
          return b.createdAt.localeCompare(a.createdAt);
        case 'created-asc':
          return a.createdAt.localeCompare(b.createdAt);
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [agencies, agencyQuery, agencySort]);

  const filteredUsers = useMemo(() => {
    const query = userQuery.trim().toLowerCase();
    return users.filter((user) => {
      if (!query) return true;
      return user.email.toLowerCase().includes(query) || user.role.toLowerCase().includes(query);
    });
  }, [users, userQuery]);

  const filteredVenues = useMemo(() => {
    const query = venueQuery.trim().toLowerCase();
    return venues.filter((venue) => {
      if (!query) return true;
      return [venue.name, venue.address ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }, [venues, venueQuery]);

  const filteredEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    return events.filter((eventItem) => {
      if (!query) return true;
      return [eventItem.title, eventItem.intermediaryName ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }, [events, eventQuery]);

  const filteredIntermediaries = useMemo(() => {
    const query = intermediaryQuery.trim().toLowerCase();
    return intermediaries.filter((intermediary) => {
      if (!query) return true;
      return [intermediary.name, intermediary.reportFormUrl ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  }, [intermediaries, intermediaryQuery]);

  const monthlyEvents = events.filter((eventItem) => {
    const start = new Date(eventItem.startDate);
    const end = new Date(eventItem.endDate);
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return end >= monthStart && start <= monthEnd;
  });

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const tabs: { key: TabKey; label: string; description: string }[] = [
    { key: 'events', label: 'イベント', description: 'スケジュールとカレンダー' },
    { key: 'venues', label: '会場', description: '会場と添付資料' },
    { key: 'agencies', label: '代理店', description: '代理店一覧と設定' },
    { key: 'intermediaries', label: '仲介', description: '仲介業者の管理' },
    { key: 'users', label: 'ユーザー', description: '管理ユーザー設定' },
    { key: 'reports', label: '売上レポート', description: '集計と平均' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-full text-sm border transition ${
                activeTab === tab.key
                  ? 'bg-indigo-500/20 border-indigo-400 text-indigo-100'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button className="bg-slate-800 text-slate-200" type="button" onClick={handleLogout}>
          ログアウト
        </button>
      </div>

      <div className="text-xs text-slate-400">
        {tabs.find((tab) => tab.key === activeTab)?.description ?? ''}
      </div>

      {activeTab === 'agencies' ? (
        <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">代理店管理</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>
                {filteredAgencies.length}件 / 全{agencies.length}件
              </span>
              <input
                className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100"
                placeholder="代理店検索"
                value={agencyQuery}
                onChange={(event) => setAgencyQuery(event.target.value)}
              />
              <select
                className="bg-slate-950/40 border border-slate-700 rounded px-2 py-1 text-slate-100"
                value={agencySort}
                onChange={(event) => setAgencySort(event.target.value as typeof agencySort)}
              >
                <option value="name-asc">名前昇順</option>
                <option value="name-desc">名前降順</option>
                <option value="created-desc">作成日（新しい順）</option>
                <option value="created-asc">作成日（古い順）</option>
              </select>
            </div>
          </div>
          <Banner section="agency" />
          <form onSubmit={handleCreateAgency} className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-1">
              <label htmlFor="agency-name">代理店名</label>
              <input id="agency-name" name="name" required />
            </div>
            <div className="md:col-span-1">
              <label htmlFor="agency-email">メール</label>
              <input id="agency-email" name="email" type="email" required />
            </div>
            <div className="md:col-span-1">
              <label htmlFor="agency-password">初期パスワード (任意)</label>
              <input id="agency-password" name="password" type="password" placeholder="未入力なら initpass" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-indigo-500 text-white">作成</button>
            </div>
          </form>

          <ul className="space-y-3 text-sm text-slate-300">
            {filteredAgencies.map((agency) => (
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
        </section>
      ) : null}

      {activeTab === 'users' ? (
        <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">ユーザー管理</h2>
            <input
              className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100 text-xs"
              placeholder="ユーザー検索"
              value={userQuery}
              onChange={(event) => setUserQuery(event.target.value)}
            />
          </div>
          <Banner section="user" />
          <form onSubmit={handleCreateUser} className="grid gap-3 md:grid-cols-3">
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
            <div className="md:col-span-3">
              <button className="bg-indigo-500 text-white">作成</button>
            </div>
          </form>

          <ul className="space-y-1 text-sm text-slate-300">
            {filteredUsers.map((user) => (
              <li key={user.id}>
                {user.email} ({user.role})
              </li>
            ))}
            {!filteredUsers.length ? <li className="text-xs text-slate-500">該当ユーザーがありません。</li> : null}
          </ul>
        </section>
      ) : null}

      {activeTab === 'intermediaries' ? (
        <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">仲介業者管理</h2>
            <input
              className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100 text-xs"
              placeholder="仲介検索"
              value={intermediaryQuery}
              onChange={(event) => setIntermediaryQuery(event.target.value)}
            />
          </div>
          <Banner section="intermediary" />
          <form onSubmit={handleCreateIntermediary} className="grid gap-3 md:grid-cols-3">
            <div>
              <label htmlFor="intermediary-name">業者名</label>
              <input id="intermediary-name" name="intermediaryName" required />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="report-form-url">報告フォームURL (任意)</label>
              <input id="report-form-url" name="reportFormUrl" type="url" placeholder="https://" />
            </div>
            <div className="md:col-span-3">
              <button className="bg-indigo-500 text-white">作成</button>
            </div>
          </form>

          <ul className="space-y-3 text-sm text-slate-200">
            {filteredIntermediaries.map((intermediary) => (
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
            {!filteredIntermediaries.length ? <li className="text-xs text-slate-500">該当業者がありません。</li> : null}
          </ul>
        </section>
      ) : null}

      {activeTab === 'venues' ? (
        <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">会場管理</h2>
            <input
              className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100 text-xs"
              placeholder="会場検索"
              value={venueQuery}
              onChange={(event) => setVenueQuery(event.target.value)}
            />
          </div>
          <Banner section="venue" />

          <form onSubmit={handleCreateVenue} className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="venue-name">会場名</label>
              <input id="venue-name" name="venueName" required />
            </div>
            <div>
              <label htmlFor="venue-address">住所</label>
              <input id="venue-address" name="venueAddress" />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="venue-note">会場メモ</label>
              <textarea id="venue-note" name="note" rows={2} />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="venue-file">資料（アップロード / 任意）</label>
              <input id="venue-file" name="venueFile" type="file" multiple />
              <div className="text-xs text-slate-500 mt-1">※作成後に自動アップロードし、会場に紐づけます（複数可）</div>
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
            <div className="md:col-span-2">
              <label htmlFor="venue-notes">注意事項</label>
              <textarea id="venue-notes" name="notes" rows={2} />
            </div>
            <div className="md:col-span-2">
              <button className="bg-indigo-500 text-white">作成</button>
            </div>
          </form>

          <ul className="space-y-3 text-sm text-slate-300">
            {filteredVenues.map((venue) => (
              <li key={venue.id} className="border border-slate-800 rounded p-3 space-y-2">
                <div>
                  {venue.name} (
                  {venue.cashHandling === 'HOLD' ? '預かり' : venue.cashHandling === 'TAKE_HOME' ? '持ち帰り' : '未設定'})
                </div>

                {venueAttachmentLoading[venue.id] ? (
                  <div className="text-xs text-slate-500">添付ファイルを読み込み中...</div>
                ) : venueAttachments[venue.id]?.length ? (
                  <ul className="space-y-1 text-xs text-slate-300">
                    {venueAttachments[venue.id].map((attachment) => (
                      <li key={attachment.id} className="flex flex-wrap items-center gap-2">
                        {attachment.url ? (
                          <a className="text-indigo-300 underline" href={attachment.url} target="_blank" rel="noreferrer">
                            {attachment.filename}
                          </a>
                        ) : (
                          <span>{attachment.filename}</span>
                        )}
                        <button
                          type="button"
                          className="text-rose-300 underline"
                          onClick={() => handleDeleteAttachment(venue.id, attachment.id)}
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">添付ファイルなし</div>
                )}

                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-slate-300">添付を追加</summary>
                  <form
                    onSubmit={(submitEvent) => {
                      submitEvent.preventDefault();
                      const fd = new FormData(submitEvent.currentTarget);
                      const files = fd.getAll('file').filter((item): item is File => item instanceof File && item.size > 0);
                      if (files.length > 0) {
                        handleUploadVenueAttachments(venue.id, files);
                        submitEvent.currentTarget.reset();
                      }
                    }}
                    className="space-y-2 mt-2"
                  >
                    <input name="file" type="file" multiple />
                    <button className="bg-slate-700 text-white" type="submit">
                      添付をアップロード
                    </button>
                  </form>
                </details>
              </li>
            ))}
            {!filteredVenues.length ? <li className="text-xs text-slate-500">該当会場がありません。</li> : null}
          </ul>
        </section>
      ) : null}

      {activeTab === 'events' ? (
        <section className="grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">スケジュール/イベント</h2>
              <input
                className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100 text-xs"
                placeholder="イベント検索"
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
              />
            </div>
            <Banner section="event" />
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
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="event-start">開始日</label>
                  <input id="event-start" name="startDate" type="date" required />
                </div>
                <div>
                  <label htmlFor="event-end">終了日</label>
                  <input id="event-end" name="endDate" type="date" required />
                </div>
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
              {filteredEvents.map((eventItem) => (
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
              {!filteredEvents.length ? <li className="text-xs text-slate-500">該当イベントがありません。</li> : null}
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
      ) : null}

      {activeTab === 'reports' ? (
        <div className="space-y-6">
          <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">売上集計</h2>
            <div className="text-sm text-slate-400 mb-2">平均売上は「当月の売上合計 / 売上入力件数」で算出しています。</div>
            <div className="text-sm text-slate-300 mb-4">総合平均売上: {summary?.overallAverage?.toLocaleString() ?? '0'}</div>

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

          <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">代理店別 週次売上（当月）</h2>
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
          </section>

          <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">会場別 日次平均売上</h2>
            <div className="flex flex-wrap items-end gap-3 mb-4 text-sm text-slate-300">
              <label className="flex flex-col gap-1">
                期間（開始）
                <input
                  className="bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  type="date"
                  value={venueFrom}
                  onChange={(event) => setVenueFrom(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                期間（終了）
                <input
                  className="bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  type="date"
                  value={venueTo}
                  onChange={(event) => setVenueTo(event.target.value)}
                />
              </label>
              <button
                className="bg-slate-800 text-slate-200 px-4 py-2 rounded"
                type="button"
                onClick={() => refreshVenueDailySummary(venueFrom, venueTo)}
              >
                更新
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm text-slate-300">
                <thead>
                  <tr className="text-left text-slate-400">
                    <th className="py-2">会場</th>
                    <th className="py-2">合計</th>
                    <th className="py-2">件数</th>
                    <th className="py-2">日次平均</th>
                  </tr>
                </thead>
                <tbody>
                  {venueDailySummary.map((item) => (
                    <tr key={item.venueId} className="border-t border-slate-800">
                      <td className="py-2">{item.venueName}</td>
                      <td className="py-2">{item.total.toLocaleString()}</td>
                      <td className="py-2">{item.count.toLocaleString()}</td>
                      <td className="py-2">{item.average.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!venueDailySummary.length ? (
                    <tr className="border-t border-slate-800">
                      <td className="py-2 text-slate-400" colSpan={4}>
                        期間内の売上がありません。
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <datalist id="time-options">
        {timeOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
