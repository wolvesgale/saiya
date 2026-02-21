import { NextResponse } from 'next/server';
import { requireSession, requireRoles, errorResponse } from '@/lib/api';
import { fetchSalesExport } from '@/lib/salesExport';
import { syncSalesToSheets } from '@/lib/googleSheets';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { user, response } = await requireSession(request);
    if (response) return response;
    if (!user) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    const roleResponse = requireRoles(user.role, ['SUPER_ADMIN', 'ADMIN']);
    if (roleResponse) return roleResponse;

    const now = new Date();
    const to = new Date(now);
    to.setUTCHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 90);
    from.setUTCHours(0, 0, 0, 0);

    const records = await fetchSalesExport({ from, to });
    const syncedAt = new Date().toISOString();

    const syncResult = await syncSalesToSheets({ records, syncedAt });

    return NextResponse.json({
      ok: true,
      records: records.length,
      spreadsheetTitle: syncResult.spreadsheetTitle,
      sheetCount: syncResult.sheetCount,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
