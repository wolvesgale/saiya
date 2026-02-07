// app/api/sales/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { appendDailySales } from '@/lib/googleSheets';
import { hashPassword } from '@/lib/auth';
import { UserRole } from '@prisma/client';

export const runtime = 'nodejs';

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
  let payload: any = null;
  let sessionUserId: string | null = null;
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    sessionUserId = user.id;

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    // ★ 2-2: 反映確認ログ
    console.log('[sales POST] route-version:', '2026-02-02-d');
    console.log('[sales POST] user.id:', user.id);
    console.log('[sales POST] user keys:', Object.keys(user as any));

    const authUserId = user.id;
    if (!authUserId) {
      return NextResponse.json(
        { message: 'Session user id missing (authUserId required)' },
        { status: 500 },
      );
    }

    payload = await request.json();

    const eventId = toStringOrEmpty(payload?.eventId);
    if (!eventId) {
      return NextResponse.json({ message: 'eventId required' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });

    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const date = new Date(payload?.date);
    if (Number.isNaN(date.getTime())) {
      return NextResponse.json({ message: 'Date required' }, { status: 400 });
    }

    const amount = toNumberOrNull(payload?.amount);
    if (amount === null) {
      return NextResponse.json({ message: 'Amount required' }, { status: 400 });
    }

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

    const tenantIdForUser = user.tenantId ?? event.tenantId;
    if (!tenantIdForUser) {
      return NextResponse.json({ message: 'Tenant required for user mapping' }, { status: 400 });
    }

    const [tenant, sessionAgency] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantIdForUser } }),
      user.agencyId ? prisma.agency.findUnique({ where: { id: user.agencyId } }) : Promise.resolve(null),
    ]);

    if (!tenant) {
      return NextResponse.json({ message: 'Invalid tenantId for session user' }, { status: 403 });
    }
    if (user.agencyId && !sessionAgency) {
      return NextResponse.json({ message: 'Invalid agencyId for session user' }, { status: 403 });
    }

    const existing = await prisma.sale.findUnique({
      where: { eventId_date: { eventId: event.id, date } },
    });
    if (existing) {
      return NextResponse.json({ message: 'Sales already submitted for this date' }, { status: 409 });
    }

    const partyType =
      isPartyType(payload?.partyType)
        ? payload.partyType
        : (user.role === 'AGENT' ? 'AGENT' : 'BROKER');

    const commissionType =
      isCommissionType(payload?.commissionType) ? payload.commissionType : 'PERCENT';

    const commissionValue = toNumberOrNull(payload?.commissionValue) ?? 0;
    const parkingFee = toNumberOrNull(payload?.parkingFee) ?? 0;
    const managerName = toStringOrEmpty(payload?.managerName);

    const memoAppendOnlyRaw = payload?.memoAppendOnly;
    const memoAppendOnly =
      memoAppendOnlyRaw === null || memoAppendOnlyRaw === undefined || memoAppendOnlyRaw === ''
        ? undefined
        : String(memoAppendOnlyRaw);

    const normalizedRole = (Object.values(UserRole) as string[]).includes(user.role)
      ? (user.role as UserRole)
      : null;
    if (!normalizedRole) {
      return NextResponse.json({ message: 'Invalid role for session user' }, { status: 400 });
    }

    const existingByAuthUserId = await prisma.user.findUnique({
      where: { authUserId },
    });

    let createdByUser = existingByAuthUserId
      ? await prisma.user.update({
          where: { id: existingByAuthUserId.id },
          data: {
            email: user.email,
            role: normalizedRole,
            tenantId: tenantIdForUser,
            agencyId: user.agencyId,
            isActive: true,
          },
        })
      : null;

    if (!createdByUser) {
      const existingByEmail = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (existingByEmail) {
        if (existingByEmail.authUserId && existingByEmail.authUserId !== authUserId) {
          return NextResponse.json(
            { message: 'Email already linked to another user' },
            { status: 403 },
          );
        }
        if (existingByEmail.tenantId && existingByEmail.tenantId !== tenantIdForUser) {
          return NextResponse.json(
            { message: 'Email belongs to another tenant' },
            { status: 403 },
          );
        }

        createdByUser = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            authUserId,
            email: user.email,
            role: normalizedRole,
            tenantId: existingByEmail.tenantId ?? tenantIdForUser,
            agencyId: user.agencyId,
            isActive: true,
          },
        });
      } else {
        createdByUser = await prisma.user.create({
          data: {
            id: crypto.randomUUID(),
            authUserId,
            email: user.email,
            passwordHash: await hashPassword(crypto.randomUUID()),
            role: normalizedRole,
            tenantId: tenantIdForUser,
            agencyId: user.agencyId,
            isActive: true,
            mustChangePassword: false,
          },
        });
      }
    }

    const sale = await prisma.sale.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        agencyId: event.agencyId,
        date,
        amount,

        createdByUserId: createdByUser.id,
        partyType,
        commissionType,
        commissionValue,
        parkingFee,
        managerName,
        ...(memoAppendOnly !== undefined ? { memoAppendOnly } : {}),
      },
    });

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
    console.error('[sales POST] error', {
      routeVersion: '2026-02-02-d',
      userId: sessionUserId,
      input: payload,
    });
    return errorResponse(error);
  }
}
