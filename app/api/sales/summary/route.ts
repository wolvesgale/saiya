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
      return NextResponse.json({ agencyTotals: {}, venueAverages: {} });
    }

    const sales = await prisma.sale.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(agencyId ? { agencyId } : {}),
        date: { gte: start, lt: end },
      },
      include: { event: true },
    });

    const agencyTotals: Record<string, number> = {};
    const venueTotals: Record<string, { total: number; count: number }> = {};
    let totalAmount = 0;
    let totalCount = 0;

    sales.forEach((sale) => {
      agencyTotals[sale.agencyId] = (agencyTotals[sale.agencyId] ?? 0) + sale.amount;
      const venueId = sale.event.venueId;
      const venueTotal = venueTotals[venueId] ?? { total: 0, count: 0 };
      venueTotal.total += sale.amount;
      venueTotal.count += 1;
      venueTotals[venueId] = venueTotal;
      totalAmount += sale.amount;
      totalCount += 1;
    });

    const venueAverages: Record<string, number> = {};
    Object.entries(venueTotals).forEach(([venueId, value]) => {
      venueAverages[venueId] = value.count ? value.total / value.count : 0;
    });

    return NextResponse.json({
      agencyTotals,
      venueAverages,
      overallAverage: totalCount ? totalAmount / totalCount : 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
