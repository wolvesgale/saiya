import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';

export const runtime = 'nodejs';

function getMonthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    if (!year || !month) {
      return NextResponse.json({ message: 'Year and month required' }, { status: 400 });
    }

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    const { start, end } = getMonthRange(year, month);
    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;
    const agencyIdParam = url.searchParams.get('agencyId') ?? undefined;
    const agencyId = user.role === 'AGENT' ? user.agencyId ?? undefined : agencyIdParam;

    if (user.role === 'AGENT' && !agencyId) {
      return NextResponse.json({ agencyTotals: {}, agencyVenueAverages: {}, overallAverage: 0 });
    }

    // 対象月と重なるイベントを取得（月を跨ぐイベントも含む）
    const overlappingEvents = await prisma.event.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(agencyId ? { agencyId } : {}),
        startDate: { lt: end },
        endDate: { gte: start },
      },
      select: { id: true, venueId: true, agencyId: true },
    });

    if (!overlappingEvents.length) {
      return NextResponse.json({ agencyTotals: {}, agencyVenueAverages: {}, overallAverage: 0 });
    }

    const eventIds = overlappingEvents.map((e) => e.id);
    const eventVenueMap = new Map(overlappingEvents.map((e) => [e.id, e.venueId]));

    // 月間合計用: 当月の売上のみ
    const monthlySales = await prisma.sale.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        eventId: { in: eventIds },
        date: { gte: start, lt: end },
      },
    });

    // 平均計算用: 対象月に開催されたイベントの全日程分の売上
    const allEventSales = await prisma.sale.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        eventId: { in: eventIds },
      },
    });

    const agencyTotals: Record<string, number> = {};
    monthlySales.forEach((sale) => {
      agencyTotals[sale.agencyId] = (agencyTotals[sale.agencyId] ?? 0) + sale.amount;
    });

    const agencyVenueTotals: Record<string, Record<string, { total: number; count: number }>> = {};
    let totalAmount = 0;
    let totalCount = 0;

    allEventSales.forEach((sale) => {
      const venueId = eventVenueMap.get(sale.eventId);
      if (!venueId) return;
      if (!agencyVenueTotals[sale.agencyId]) agencyVenueTotals[sale.agencyId] = {};
      const venueTotal = agencyVenueTotals[sale.agencyId][venueId] ?? { total: 0, count: 0 };
      venueTotal.total += sale.amount;
      venueTotal.count += 1;
      agencyVenueTotals[sale.agencyId][venueId] = venueTotal;
      totalAmount += sale.amount;
      totalCount += 1;
    });

    const agencyVenueAverages: Record<string, Record<string, number>> = {};
    Object.entries(agencyVenueTotals).forEach(([aid, venues]) => {
      agencyVenueAverages[aid] = {};
      Object.entries(venues).forEach(([venueId, value]) => {
        agencyVenueAverages[aid][venueId] = value.count ? Math.floor(value.total / value.count) : 0;
      });
    });

    return NextResponse.json({
      agencyTotals,
      agencyVenueAverages,
      overallAverage: totalCount ? Math.floor(totalAmount / totalCount) : 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
