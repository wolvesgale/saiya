import { NextResponse } from 'next/server';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { fetchSalesExport } from '@/lib/salesExport';

export const runtime = 'nodejs';

function parseDateStart(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function parseDateEnd(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCHours(23, 59, 59, 999);
  return date;
}

function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return false;
  return token === secret;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');

    if (!fromParam || !toParam) {
      return NextResponse.json({ message: 'from and to required' }, { status: 400 });
    }

    const from = parseDateStart(fromParam);
    const to = parseDateEnd(toParam);
    if (!from || !to) {
      return NextResponse.json({ message: 'Invalid date range' }, { status: 400 });
    }

    const cronAuthorized = isCronAuthorized(request);
    if (cronAuthorized) {
      const tenantId = url.searchParams.get('tenantId') ?? undefined;
      const agencyId = url.searchParams.get('agencyId') ?? undefined;
      const records = await fetchSalesExport({ from, to, tenantId, agencyId });
      return NextResponse.json(records);
    }

    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN', 'AGENT']);
    if (roleResponse) return roleResponse;

    const tenantId =
      user.role === 'SUPER_ADMIN' ? url.searchParams.get('tenantId') ?? undefined : user.tenantId ?? undefined;
    const agencyId =
      user.role === 'AGENT' ? user.agencyId ?? undefined : url.searchParams.get('agencyId') ?? undefined;

    if (user.role === 'AGENT' && !agencyId) {
      return NextResponse.json([]);
    }

    const records = await fetchSalesExport({ from, to, tenantId, agencyId });
    return NextResponse.json(records);
  } catch (error) {
    return errorResponse(error);
  }
}
