import type { sheets_v4 } from 'googleapis';

function getServiceAccount() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  if (!encoded) return null;
  try {
    const json = Buffer.from(encoded, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (error) {
    console.warn('[googleSheets] failed to parse service account JSON', error);
    return null;
  }
}

function getSheetName() {
  return process.env.GOOGLE_SHEETS_SHEET_NAME;
}

function toNumber(value: string | undefined) {
  const numberValue = Number(value ?? 0);
  return Number.isNaN(numberValue) ? 0 : numberValue;
}

function getWeekIndex(date: Date) {
  return Math.floor((date.getDate() - 1) / 7);
}

type SheetBlock = {
  agencyCell: string;
  nameCell: string;
  venueCell: string;
  totalCell: string;
  dailyColumn: string;
};

const SHEET_BLOCKS: SheetBlock[] = [
  { agencyCell: 'J4', nameCell: 'A8', venueCell: 'B8', totalCell: 'B9', dailyColumn: 'J' },
  { agencyCell: 'P4', nameCell: 'A10', venueCell: 'B10', totalCell: 'B11', dailyColumn: 'P' },
  { agencyCell: 'J14', nameCell: 'A12', venueCell: 'B12', totalCell: 'B13', dailyColumn: 'J' },
  { agencyCell: 'P14', nameCell: 'A14', venueCell: 'B14', totalCell: 'B15', dailyColumn: 'P' },
];

function getCellValue(values: string[][], cell: string) {
  const match = cell.match(/([A-Z]+)(\d+)/);
  if (!match) return '';
  const column = match[1];
  const row = Number(match[2]);
  let columnIndex = 0;
  for (let i = 0; i < column.length; i += 1) {
    columnIndex = columnIndex * 26 + (column.charCodeAt(i) - 64);
  }
  const rowIndex = row - 1;
  return values[rowIndex]?.[columnIndex - 1] ?? '';
}

export async function appendDailySales(agencyName: string, venueName: string, date: Date, amount: number) {
  let googleApis: any;
  try {
    googleApis = await import('googleapis');
  } catch (error) {
    console.warn('[googleSheets] googleapis not available', error);
    return;
  }
  const { google } = googleApis;
  const sheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const sheetName = getSheetName();
  const serviceAccount = getServiceAccount();
  const scope = process.env.GOOGLE_SHEETS_SCOPE ?? 'https://www.googleapis.com/auth/spreadsheets';

  if (!sheetId || !sheetName || !serviceAccount) {
    console.warn('[googleSheets] missing environment configuration');
    return;
  }

  try {
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [scope],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const range = `${sheetName}!A1:Z200`;
    const valuesResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    const values = (valuesResponse.data.values ?? []) as string[][];

    let targetBlock = SHEET_BLOCKS.find((block) => getCellValue(values, block.agencyCell) === agencyName);
    if (!targetBlock) {
      targetBlock = SHEET_BLOCKS.find((block) => getCellValue(values, block.agencyCell) === '');
      if (!targetBlock) {
        console.warn('[googleSheets] no available agency block', agencyName);
        return;
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!${targetBlock.agencyCell}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[agencyName]] },
      });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${sheetName}!${targetBlock.nameCell}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[agencyName]] },
      });
    }

    const weekIndex = getWeekIndex(date);
    const dayOffset = (date.getDate() - 1) % 7;
    const dailyRow = 6 + weekIndex * 7 + dayOffset;
    const columnLetter = targetBlock.dailyColumn;
    const cellRange = `${sheetName}!${columnLetter}${dailyRow}`;
    const currentValue = toNumber(getCellValue(values, `${columnLetter}${dailyRow}`));
    const updatedValue = currentValue + amount;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: cellRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[updatedValue]] },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!${targetBlock.venueCell}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[venueName]] },
    });

    const summaryCurrentValue = toNumber(getCellValue(values, targetBlock.totalCell));
    const summaryUpdatedValue = summaryCurrentValue + amount;

    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${sheetName}!${targetBlock.totalCell}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[summaryUpdatedValue]] },
    });
  } catch (error) {
    console.warn('[googleSheets] appendDailySales failed', error);
  }
}

const SALES_RAW_SHEET_NAME = 'SalesRaw';

function getSheetsSpreadsheetId() {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
}

function getSheetsScope() {
  return process.env.GOOGLE_SHEETS_SCOPE ?? 'https://www.googleapis.com/auth/spreadsheets';
}

type SyncSalesPayload = {
  records: {
    date: string;
    venueName: string;
    agencyName: string;
    amount: number;
    createdAt: string;
    saleId: string;
    tenantId: string;
    eventId: string;
  }[];
  dashboardSheetName?: string;
  spreadsheetId?: string;
  syncedAt: string;
};

type SyncSalesResult = {
  spreadsheetTitle?: string;
  sheetCount?: number;
};

function maskSpreadsheetId(value: string | undefined) {
  if (!value) return 'unset';
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export async function syncSalesToSheets(payload: SyncSalesPayload): Promise<SyncSalesResult> {
  let googleApis: any;
  try {
    googleApis = await import('googleapis');
  } catch (error) {
    console.warn('[googleSheets] googleapis not available', error);
    throw error;
  }

  const { google } = googleApis;
  const spreadsheetId = payload.spreadsheetId ?? getSheetsSpreadsheetId();
  const sheetName = payload.dashboardSheetName ?? getSheetName();
  const serviceAccount = getServiceAccount();
  const scope = getSheetsScope();

  if (!spreadsheetId || !sheetName || !serviceAccount) {
    console.warn('[googleSheets] missing environment configuration');
    throw new Error('Missing Google Sheets environment configuration');
  }

  try {
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [scope],
    });
    console.info('[googleSheets] step auth_initialized', {
      spreadsheetId: maskSpreadsheetId(spreadsheetId),
      sheetName,
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // スプレッドシートのメタデータ取得（xlsx形式の場合は失敗するが処理は継続）
    let spreadsheetTitle = '';
    let sheetCount = 0;
    try {
      console.info('[googleSheets] step spreadsheets_get_start');
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title,sheets.properties.title',
      });
      spreadsheetTitle = spreadsheet.data.properties?.title ?? '';
      sheetCount = spreadsheet.data.sheets?.length ?? 0;
      console.info('[googleSheets] step spreadsheets_get_ok', { spreadsheetTitle, sheetCount });
    } catch (metaErr) {
      console.warn('[googleSheets] spreadsheets.get failed (xlsx format?), continuing with values-only ops', metaErr);
    }

    // SalesRaw への生データ書き込み（シートが存在しない場合は警告のみ）
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SALES_RAW_SHEET_NAME}!A1:H1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [['date', 'venueName', 'agencyName', 'amount', 'createdAt', 'saleId', 'tenantId', 'eventId']],
        },
      });
      await sheets.spreadsheets.values.batchClear({
        spreadsheetId,
        requestBody: { ranges: [`${SALES_RAW_SHEET_NAME}!A2:H`] },
      });
      if (payload.records.length > 0) {
        const rawValues = payload.records.map((r) => [
          r.date, r.venueName, r.agencyName, r.amount,
          r.createdAt, r.saleId, r.tenantId, r.eventId,
        ]);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SALES_RAW_SHEET_NAME}!A2:H${payload.records.length + 1}`,
          valueInputOption: 'RAW',
          requestBody: { values: rawValues },
        });
      }
      console.info('[googleSheets] step salesraw_written', { rows: payload.records.length });
    } catch (rawErr) {
      console.warn('[googleSheets] SalesRaw write failed (sheet may not exist on xlsx)', rawErr);
    }

    // --- 集計データをコードで計算してシート2に直接書き込む ---
    // xlsx形式でも動作する values.batchUpdate のみ使用

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear = curMonth === 1 ? curYear - 1 : curYear;
    const curLabel = `${curYear}年${curMonth}月`;
    const prevLabel = `${prevYear}年${prevMonth}月`;

    const curRecs = payload.records.filter((r) => {
      const d = new Date(r.date);
      return d.getFullYear() === curYear && d.getMonth() + 1 === curMonth;
    });
    const prevRecs = payload.records.filter((r) => {
      const d = new Date(r.date);
      return d.getFullYear() === prevYear && d.getMonth() + 1 === prevMonth;
    });

    // 代理店別当月累計
    const agencyCurMap = new Map<string, number>();
    curRecs.forEach((r) => agencyCurMap.set(r.agencyName, (agencyCurMap.get(r.agencyName) ?? 0) + r.amount));
    const agencyCurRows: (string | number)[][] = Array.from(agencyCurMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => [name, total]);

    // 代理店別前月累計
    const agencyPrevMap = new Map<string, number>();
    prevRecs.forEach((r) => agencyPrevMap.set(r.agencyName, (agencyPrevMap.get(r.agencyName) ?? 0) + r.amount));
    const agencyPrevRows: (string | number)[][] = Array.from(agencyPrevMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => [name, total]);

    // 会場別 日次平均売上（全期間）
    const venueMap = new Map<string, { sum: number; count: number }>();
    payload.records.forEach((r) => {
      const v = venueMap.get(r.venueName) ?? { sum: 0, count: 0 };
      v.sum += r.amount;
      v.count += 1;
      venueMap.set(r.venueName, v);
    });
    const venueRows: (string | number)[][] = Array.from(venueMap.entries())
      .map(([name, { sum, count }]) => [name, Math.round(sum / count), count])
      .sort((a, b) => (b[1] as number) - (a[1] as number));

    // イベント別 日次売上明細（当月、日付×会場×代理店）
    const eventKeyMap = new Map<string, { date: string; venue: string; agency: string; amount: number }>();
    curRecs.forEach((r) => {
      const key = `${r.date}|${r.venueName}|${r.agencyName}`;
      const entry = eventKeyMap.get(key) ?? { date: r.date, venue: r.venueName, agency: r.agencyName, amount: 0 };
      entry.amount += r.amount;
      eventKeyMap.set(key, entry);
    });
    const eventRows: (string | number)[][] = Array.from(eventKeyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date) || a.venue.localeCompare(b.venue))
      .map(({ date, venue, agency, amount }) => [date, venue, agency, amount]);

    const curTotal = agencyCurRows.reduce((s, r) => s + (r[1] as number), 0);

    // シート2をクリアしてから書き込む
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId,
      requestBody: { ranges: [`${sheetName}!A1:Z200`] },
    });

    const summaryData = [
      { range: `${sheetName}!A1`, values: [['売上集計レポート（月次管理用）']] },
      { range: `${sheetName}!A2`, values: [[`最終同期: ${payload.syncedAt}`]] },
      { range: `${sheetName}!A3`, values: [[`${curLabel} 合計`, curTotal]] },
      { range: `${sheetName}!A5`, values: [[`■ 代理店別 累計売上（${curLabel}）`]] },
      { range: `${sheetName}!A6`, values: [['代理店', '当月累計売上'], ...agencyCurRows] },
      { range: `${sheetName}!D5`, values: [[`■ 代理店別 累計売上（${prevLabel}）`]] },
      { range: `${sheetName}!D6`, values: [['代理店', '前月累計売上'], ...agencyPrevRows] },
      { range: `${sheetName}!A28`, values: [['■ 会場別 日次平均売上（全期間）']] },
      { range: `${sheetName}!A29`, values: [['会場', '日次平均', '入力件数'], ...venueRows] },
      { range: `${sheetName}!D28`, values: [[`■ イベント別 日次売上（${curLabel}）`]] },
      { range: `${sheetName}!D29`, values: [['日付', '会場', '代理店', '売上'], ...eventRows] },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      valueInputOption: 'USER_ENTERED',
      requestBody: { data: summaryData },
    });
    console.info('[googleSheets] step summary_written', { sheetName, agencyCount: agencyCurRows.length, venueCount: venueRows.length });

    return { spreadsheetTitle, sheetCount };
  } catch (error) {
    console.warn('[googleSheets] syncSalesToSheets failed', error);
    throw error;
  }
}
