import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { errorResponse, requireRoles, requireSession } from '@/lib/api';

export const runtime = 'nodejs';

function parseDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: Request) {
  const prisma = getPrisma();
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const url = new URL(request.url);
    const fromRaw = url.searchParams.get('from');
    const toRaw = url.searchParams.get('to');
    const from = parseDate(fromRaw);
    const to = parseDate(toRaw);

    if (!from || !to) {
      return NextResponse.json({ message: 'from/to required' }, { status: 400 });
    }

    if (from > to) {
      return NextResponse.json({ message: 'from must be before to' }, { status: 400 });
    }

    const endExclusive = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() + 1));
    const startDate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));

    const tenantId = user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;

    const [sales, venues] = await Promise.all([
      prisma.sale.findMany({
        where: {
          ...(tenantId ? { tenantId } : {}),
          date: { gte: startDate, lt: endExclusive },
        },
        include: { event: { select: { venueId: true } } },
      }),
      prisma.venue.findMany({
        where: { ...(tenantId ? { tenantId } : {}) },
      }),
    ]);

    const venueMap = new Map(venues.map((venue) => [venue.id, venue.name]));
    const totals = new Map<string, { total: number; count: number }>();

    sales.forEach((sale) => {
      const venueId = sale.event?.venueId;
      if (!venueId) return;
      const current = totals.get(venueId) ?? { total: 0, count: 0 };
      current.total += sale.amount;
      current.count += 1;
      totals.set(venueId, current);
    });

    const items = Array.from(totals.entries())
      .map(([venueId, value]) => ({
        venueId,
        venueName: venueMap.get(venueId) ?? venueId,
        total: value.total,
        count: value.count,
        average: value.count ? Math.floor(value.total / value.count) : 0,
      }))
      .sort((a, b) => a.venueName.localeCompare(b.venueName, 'ja-JP'));

    return NextResponse.json({ from: fromRaw, to: toRaw, items });
  } catch (error) {
    return errorResponse(error);
  }
}
