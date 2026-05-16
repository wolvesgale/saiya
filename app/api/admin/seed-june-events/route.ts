import { NextResponse } from 'next/server';
import { getPrisma, resolveXruleTenantId } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

type VenueSeed = {
  name: string;
  address?: string;
  notes?: string;
  cashHandling?: 'HOLD' | 'TAKE_HOME';
  setupDayBefore?: boolean;
  loadInTime?: string;
};

// New venues for June (already-existing ones are skipped automatically)
const VENUES: VenueSeed[] = [
  { name: 'ピエリ守山', address: '滋賀県守山市', notes: '1階 ホワイトプラザエスカレーター下 初日営業開始12:00- 最終日20:00完全撤収', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日9:00-12:00' },
  { name: 'イオンタウン菰野', address: '三重県菰野町', notes: '1階 無印良品前A区画 かもしかホール', cashHandling: 'TAKE_HOME', setupDayBefore: true, loadInTime: '前日18:00-' },
  { name: 'T-FACE', address: '愛知県豊田市', notes: '1階 ③ドンク前 売上預け 撤去18:00-20:00厳守 書類あり', cashHandling: 'HOLD', setupDayBefore: false, loadInTime: '当日8:00-' },
  { name: 'ラフレ初生', address: '静岡県浜松市', notes: '1階 エブリ横イベントスペース 最終日20:30完全撤収 駐車証明書有り', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日7:30-' },
  { name: '四郷スマートタウン', address: '愛知県豊田市', cashHandling: 'TAKE_HOME' },
  { name: 'グリーンシティ高橋', address: '愛知県豊田市', notes: '仲介会社 セイム', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日9:30-' },
  { name: 'ドミー若林', address: '愛知県豊田市若林東町', cashHandling: 'TAKE_HOME' },
  { name: 'ドミー若松', address: '愛知県岡崎市若松町', cashHandling: 'TAKE_HOME' },
  { name: 'ドミー神野', address: '愛知県豊橋市神野新田町ロノ割70', cashHandling: 'TAKE_HOME' },
  { name: 'ドミー丁田', address: '愛知県西尾市丁田町中ノ切53', cashHandling: 'TAKE_HOME' },
  { name: '西友上浅田', address: '静岡県浜松市中央区上浅田', cashHandling: 'TAKE_HOME' },
  { name: 'ドミー東浦', address: '愛知県知多郡東浦町森岡', cashHandling: 'TAKE_HOME' },
  { name: '西友松河戸', address: '愛知県春日井市松河戸町2丁目10-9', cashHandling: 'TAKE_HOME' },
  { name: 'ドミー毘森公園', address: '愛知県豊田市小坂町2丁目60', cashHandling: 'TAKE_HOME' },
  { name: 'ナフコトミダ木田店', address: '愛知県あま市木田東新赤坪39-39', notes: '風除室スペース Saiya初開催', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日OK' },
  { name: 'ナフコ不二家サンライフ店', address: '愛知県春日井市美濃町2丁目15', notes: 'Saiya初開催 店長 鈴木様に確認必須', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日OK' },
  { name: 'ドン・キホーテ鈴鹿', address: '三重県鈴鹿市磯山4-6-18', cashHandling: 'TAKE_HOME' },
  { name: 'ピアゴ篠木', address: '愛知県春日井市下市場町3丁目6-2', cashHandling: 'HOLD' },
  { name: 'ナフコ不二家当知店', address: '愛知県名古屋市港区明正1丁目234', notes: '当知店店長 小河様に確認必須', cashHandling: 'TAKE_HOME' },
  { name: 'ドン・キホーテ武豊', address: '愛知県知多郡武豊町西田崎19番地1', cashHandling: 'TAKE_HOME' },
  { name: 'バロー羽島', address: '岐阜県羽島市江吉良町2939', cashHandling: 'HOLD' },
  { name: 'アピタ刈谷', address: '愛知県刈谷市南桜町2丁目 リコット刈谷', cashHandling: 'HOLD' },
  { name: 'アピタ蒲郡', address: '愛知県蒲郡市港町17-10', cashHandling: 'HOLD' },
  { name: 'ピアゴ碧南東', address: '愛知県碧南市東浦町6丁目17-17', cashHandling: 'HOLD' },
  { name: 'ドン・キホーテ津桜橋', address: '三重県津市桜橋3丁目67-1', cashHandling: 'TAKE_HOME' },
  { name: 'カインズ堀田', address: '愛知県名古屋市瑞穂区新開町24-55', cashHandling: 'TAKE_HOME' },
  { name: 'ドン・キホーテ名四', address: '愛知県名古屋市南区丹後通5丁目25-1', cashHandling: 'TAKE_HOME' },
  { name: 'カインズ岡崎美合', address: '愛知県岡崎市美合町入込8番2', cashHandling: 'TAKE_HOME' },
  { name: 'フレスポ阿波座', address: '大阪府大阪市', notes: '1階 共用スペース', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日7:00-' },
  { name: 'ダイエー摂津富田', address: '大阪府高槻市', notes: '1階 センターコート旧マクド側', cashHandling: 'HOLD', setupDayBefore: false, loadInTime: '当日7:00-' },
  { name: 'テラッソ姫路', address: '兵庫県姫路市', notes: '1階 エスカレーター降口前', cashHandling: 'TAKE_HOME', setupDayBefore: false, loadInTime: '当日7:00-' },
  { name: 'ダイエー住之江', notes: '1階 風除室', cashHandling: 'TAKE_HOME' },
  { name: 'メガドン・キホーテ四日市', address: '三重県四日市市西日野町1608-1', cashHandling: 'TAKE_HOME' },
];

type EventSeed = {
  venue: string;
  agency: string;
  startDate: string;
  endDate: string;
  memo?: string;
};

const EVENTS: EventSeed[] = [
  // Week 1: 6/4-8 (9 field agents + 前田)
  { venue: 'ピエリ守山', agency: 'るいと', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: '四郷スマートタウン', agency: '宮岡', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'ドミー神野', agency: '金田', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: '西友松河戸', agency: '富樫', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: '大垣コロナ', agency: '伊藤', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'ピアゴ東栄', agency: '古田', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'ピアゴ篠木', agency: '富田', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'ドン・キホーテ武豊', agency: '中川兄', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'アピタ蒲郡', agency: '堀井', startDate: '2026-06-04', endDate: '2026-06-08' },
  { venue: 'フレスポ阿波座', agency: '前田', startDate: '2026-06-04', endDate: '2026-06-08' },
  // Week 2: 6/11-15 (11 field agents + 前田)
  { venue: 'イオンタウン菰野', agency: '相川', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'グリーンシティ高橋', agency: '中川兄', startDate: '2026-06-11', endDate: '2026-06-15', memo: '仲介会社 セイム' },
  { venue: 'ドミー丁田', agency: '堀井', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ドミー毘森公園', agency: '富田', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: '中川コロナ', agency: '古田', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ナフコトミダ木田店', agency: '宮岡', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ナフコ不二家当知店', agency: 'るいと', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'バロー羽島', agency: '富樫', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ピアゴ碧南東', agency: '香川', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ドン・キホーテ名四', agency: '金田', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'カインズ岡崎美合', agency: '伊藤', startDate: '2026-06-11', endDate: '2026-06-15' },
  { venue: 'ダイエー摂津富田', agency: '前田', startDate: '2026-06-11', endDate: '2026-06-15' },
  // Week 3: 6/18-22 (10 field agents + 前田; テラッソ姫路は6/19-22)
  { venue: 'T-FACE', agency: '伊藤', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'ドミー若林', agency: '上原', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: '西友上浅田', agency: '香川', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: '大垣コロナ', agency: '富樫', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'ナフコ不二家サンライフ店', agency: '古田', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'アピタ松坂三雲', agency: '富田', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'アピタ刈谷', agency: '堀井', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'ドン・キホーテ津桜橋', agency: '中川兄', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'ピアゴ菰野', agency: '宮岡', startDate: '2026-06-18', endDate: '2026-06-22' },
  { venue: 'テラッソ姫路', agency: '前田', startDate: '2026-06-19', endDate: '2026-06-22' },
  // Week 4: 6/25-29 (9 field agents + 前田)
  { venue: 'ラフレ初生', agency: '金田', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'ドミー若松', agency: '伊藤', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'ドミー東浦', agency: '堀井', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: '中川コロナ', agency: '富樫', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'メガドン・キホーテ四日市', agency: '古田', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'ドン・キホーテ鈴鹿', agency: '宮岡', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'アピタ飯田', agency: 'るいと', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'ピアゴ大清水', agency: '上原', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'カインズ堀田', agency: '富田', startDate: '2026-06-25', endDate: '2026-06-29' },
  { venue: 'ダイエー住之江', agency: '前田', startDate: '2026-06-25', endDate: '2026-06-29' },
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

    // ── 1. Venues: read all existing → bulk-create new ones ──
    const existingVenues = await prisma.venue.findMany({ where: { tenantId }, select: { name: true, id: true } });
    const venueMap = new Map(existingVenues.map((v) => [v.name, v.id]));
    const venuesToCreate = VENUES.filter((v) => !venueMap.has(v.name));

    if (venuesToCreate.length > 0) {
      await prisma.venue.createMany({
        data: venuesToCreate.map((v) => ({
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
        where: { tenantId, name: { in: venuesToCreate.map((v) => v.name) } },
        select: { name: true, id: true },
      });
      fresh.forEach((v) => venueMap.set(v.name, v.id));
    }

    // ── 2. Agencies: read existing (all created in May seed) ──
    const existingAgencies = await prisma.agency.findMany({ where: { tenantId }, select: { name: true, id: true } });
    const agencyMap = new Map(existingAgencies.map((a) => [a.name, a.id]));

    // ── 3. Events: dedup by venueId+agencyId+startDate ──
    const existingEvents = await prisma.event.findMany({
      where: { tenantId },
      select: { venueId: true, agencyId: true, startDate: true },
    });
    const existingKey = new Set(
      existingEvents.map((e) => `${e.venueId}|${e.agencyId}|${e.startDate.getTime()}`),
    );

    const eventsToCreate = EVENTS.filter((e) => {
      const venueId = venueMap.get(e.venue);
      const agencyId = agencyMap.get(e.agency);
      if (!venueId || !agencyId) return false;
      const t = new Date(e.startDate + 'T00:00:00Z').getTime();
      return !existingKey.has(`${venueId}|${agencyId}|${t}`);
    });
    const eventsSkipped = EVENTS.length - eventsToCreate.length;

    const createdEvents = await runBatch(eventsToCreate, 10, (e) =>
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
      return dateRange(e.startDate, e.endDate).map((date) => ({
        tenantId,
        eventId: evt.id,
        date,
        brokerCompleted: false,
      }));
    });

    if (allEventDays.length > 0) {
      await prisma.eventDay.createMany({ data: allEventDays, skipDuplicates: true });
    }

    const missingVenues = EVENTS.filter((e) => !venueMap.has(e.venue)).map((e) => e.venue);
    const missingAgencies = EVENTS.filter((e) => !agencyMap.has(e.agency)).map((e) => e.agency);

    return NextResponse.json({
      ok: true,
      summary: {
        venues: { created: venuesToCreate.length, skipped: existingVenues.length },
        agencies: { skipped: existingAgencies.length },
        events: { created: createdEvents.length, skipped: eventsSkipped },
        eventDays: allEventDays.length,
      },
      details: {
        venuesCreated: venuesToCreate.map((v) => v.name),
        eventsCreated: eventsToCreate.map((e) => `${e.venue} / ${e.agency} ${e.startDate}`),
        ...(missingVenues.length ? { missingVenues } : {}),
        ...(missingAgencies.length ? { missingAgencies } : {}),
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
