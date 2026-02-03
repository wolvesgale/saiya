import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse, requireRoles, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export async function PATCH(request: Request, context: { params: { id: string } }) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const saleId = context.params.id;
    if (!saleId) {
      return NextResponse.json({ message: 'Sale id required' }, { status: 400 });
    }

    const sale = await prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) {
      return NextResponse.json({ message: 'Sale not found' }, { status: 404 });
    }

    if (user.role !== 'SUPER_ADMIN' && sale.tenantId !== user.tenantId) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    const payload = await request.json();
    const amount = toNumberOrNull(payload?.amount);
    if (amount === null) {
      return NextResponse.json({ message: 'amount is required' }, { status: 400 });
    }

    let nextDate = sale.date;
    if (payload?.date !== undefined && payload?.date !== null && payload?.date !== '') {
      const parsed = new Date(payload.date);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ message: 'date is invalid' }, { status: 400 });
      }
      if (parsed.toISOString() !== sale.date.toISOString()) {
        const conflict = await prisma.sale.findUnique({
          where: { eventId_date: { eventId: sale.eventId, date: parsed } },
        });
        if (conflict && conflict.id !== sale.id) {
          return NextResponse.json({ message: '同日売上が既に存在します。' }, { status: 409 });
        }
      }
      nextDate = parsed;
    }

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        amount,
        ...(nextDate.toISOString() !== sale.date.toISOString() ? { date: nextDate } : {}),
      },
    });

    return NextResponse.json({
      id: updated.id,
      date: updated.date.toISOString(),
      amount: updated.amount,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
