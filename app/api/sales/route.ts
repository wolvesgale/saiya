import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { auditLog } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const prisma = getPrisma();
  const { user, response } = await requireSession(request);
  if (response) return response;
  if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

  const sales = await prisma.sale.findMany({
    where: tenantId ? { tenantId } : {},
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(sales);
}

export async function POST(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT', 'BROKER']);
    if (roleResponse) return roleResponse;

    const payload = await request.json();
    const event = await prisma.event.findUnique({ where: { id: payload.eventId } });
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    if (user.role !== 'SUPER_ADMIN' && event.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const date = new Date(payload.date);
    const partyType = payload.partyType;

    if (user.role === 'AGENT' && partyType !== 'AGENT') {
      return NextResponse.json({ message: 'Agent cannot submit broker sales' }, { status: 403 });
    }

    if (user.role === 'AGENT') {
      const eventDay = await prisma.eventDay.findUnique({
        where: { eventId_date: { eventId: event.id, date } },
      });
      if (!eventDay?.brokerCompleted) {
        return NextResponse.json({ message: 'Broker completion required before agent submission' }, { status: 403 });
      }
    }

    const sale = await prisma.sale.create({
      data: {
        tenantId: event.tenantId,
        eventId: event.id,
        date,
        partyType,
        amount: payload.amount,
        commissionType: payload.commissionType,
        commissionValue: payload.commissionValue,
        parkingFee: payload.parkingFee ?? 0,
        managerName: payload.managerName,
        memoAppendOnly: payload.memoAppend ?? null,
        createdByUserId: user.id,
      },
    });

    auditLog('sales.created', { saleId: sale.id, userId: user.id, partyType });

    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
