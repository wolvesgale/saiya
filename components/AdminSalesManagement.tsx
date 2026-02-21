'use client';

import { useEffect, useMemo, useState } from 'react';

type SalesManageSale = {
  id: string;
  date: string;
  amount: number;
};

type SalesManageEvent = {
  id: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
  venueName: string | null;
  totalAmount: number;
  saleCount: number;
  sales: SalesManageSale[];
};

type SalesManageAgency = {
  id: string;
  name: string;
  totalAmount: number;
  saleCount: number;
  events: SalesManageEvent[];
};

type SalesManageResponse = {
  year: number;
  month: number;
  agencies: SalesManageAgency[];
};

type EditingSale = {
  id: string;
  amount: number;
  date: string;
  agencyName: string;
  eventTitle: string;
};

type AgencyOption = { id: string; name: string };
type EventOption = { id: string; title: string; agencyId: string; startDate: string; endDate: string };

const formatMonthValue = (year: number, month: number) => `${year}-${month.toString().padStart(2, '0')}`;

export default function AdminSalesManagement() {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [agencyFilter, setAgencyFilter] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState<SalesManageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [editingSale, setEditingSale] = useState<EditingSale | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editDate, setEditDate] = useState('');
  const [saving, setSaving] = useState(false);

  // 新規売上登録用
  const [allAgencies, setAllAgencies] = useState<AgencyOption[]>([]);
  const [allEvents, setAllEvents] = useState<EventOption[]>([]);
  const [newAgencyId, setNewAgencyId] = useState('');
  const [newEventId, setNewEventId] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newSaving, setNewSaving] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      });
      if (agencyFilter) params.set('agencyId', agencyFilter);

      const response = await fetch(`/api/sales/manage?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message ?? '売上データの取得に失敗しました。');
        return;
      }
      setData(payload);
      setExpandedAgencies(new Set());
      setExpandedEvents(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [year, month, agencyFilter]);

  useEffect(() => {
    Promise.all([fetch('/api/agencies'), fetch('/api/events')]).then(async ([agRes, evRes]) => {
      if (agRes.ok) setAllAgencies(await agRes.json());
      if (evRes.ok) setAllEvents(await evRes.json());
    });
  }, []);

  const agencies = data?.agencies ?? [];

  const filteredAgencies = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return agencies;

    return agencies
      .map((agency) => {
        const filteredEvents = agency.events.filter((eventItem) => {
          return [eventItem.title, eventItem.venueName ?? ''].some((value) => value.toLowerCase().includes(keyword));
        });
        return { ...agency, events: filteredEvents };
      })
      .filter((agency) => agency.events.length > 0);
  }, [agencies, query]);

  const toggleAgency = (agencyId: string) => {
    setExpandedAgencies((prev) => {
      const next = new Set(prev);
      if (next.has(agencyId)) {
        next.delete(agencyId);
      } else {
        next.add(agencyId);
      }
      return next;
    });
  };

  const toggleEvent = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const openEdit = (sale: SalesManageSale, agency: SalesManageAgency, eventItem: SalesManageEvent) => {
    setEditingSale({
      id: sale.id,
      amount: sale.amount,
      date: sale.date.slice(0, 10),
      agencyName: agency.name,
      eventTitle: eventItem.title,
    });
    setEditAmount(String(sale.amount));
    setEditDate(sale.date.slice(0, 10));
  };

  const closeEdit = () => {
    setEditingSale(null);
    setEditAmount('');
    setEditDate('');
    setSaving(false);
  };

  const handleSave = async () => {
    if (!editingSale) return;
    const amountValue = Number(editAmount);
    if (!Number.isFinite(amountValue)) {
      setMessage('売上額は数値で入力してください。');
      return;
    }
    setSaving(true);
    setMessage(null);

    const payload: { amount: number; date?: string } = { amount: amountValue };
    if (editDate) payload.date = editDate;

    const response = await fetch(`/api/sales/${editingSale.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const err = body?.message ?? '売上の更新に失敗しました。';
      setMessage(err);
      setSaving(false);
      return;
    }

    const updated = body as SalesManageSale;
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        agencies: prev.agencies.map((agency) => ({
          ...agency,
          events: agency.events.map((eventItem) => {
            const nextSales = eventItem.sales.map((sale) => (sale.id === updated.id ? updated : sale));
            const totalAmount = nextSales.reduce((sum, sale) => sum + sale.amount, 0);
            return {
              ...eventItem,
              sales: nextSales,
              totalAmount,
              saleCount: nextSales.length,
            };
          }),
          totalAmount: agency.events.reduce((sum, eventItem) => sum + eventItem.totalAmount, 0),
          saleCount: agency.events.reduce((sum, eventItem) => sum + eventItem.saleCount, 0),
        })),
      };
    });

    setMessage('売上を更新しました。');
    closeEdit();
  };

  const handleMonthChange = (value: string) => {
    if (!value) return;
    const [nextYear, nextMonth] = value.split('-').map((part) => Number(part));
    if (!Number.isFinite(nextYear) || !Number.isFinite(nextMonth)) return;
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const filteredNewEvents = useMemo(() => {
    if (!newAgencyId) return allEvents;
    return allEvents.filter((e) => e.agencyId === newAgencyId);
  }, [allEvents, newAgencyId]);

  const [syncing, setSyncing] = useState(false);

  const handleSyncSheets = async () => {
    setSyncing(true);
    setMessage(null);
    const response = await fetch('/api/admin/sync-sheets', { method: 'POST' });
    const body = await response.json().catch(() => null);
    setSyncing(false);
    if (!response.ok) {
      setMessage(body?.message ?? 'スプシの同期に失敗しました。');
      return;
    }
    setMessage(`スプレッドシートを更新しました（${body.records ?? 0}件）。`);
  };

  const handleNewSaleSubmit = async () => {
    if (!newEventId || !newDate || !newAmount) {
      setMessage('イベント・日付・金額は必須です。');
      return;
    }
    const amountValue = Number(newAmount);
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      setMessage('売上額は0以上の数値で入力してください。');
      return;
    }
    setNewSaving(true);
    setMessage(null);
    const response = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: newEventId, date: newDate, amount: amountValue }),
    });
    const body = await response.json().catch(() => null);
    setNewSaving(false);
    if (!response.ok) {
      setMessage(body?.message ?? '売上の登録に失敗しました。');
      return;
    }
    setMessage('売上を登録しました。');
    setNewEventId('');
    setNewDate('');
    setNewAmount('');
    setShowNewForm(false);
    fetchData();
  };

  return (
    <section className="bg-slate-900/70 border border-slate-800 p-6 rounded-lg space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">売上管理（編集）</h2>
          <p className="text-xs text-slate-400">代理店 → イベント → 日次売上の順に展開して確認します。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={handleSyncSheets}
            disabled={syncing}
            className="border border-emerald-600/60 px-3 py-1 rounded text-emerald-300 hover:text-emerald-100 disabled:opacity-50"
          >
            {syncing ? '同期中...' : 'スプシを更新'}
          </button>
          <label className="flex items-center gap-2">
            <span>年月</span>
            <input
              type="month"
              value={formatMonthValue(year, month)}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2">
            <span>代理店</span>
            <select
              value={agencyFilter}
              onChange={(event) => setAgencyFilter(event.target.value)}
              className="bg-slate-950/40 border border-slate-700 rounded px-2 py-1 text-slate-100"
            >
              <option value="">すべて</option>
              {agencies.map((agency) => (
                <option key={agency.id} value={agency.id}>
                  {agency.name}
                </option>
              ))}
            </select>
          </label>
          <input
            className="bg-slate-950/40 border border-slate-700 rounded px-3 py-1 text-slate-100"
            placeholder="イベント名 / 会場名検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {message ? (
        <div className="border px-4 py-2 rounded text-sm whitespace-pre-wrap bg-slate-800/70 border-slate-700 text-slate-100">
          {message}
        </div>
      ) : null}

      {/* 新規売上登録 */}
      <div className="border border-slate-700 rounded-lg p-4 bg-slate-950/30 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">新規売上登録</h3>
          <button
            type="button"
            onClick={() => setShowNewForm((prev) => !prev)}
            className="text-xs border border-slate-600 px-3 py-1 rounded text-slate-300 hover:text-white"
          >
            {showNewForm ? '閉じる' : '＋ 売上を登録'}
          </button>
        </div>

        {showNewForm ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-slate-300">
              代理店
              <select
                value={newAgencyId}
                onChange={(e) => { setNewAgencyId(e.target.value); setNewEventId(''); }}
                className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
              >
                <option value="">すべて</option>
                {allAgencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>{ag.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              イベント
              <select
                value={newEventId}
                onChange={(e) => setNewEventId(e.target.value)}
                className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
              >
                <option value="">選択してください</option>
                {filteredNewEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-slate-300">
              売上日付
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
              />
            </label>
            <label className="block text-xs text-slate-300">
              日次売上額
              <input
                type="number"
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100 text-sm"
              />
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <button
                type="button"
                onClick={handleNewSaleSubmit}
                disabled={newSaving}
                className="text-sm bg-indigo-500 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {newSaving ? '登録中...' : '売上を登録'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {loading ? <div className="text-sm text-slate-400">読み込み中...</div> : null}

      {!loading && filteredAgencies.length === 0 ? (
        <div className="text-sm text-slate-400">該当する売上がありません。</div>
      ) : null}

      <div className="space-y-3">
        {filteredAgencies.map((agency) => {
          const isOpen = expandedAgencies.has(agency.id);
          const average = agency.saleCount > 0 ? agency.totalAmount / agency.saleCount : 0;
          return (
            <div key={agency.id} className="border border-slate-800 rounded-lg p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{agency.name}</div>
                  <div className="text-xs text-slate-400">
                    合計: {agency.totalAmount.toLocaleString()} / 件数: {agency.saleCount} / 平均: {Math.round(average).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleAgency(agency.id)}
                  className="text-xs border border-slate-700 px-3 py-1 rounded text-slate-200 hover:text-white"
                >
                  {isOpen ? '折りたたむ' : 'イベントを表示'}
                </button>
              </div>

              {isOpen ? (
                <div className="mt-3 space-y-2">
                  {agency.events.map((eventItem) => {
                    const eventOpen = expandedEvents.has(eventItem.id);
                    const eventAverage = eventItem.saleCount > 0 ? eventItem.totalAmount / eventItem.saleCount : 0;
                    return (
                      <div key={eventItem.id} className="border border-slate-800/80 rounded p-3 bg-slate-950/30">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="font-medium text-slate-100">{eventItem.title}</div>
                            <div className="text-xs text-slate-400">
                              会場: {eventItem.venueName ?? '未設定'} / 期間: {eventItem.startDate?.slice(0, 10) ?? '-'} 〜{' '}
                              {eventItem.endDate?.slice(0, 10) ?? '-'}
                            </div>
                            <div className="text-xs text-slate-400">
                              合計: {eventItem.totalAmount.toLocaleString()} / 件数: {eventItem.saleCount} / 平均:{' '}
                              {Math.round(eventAverage).toLocaleString()}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleEvent(eventItem.id)}
                            className="text-xs border border-slate-700 px-3 py-1 rounded text-slate-200 hover:text-white"
                          >
                            {eventOpen ? '日次売上を隠す' : '日次売上を表示'}
                          </button>
                        </div>

                        {eventOpen ? (
                          <div className="mt-3 space-y-2">
                            {eventItem.sales
                              .slice()
                              .sort((a, b) => a.date.localeCompare(b.date))
                              .map((sale) => (
                                <div key={sale.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-800/70 px-3 py-2">
                                  <div className="text-sm text-slate-200">
                                    <span className="font-medium">{sale.date.slice(0, 10)}</span>
                                    <span className="ml-3">{sale.amount.toLocaleString()}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openEdit(sale, agency, eventItem)}
                                    className="text-xs border border-indigo-500/60 px-3 py-1 rounded text-indigo-200 hover:text-white"
                                  >
                                    編集
                                  </button>
                                </div>
                              ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {editingSale ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950 p-5 space-y-4">
            <div>
              <div className="text-sm text-slate-400">{editingSale.agencyName}</div>
              <div className="text-lg font-semibold text-slate-100">{editingSale.eventTitle}</div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm text-slate-300">
                売上日付
                <input
                  type="date"
                  className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                />
              </label>
              <label className="block text-sm text-slate-300">
                日次売上額
                <input
                  type="number"
                  className="mt-1 w-full bg-slate-950/40 border border-slate-700 rounded px-3 py-2 text-slate-100"
                  value={editAmount}
                  onChange={(event) => setEditAmount(event.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="text-sm border border-slate-700 px-3 py-2 rounded text-slate-200"
                onClick={closeEdit}
                disabled={saving}
              >
                キャンセル
              </button>
              <button
                type="button"
                className="text-sm bg-indigo-500 text-white px-3 py-2 rounded"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '保存中...' : '保存する'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
