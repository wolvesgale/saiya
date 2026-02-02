// app/api/sales/route.ts
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { appendDailySales } from '@/lib/googleSheets';

export const runtime = 'nodejs';

// DB enum 実値（あなたの Supabase で確認済み）
const PARTY_TYPES = ['AGENT', 'BROKER'] as const;
type PartyType = (typeof PARTY_TYPES)[number];

const COMMISSION_TYPES = ['PERCENT', 'FIXED'] as const;
type CommissionType = (typeof COMMISSION_TYPES)[number];

function isPartyType(v: unknown): v is PartyType {
  return typeof v === 'string' && (PARTY_TYPES as readonly string[]).includes(v);
}
function isCommissionType(v: unknown): v is CommissionType {
  return typeof v === 'string' && (COMMISSION_TYPES as readonly string[]).includes(v);
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStringOrEmpty(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? url.searchParams.get('tenantId') ?? undefined
        : user.tenantId ?? undefined;

    if (user.role === 'AGENT' && !user.agencyId) {
      return NextResponse.json([]);
    }

    const sales = await prisma.sale.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(user.role === 'AGENT' ? { agencyId: user.agencyId ?? undefined } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(sales);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    // ★ 監査カラム：作成者ID（実体が id / userId どちらでも拾う）
    const createdByUserId =
      (user as unknown as { id?: string; userId?: string }).id ??
      (user as unknown as { id?: string; userId?: string }).userId;

    if (!createdByUserId) {
      return NextResponse.json(
        { message: 'Session user id missing (createdByUserId required)' },
        { status: 500 },
      );
    }

    const payload = await request.json();

    // 必須: eventId
    const eventId = toStringOrEmpty(payload?.eventId);
    if (!eventId) {
      return NextResponse.json({ message: 'eventId required' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });

    // テナント境界
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // 必須: date
    const date = new Date(payload?.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ message: 'Date required' }, { status: 400 });
    }

    // 必須: amount
    const amount = toNumberOrNull(payload?.amount);
    if (amount === null) {
      return NextResponse.json({ message: 'Amount required' }, { status: 400 });
    }

    // 代理店制約
    if (user.role === 'AGENT') {
      if (!user.agencyId) {
        return NextResponse.json({ message: 'Agency required' }, { status: 403 });
      }
      if (event.agencyId !== user.agencyId) {
        return NextResponse.json({ message: 'Cannot submit sales for another agency' }, { status: 403 });
      }
    }

    if (!event.agencyId) {
      return NextResponse.json({ message: 'Event agency required for sales' }, { status: 400 });
    }

    // 同日重複防止
    const existing = await prisma.sale.findUnique({
      where: { eventId_date: { eventId: event.id, date } },
    });
    if (existing) {
      return NextResponse.json({ message: 'Sales already submitted for this date' }, { status: 409 });
    }

    // ====== DBの NOT NULL 列を必ず埋める ======
    const partyType: PartyType =
      isPartyType(payload?.partyType)
        ? payload.partyType
        : (user.role === 'AGENT' ? 'AGENT' : 'BROKER');

    const commissionType: CommissionType =
      isCommissionType(payload?.commissionType) ? payload.commissionType : 'PERCENT';

    const commissionValue = toNumberOrNull(payload?.commissionValue) ?? 0;
    const parkingFee = toNumberOrNull(payload?.parkingFee) ?? 0;
    const managerName = toStringOrEmpty(payload?.managerName);

    const memoAppendOnlyRaw = payload?.memoAppendOnly;
    const memoAppendOnly =
      memoAppendOnlyRaw === null || memoAppendOnlyRaw === undefined || memoAppendOnlyRaw === ''
        ? undefined
        : String(memoAppendOnlyRaw);

    const sale = await prisma.sale.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        agencyId: event.agencyId,
        date,
        amount,

        // ★監査（ここが今回の必須）
        createdByUserId,

        // ★DBのNOT NULL
        partyType,
        commissionType,
        commissionValue,
        parkingFee,
        managerName,

        ...(memoAppendOnly !== undefined ? { memoAppendOnly } : {}),
      },
    });

    // Google Sheets 連携（失敗しても保存は成功させる）
    const [agency, venue] = await Promise.all([
      prisma.agency.findUnique({ where: { id: event.agencyId } }),
      prisma.venue.findUnique({ where: { id: event.venueId } }),
    ]);

    if (agency && venue) {
      appendDailySales(agency.name, venue.name, date, amount).catch((error) => {
        console.error('[googleSheets] append failed', error);
      });
    }

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
