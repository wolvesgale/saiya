import { NextResponse } from 'next/server';
import { getPrisma, resolveXruleTenantId } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_PASSWORD = 'Saiya2026!';

const AGENTS = [
  { name: '伊藤', email: 'ito@xrule-saiya.jp' },
  { name: '富田', email: 'tomita@xrule-saiya.jp' },
  { name: '相川', email: 'aikawa@xrule-saiya.jp' },
  { name: '富樫', email: 'togashi@xrule-saiya.jp' },
  { name: '宮岡', email: 'miyaoka@xrule-saiya.jp' },
  { name: '金田', email: 'kaneda@xrule-saiya.jp' },
  { name: '林', email: 'hayashi@xrule-saiya.jp' },
  { name: '堀井', email: 'horii@xrule-saiya.jp' },
  { name: '野田', email: 'noda@xrule-saiya.jp' },
  { name: '村上', email: 'murakami@xrule-saiya.jp' },
  { name: '古田', email: 'furuta@xrule-saiya.jp' },
  { name: '宇江', email: 'ue@xrule-saiya.jp' },
  { name: '香川', email: 'kagawa@xrule-saiya.jp' },
  { name: '中川兄', email: 'nakagawa-ani@xrule-saiya.jp' },
  { name: '上原', email: 'uehara@xrule-saiya.jp' },
  { name: 'るいと', email: 'ruito@xrule-saiya.jp' },
  { name: '前田', email: 'maeda@xrule-saiya.jp' },
];

type VenueSeed = {
  name: string;
  address?: string;
  notes?: string;
  cashHandling?: 'HOLD' | 'TAKE_HOME';
  setupDayBefore?: boolean;
  loadInTime?: string;
};

const VENUES: VenueSeed[] = [
  { name: 'おいでんの湯', address: '愛知県豊田市', notes: '玄関', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '8:00-10:30' },
  { name: 'ウィングタウン岡崎', address: '愛知県岡崎市', notes: '1階 ④旧酒のすぎた横（ドトール上バロー出口付近）', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'モレラ岐阜', notes: '1階 ゴールドプラザエスカレーター横', cashHandling: 'HOLD', setupDayBefore: false, loadInTime: '9:00-10:00（11:00-営業）' },
  { name: 'アリオ上田', address: '長野県上田市', notes: '1階 千曲川側口（スターバックスコーヒー前）', cashHandling: 'TAKE_HOME', setupDayBefore: true, loadInTime: '18:00-' },
  { name: 'イオン近江八幡', address: '滋賀県近江八幡市', notes: '2番街2階 レストスペース', cashHandling: 'TAKE_HOME', setupDayBefore: true, loadInTime: '18:00-' },
  { name: 'イオンタウン熱田千年', address: '愛知県名古屋市', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: 'ナフコ不二家 岩野店', address: '愛知県春日井市', notes: '1F パン屋横', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: '大垣コロナ', address: '岐阜県大垣市', notes: '1F 正面入り口横', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: 'カインズ名古屋みなと', address: '愛知県名古屋市', cashHandling: 'TAKE_HOME' },
  { name: '中川コロナ', address: '愛知県名古屋市中川区', notes: '2Fエントランス 髪切処前', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: '半田コロナ', address: '愛知県半田市', notes: '2F温泉入り口横', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: 'カインズ当知', cashHandling: 'TAKE_HOME' },
  { name: '平和堂近江八幡', cashHandling: 'HOLD' },
  { name: 'ドミー知立', address: '愛知県知立市', notes: '1階催事場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'ドミー新川', address: '愛知県碧南市', notes: '1階催事場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'ドミー豊田山之手', address: '愛知県豊田市', notes: '1階催事場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'ドミー飯村', address: '愛知県豊橋市', notes: '1階催事場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'アピタ伊賀上野', cashHandling: 'HOLD' },
  { name: '西友味岡', address: '愛知県小牧市', notes: '1階催事場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: '西友八日市', address: '滋賀県東近江市', notes: '1階催事場', cashHandling: 'HOLD' },
  { name: '西友瀬戸', address: '愛知県瀬戸市', notes: '一階', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'ピアゴ東栄', cashHandling: 'HOLD' },
  { name: 'アピタ飯田', cashHandling: 'HOLD' },
  { name: 'アピタ安城南', cashHandling: 'HOLD' },
  { name: 'アピタ岡谷', cashHandling: 'HOLD' },
  { name: 'ピアゴ川辺', cashHandling: 'HOLD' },
  { name: 'アピタ岡崎北', cashHandling: 'HOLD' },
  { name: 'アピタ松坂三雲', cashHandling: 'HOLD' },
  { name: 'アピタ北方', cashHandling: 'HOLD' },
  { name: 'ピアゴ清水山', cashHandling: 'HOLD' },
  { name: 'メガドンキ伝法寺', cashHandling: 'HOLD' },
  { name: 'メガドンキ岐阜瑞穂', cashHandling: 'HOLD' },
  { name: 'ピアゴ幸田', cashHandling: 'HOLD' },
  { name: 'アピタ向山', cashHandling: 'HOLD' },
  { name: 'ピアゴ大清水', cashHandling: 'HOLD' },
  { name: 'カインズ大高', cashHandling: 'TAKE_HOME', setupDayBefore: false },
  { name: 'メガドンキ鈴鹿', cashHandling: 'HOLD' },
  { name: 'ヨシヅヤ名西', cashHandling: 'HOLD' },
  { name: 'メガドンキ嬉野', cashHandling: 'TAKE_HOME' },
  { name: 'アピタ浜北', cashHandling: 'HOLD' },
  { name: 'メガドンキ中川山王', cashHandling: 'HOLD' },
  { name: 'ピアゴ菰野', cashHandling: 'HOLD' },
  { name: 'アクロスモール泉北', address: '大阪府堺市', notes: 'A館1階 ①エスカレーター下会場', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '8:30-（11:00営業開始）' },
  { name: 'グルメシティ八尾', address: '大阪府八尾市', notes: '1階 店内出入口付近', cashHandling: 'HOLD', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'セブンパーク天美', address: '大阪府松原市', notes: '1階 マツモトキヨシ前ロフト側', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'アリオ鳳', notes: '1階 インフォメーション裏', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '7:00-' },
  { name: 'ダイエー泉大津', address: '大阪府', notes: '1階 入口付近レジ横', cashHandling: 'HOLD' },
];

type EventSeed = {
  venue: string;
  agency: string;
  startDate: string;
  endDate: string;
  memo?: string;
};

const EVENTS: EventSeed[] = [
  // Week 1: 4/29(30) - 5/4(6)
  { venue: 'おいでんの湯', agency: '伊藤', startDate: '2026-04-29', endDate: '2026-05-04' },
  { venue: 'イオンタウン熱田千年', agency: '古田', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: '中川コロナ', agency: '富樫', startDate: '2026-04-30', endDate: '2026-05-04', memo: 'Saiya初開催' },
  { venue: '平和堂近江八幡', agency: '中川兄', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'アピタ伊賀上野', agency: '富田', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'ピアゴ東栄', agency: '堀井', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'ピアゴ川辺', agency: '宮岡', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'ピアゴ清水山', agency: '相川', startDate: '2026-04-30', endDate: '2026-05-04' },
  { venue: 'ピアゴ大清水', agency: 'るいと', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'アピタ浜北', agency: '香川', startDate: '2026-04-29', endDate: '2026-05-06' },
  { venue: 'アクロスモール泉北', agency: '前田', startDate: '2026-04-29', endDate: '2026-05-04' },
  // Week 2: 5/7 - 5/11(12)
  { venue: 'ウィングタウン岡崎', agency: '富田', startDate: '2026-05-07', endDate: '2026-05-11' },
  { venue: '大垣コロナ', agency: '富樫', startDate: '2026-05-07', endDate: '2026-05-11' },
  { venue: 'ドミー知立', agency: '上原', startDate: '2026-05-07', endDate: '2026-05-11' },
  { venue: '西友味岡', agency: '伊藤', startDate: '2026-05-07', endDate: '2026-05-11' },
  { venue: 'アピタ飯田', agency: '金田', startDate: '2026-05-08', endDate: '2026-05-12' },
  { venue: 'アピタ岡崎北', agency: '堀井', startDate: '2026-05-08', endDate: '2026-05-12' },
  { venue: 'メガドンキ伝法寺', agency: '中川兄', startDate: '2026-05-09', endDate: '2026-05-10' },
  { venue: 'カインズ大高', agency: '宮岡', startDate: '2026-05-07', endDate: '2026-05-11' },
  { venue: 'グルメシティ八尾', agency: '前田', startDate: '2026-05-07', endDate: '2026-05-11' },
  // Week 3: 5/13(14) - 5/17(19)
  { venue: 'モレラ岐阜', agency: '伊藤', startDate: '2026-05-14', endDate: '2026-05-18' },
  { venue: 'ナフコ不二家 岩野店', agency: '古田', startDate: '2026-05-15', endDate: '2026-05-19' },
  { venue: '中川コロナ', agency: '宮岡', startDate: '2026-05-14', endDate: '2026-05-18' },
  { venue: 'ドミー新川', agency: '上原', startDate: '2026-05-14', endDate: '2026-05-18' },
  { venue: '西友八日市', agency: '富田', startDate: '2026-05-14', endDate: '2026-05-18' },
  { venue: 'アピタ飯田', agency: '金田', startDate: '2026-05-14', endDate: '2026-05-19' },
  { venue: 'アピタ松坂三雲', agency: 'るいと', startDate: '2026-05-14', endDate: '2026-05-19' },
  { venue: 'メガドンキ岐阜瑞穂', agency: '富樫', startDate: '2026-05-13', endDate: '2026-05-17' },
  { venue: 'メガドンキ鈴鹿', agency: '中川兄', startDate: '2026-05-13', endDate: '2026-05-17' },
  { venue: 'カインズ大高', agency: '香川', startDate: '2026-05-13', endDate: '2026-05-17' },
  { venue: 'ピアゴ菰野', agency: '堀井', startDate: '2026-05-14', endDate: '2026-05-19' },
  { venue: 'セブンパーク天美', agency: '前田', startDate: '2026-05-14', endDate: '2026-05-18' },
  // Week 4: 5/20(21) - 5/25(26)
  { venue: 'アリオ上田', agency: '伊藤', startDate: '2026-05-21', endDate: '2026-05-25' },
  { venue: '大垣コロナ', agency: '古田', startDate: '2026-05-21', endDate: '2026-05-26' },
  { venue: '半田コロナ', agency: '宮岡', startDate: '2026-05-21', endDate: '2026-05-25' },
  { venue: 'ドミー豊田山之手', agency: '金田', startDate: '2026-05-21', endDate: '2026-05-25' },
  { venue: 'アピタ安城南', agency: '香川', startDate: '2026-05-21', endDate: '2026-05-26' },
  { venue: 'アピタ北方', agency: '堀井', startDate: '2026-05-21', endDate: '2026-05-26' },
  { venue: 'ピアゴ幸田', agency: 'るいと', startDate: '2026-05-21', endDate: '2026-05-26' },
  { venue: 'ヨシヅヤ名西', agency: '富田', startDate: '2026-05-20', endDate: '2026-05-24' },
  { venue: '平和堂近江八幡', agency: '中川兄', startDate: '2026-05-20', endDate: '2026-05-24', memo: 'Lupinus' },
  { venue: 'アリオ鳳', agency: '前田', startDate: '2026-05-21', endDate: '2026-05-25' },
  // Week 5: 5/27(28) - 5/31(6/2)
  { venue: 'イオン近江八幡', agency: '金田', startDate: '2026-05-28', endDate: '2026-06-01' },
  { venue: 'カインズ名古屋みなと', agency: '中川兄', startDate: '2026-05-28', endDate: '2026-06-01', memo: 'Saiya初開催' },
  { venue: 'カインズ当知', agency: '古田', startDate: '2026-05-28', endDate: '2026-06-01' },
  { venue: 'ドミー飯村', agency: '香川', startDate: '2026-05-28', endDate: '2026-06-01' },
  { venue: '西友瀬戸', agency: '伊藤', startDate: '2026-05-28', endDate: '2026-06-01' },
  { venue: 'アピタ岡谷', agency: 'るいと', startDate: '2026-05-28', endDate: '2026-06-02' },
  { venue: 'アピタ伊賀上野', agency: '富田', startDate: '2026-05-28', endDate: '2026-06-02' },
  { venue: 'アピタ向山', agency: '堀井', startDate: '2026-05-28', endDate: '2026-06-02' },
  { venue: 'メガドンキ嬉野', agency: '富樫', startDate: '2026-05-27', endDate: '2026-05-31' },
  { venue: 'メガドンキ中川山王', agency: '宮岡', startDate: '2026-05-27', endDate: '2026-05-31' },
  { venue: 'ダイエー泉大津', agency: '前田', startDate: '2026-05-28', endDate: '2026-06-01' },
];

function dateRange(startStr: string, endStr: string): Date[] {
  const dates: Date[] = [];
  const cur = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  while (cur <= end) {
    dates.push(new Date(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

async function runBatch<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const chunk = await Promise.all(items.slice(i, i + size).map(fn));
    results.push(...chunk);
  }
  return results;
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN']);
    if (roleResponse) return roleResponse;

    const tenantId = await resolveXruleTenantId(prisma);
    if (!tenantId) return NextResponse.json({ message: 'Xrule tenant not found' }, { status: 500 });

    const pwHash = await hashPassword(DEFAULT_PASSWORD);

    // ── 1. Venues: one read → one bulk insert → re-read IDs ──
    const existingVenues = await prisma.venue.findMany({ where: { tenantId }, select: { name: true, id: true } });
    const venueMap = new Map(existingVenues.map(v => [v.name, v.id]));
    const venuesToCreate = VENUES.filter(v => !venueMap.has(v.name));

    if (venuesToCreate.length > 0) {
      await prisma.venue.createMany({
        data: venuesToCreate.map(v => ({
          tenantId,
          name: v.name,
          address: v.address ?? null,
          notes: v.notes ?? null,
          cashHandling: v.cashHandling ?? null,
          setupDayBefore: v.setupDayBefore ?? null,
          loadInTime: v.loadInTime ?? null,
          preContactRequired: false,
        })),
      });
      const fresh = await prisma.venue.findMany({
        where: { tenantId, name: { in: venuesToCreate.map(v => v.name) } },
        select: { name: true, id: true },
      });
      fresh.forEach(v => venueMap.set(v.name, v.id));
    }

    // ── 2. Agencies: one read → one bulk insert → re-read IDs ──
    const existingAgencies = await prisma.agency.findMany({ where: { tenantId }, select: { name: true, id: true } });
    const agencyMap = new Map(existingAgencies.map(a => [a.name, a.id]));
    const agenciesToCreate = AGENTS.filter(a => !agencyMap.has(a.name));

    if (agenciesToCreate.length > 0) {
      await prisma.agency.createMany({
        data: agenciesToCreate.map(a => ({
          tenantId,
          name: a.name,
          email: a.email,
          passwordHash: pwHash,
          isActive: true,
        })),
      });
      const fresh = await prisma.agency.findMany({
        where: { tenantId, name: { in: agenciesToCreate.map(a => a.name) } },
        select: { name: true, id: true },
      });
      fresh.forEach(a => agencyMap.set(a.name, a.id));
    }

    // ── 3. Events: one read for dedup → parallel batch creates ──
    const existingEvents = await prisma.event.findMany({
      where: { tenantId },
      select: { venueId: true, agencyId: true, startDate: true },
    });
    const existingKey = new Set(
      existingEvents.map(e => `${e.venueId}|${e.agencyId}|${e.startDate.getTime()}`),
    );

    const eventsToCreate = EVENTS.filter(e => {
      const venueId = venueMap.get(e.venue);
      const agencyId = agencyMap.get(e.agency);
      if (!venueId || !agencyId) return false;
      const t = new Date(e.startDate + 'T00:00:00Z').getTime();
      return !existingKey.has(`${venueId}|${agencyId}|${t}`);
    });
    const eventsSkipped = EVENTS.length - eventsToCreate.length;

    const createdEvents = await runBatch(eventsToCreate, 10, e =>
      prisma.event.create({
        data: {
          tenantId,
          agencyId: agencyMap.get(e.agency)!,
          venueId: venueMap.get(e.venue)!,
          title: e.venue,
          startDate: new Date(e.startDate + 'T00:00:00Z'),
          endDate: new Date(e.endDate + 'T00:00:00Z'),
          memo: e.memo ?? null,
        },
        select: { id: true, startDate: true, endDate: true },
      }),
    );

    // ── 4. EventDays: single bulk insert ──
    const allEventDays = createdEvents.flatMap((evt, i) => {
      const e = eventsToCreate[i];
      return dateRange(e.startDate, e.endDate).map(date => ({
        tenantId,
        eventId: evt.id,
        date,
        brokerCompleted: false,
      }));
    });

    if (allEventDays.length > 0) {
      await prisma.eventDay.createMany({ data: allEventDays, skipDuplicates: true });
    }

    return NextResponse.json({
      ok: true,
      defaultPassword: DEFAULT_PASSWORD,
      summary: {
        venues: { created: venuesToCreate.length, skipped: existingVenues.length },
        agencies: { created: agenciesToCreate.length, skipped: existingAgencies.length },
        events: { created: createdEvents.length, skipped: eventsSkipped },
        eventDays: allEventDays.length,
      },
      details: {
        venuesCreated: venuesToCreate.map(v => v.name),
        agenciesCreated: agenciesToCreate.map(a => a.name),
        eventsCreated: eventsToCreate.map(e => `${e.venue} (${e.startDate}〜${e.endDate}) → ${e.agency}`),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
