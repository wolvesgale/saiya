import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { fetchSalesExport } from '@/lib/salesExport';
import { syncSalesToSheets } from '@/lib/googleSheets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { authorized: false, reason: 'CRON_SECRET is not configured' };
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return { authorized: false, reason: 'Authorization header is missing' };
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer') return { authorized: false, reason: 'Authorization scheme must be Bearer' };
  if (token !== secret) return { authorized: false, reason: 'Bearer token does not match' };
  return { authorized: true };
}

function formatDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function maskSpreadsheetId(value: string | undefined) {
  if (!value) return 'unset';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function GET(request: Request) {
  const requestId = randomUUID();
  const logPrefix = `[sync-sales-to-sheets][${requestId}]`;
  let step = 'init';

  try {
    if (!process.env.CRON_SECRET) {
      console.error(`${logPrefix} CRON_SECRET is not configured`);
      return NextResponse.json(
        { ok: false, step: 'config', error: 'CRON_SECRET is not configured', requestId },
        { status: 500 },
      );
    }

    step = 'authorize';
    const authResult = isCronAuthorized(request);
    console.log(`${logPrefix} authorized:`, authResult.authorized);
    if (!authResult.authorized) {
      console.warn(`${logPrefix} authorization failed:`, authResult.reason);
      return NextResponse.json(
        { ok: false, step, error: 'Unauthorized', details: authResult.reason, requestId },
        { status: 401 },
      );
    }

    step = 'range';
    const now = new Date();
    const to = new Date(now);
    to.setUTCHours(23, 59, 59, 999);
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 90);
    from.setUTCHours(0, 0, 0, 0);

    console.log(`${logPrefix} range:`, `${formatDateOnly(from)}~${formatDateOnly(to)}`);

    step = 'fetch_sales';
    const records = await fetchSalesExport({ from, to });
    const syncedAt = new Date().toISOString();

    console.log(`${logPrefix} records.length:`, records.length);
    console.log(`${logPrefix} spreadsheetId:`, maskSpreadsheetId(process.env.GOOGLE_SHEETS_SPREADSHEET_ID));
    console.log(`${logPrefix} sheetName:`, process.env.GOOGLE_SHEETS_SHEET_NAME ?? 'unset');

    step = 'sync_sales_to_sheets_start';
    console.log(`${logPrefix} syncSalesToSheets start`);
    const syncResult = await syncSalesToSheets({
      records,
      syncedAt,
    });
    console.log(`${logPrefix} syncSalesToSheets end`);

    return NextResponse.json({
      ok: true,
      records: records.length,
      spreadsheetTitle: syncResult.spreadsheetTitle,
      sheetCount: syncResult.sheetCount,
      requestId,
    });
  } catch (error) {
    console.error(`${logPrefix} failed at step: ${step}`, error);
    const details = error instanceof Error ? { name: error.name, message: error.message } : error;
    return NextResponse.json(
      { ok: false, step, error: 'Sync failed', details, requestId },
      { status: 500 },
    );
  }
}
