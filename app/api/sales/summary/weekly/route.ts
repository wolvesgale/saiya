import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse, requireRoles, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

function getPrevMonthRange(year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return getMonthRange(prevYear, prevMonth);
}

function getWeekIndex(date: Date) {
  return Math.min(4, Math.floor((date.getUTCDate() - 1) / 7));
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    if (!year || !month) {
      return NextResponse.json({ message: 'Year and month required' }, { status: 400 });
    }

    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;
    const agencyIdParam = url.searchParams.get('agencyId') ?? undefined;
    const agencyId = user.role === 'AGENT' ? user.agencyId ?? undefined : agencyIdParam;

    if (user.role === 'AGENT' && !agencyId) {
      return NextResponse.json({ year, month, items: [] });
    }

    const { start, end } = getMonthRange(year, month);
    const { start: prevStart, end: prevEnd } = getPrevMonthRange(year, month);

    const [agencies, sales, prevMonthTotals] = await Promise.all([
      prisma.agency.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(agencyId ? { id: agencyId } : {}),
        },
        orderBy: { name: 'asc' },
      }),
      prisma.sale.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(agencyId ? { agencyId } : {}),
          date: { gte: start, lt: end },
        },
        select: { agencyId: true, amount: true, date: true },
      }),
      prisma.sale.groupBy({
        by: ['agencyId'],
        where: {
          ...(tenantId ? { tenantId } : {}),
          ...(agencyId ? { agencyId } : {}),
          date: { gte: prevStart, lt: prevEnd },
        },
        _sum: { amount: true },
      }),
    ]);

    const prevTotalsMap = new Map<string, number>();
    prevMonthTotals.forEach((entry) => {
      prevTotalsMap.set(entry.agencyId, entry._sum.amount ?? 0);
    });

    const itemsMap = new Map<
      string,
      { agencyId: string; agencyName: string; weeks: number[]; total: number; prevMonthTotal: number }
    >();

    agencies.forEach((agency) => {
      itemsMap.set(agency.id, {
        agencyId: agency.id,
        agencyName: agency.name,
        weeks: [0, 0, 0, 0, 0],
        total: 0,
        prevMonthTotal: prevTotalsMap.get(agency.id) ?? 0,
      });
    });

    sales.forEach((sale) => {
      const target = itemsMap.get(sale.agencyId) ?? {
        agencyId: sale.agencyId,
        agencyName: sale.agencyId,
        weeks: [0, 0, 0, 0, 0],
        total: 0,
        prevMonthTotal: prevTotalsMap.get(sale.agencyId) ?? 0,
      };
      const weekIndex = getWeekIndex(sale.date);
      target.weeks[weekIndex] += sale.amount;
      target.total += sale.amount;
      itemsMap.set(sale.agencyId, target);
    });

    const items = Array.from(itemsMap.values()).map((item) => ({
      agencyId: item.agencyId,
      agencyName: item.agencyName,
      week1: item.weeks[0],
      week2: item.weeks[1],
      week3: item.weeks[2],
      week4: item.weeks[3],
      week5: item.weeks[4],
      total: item.total,
      prevMonthTotal: item.prevMonthTotal,
    }));

    return NextResponse.json({ year, month, items });
  } catch (error) {
    return errorResponse(error);
  }
}
