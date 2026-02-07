import { NextResponse } from 'next/server';
import { fetchSalesExport } from '@/lib/salesExport';
import { syncSalesToSheets } from '@/lib/googleSheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return false;
  return token === secret;
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'CRON_SECRET is not configured' }, { status: 500 });
  }

  if (!isCronAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 90);
  from.setUTCHours(0, 0, 0, 0);

  const records = await fetchSalesExport({ from, to });
  const syncedAt = new Date().toISOString();

  await syncSalesToSheets({
    records,
    syncedAt,
  });

  console.log('[sync-sales-to-sheets] records:', records.length);
  console.log('[sync-sales-to-sheets] spreadsheetId:', process.env.GOOGLE_SHEETS_SPREADSHEET_ID);
  console.log('[sync-sales-to-sheets] sheetName:', process.env.GOOGLE_SHEETS_SHEET_NAME);
  console.log('[sync-sales-to-sheets] range:', `${formatDateOnly(from)}~${formatDateOnly(to)}`);

  return NextResponse.json({ ok: true, records: records.length });
}
