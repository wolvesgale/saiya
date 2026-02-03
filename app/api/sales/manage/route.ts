import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse, requireRoles, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

type SalesManageSale = { id: string; date: string; amount: number };
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

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));

    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return NextResponse.json({ message: 'year and month are required' }, { status: 400 });
    }

    const tenantId =
      user.role === 'SUPER_ADMIN'
        ? url.searchParams.get('tenantId') ?? undefined
        : user.tenantId ?? undefined;

    const agencyId = url.searchParams.get('agencyId') ?? undefined;

    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 1);

    const sales = await prisma.sale.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...(agencyId ? { agencyId } : {}),
        date: { gte: start, lt: end },
      },
      include: {
        agency: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, startDate: true, endDate: true, venue: { select: { name: true } } } },
      },
      orderBy: [{ agencyId: 'asc' }, { date: 'asc' }],
    });

    const agencyMap = new Map<string, SalesManageAgency & { eventMap: Map<string, SalesManageEvent> }>();

    sales.forEach((sale) => {
      const agencyEntry =
        agencyMap.get(sale.agencyId) ??
        (() => {
          const next = {
            id: sale.agencyId,
            name: sale.agency?.name ?? '未設定',
            totalAmount: 0,
            saleCount: 0,
            events: [],
            eventMap: new Map<string, SalesManageEvent>(),
          };
          agencyMap.set(sale.agencyId, next);
          return next;
        })();

      const eventEntry =
        agencyEntry.eventMap.get(sale.eventId) ??
        (() => {
          const next = {
            id: sale.eventId,
            title: sale.event?.title ?? '未設定',
            startDate: sale.event?.startDate ? sale.event.startDate.toISOString() : null,
            endDate: sale.event?.endDate ? sale.event.endDate.toISOString() : null,
            venueName: sale.event?.venue?.name ?? null,
            totalAmount: 0,
            saleCount: 0,
            sales: [],
          };
          agencyEntry.eventMap.set(sale.eventId, next);
          agencyEntry.events.push(next);
          return next;
        })();

      const saleItem = { id: sale.id, date: sale.date.toISOString(), amount: sale.amount };
      eventEntry.sales.push(saleItem);
      eventEntry.totalAmount += sale.amount;
      eventEntry.saleCount += 1;
      agencyEntry.totalAmount += sale.amount;
      agencyEntry.saleCount += 1;
    });

    const agencies = Array.from(agencyMap.values()).map((agency) => ({
      id: agency.id,
      name: agency.name,
      totalAmount: agency.totalAmount,
      saleCount: agency.saleCount,
      events: agency.events,
    }));

    agencies.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    return NextResponse.json({ year, month, agencies });
  } catch (error) {
    return errorResponse(error);
  }
}
