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

export async function syncSalesToSheets(payload: SyncSalesPayload) {
  let googleApis: any;
  try {
    googleApis = await import('googleapis');
  } catch (error) {
    console.warn('[googleSheets] googleapis not available', error);
    return;
  }

  const { google } = googleApis;
  const spreadsheetId = payload.spreadsheetId ?? getSheetsSpreadsheetId();
  const sheetName = payload.dashboardSheetName ?? getSheetName();
  const serviceAccount = getServiceAccount();
  const scope = getSheetsScope();

  if (!spreadsheetId || !sheetName || !serviceAccount) {
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

    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties.title',
    });
    const existingTitles = new Set(
      (spreadsheet.data.sheets ?? []).map((sheet) => sheet.properties?.title).filter(Boolean),
    );

    const requests = [];
    if (!existingTitles.has(SALES_RAW_SHEET_NAME)) {
      requests.push({ addSheet: { properties: { title: SALES_RAW_SHEET_NAME } } });
    }
    if (!existingTitles.has(sheetName)) {
      requests.push({ addSheet: { properties: { title: sheetName } } });
    }
    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
    }

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
      requestBody: {
        ranges: [`${SALES_RAW_SHEET_NAME}!A2:H`],
      },
    });

    if (payload.records.length > 0) {
      const values = payload.records.map((record) => [
        record.date,
        record.venueName,
        record.agencyName,
        record.amount,
        record.createdAt,
        record.saleId,
        record.tenantId,
        record.eventId,
      ]);
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SALES_RAW_SHEET_NAME}!A2:H${payload.records.length + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values },
      });
    }

    const agencyMonthlyQuery = `=QUERY(SalesRaw!A:D,"select C, sum(D), avg(D) where A >= date '"&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd")&"' and A <= date '"&TEXT(EOMONTH(TODAY(),0),"yyyy-mm-dd")&"' group by C label C '代理店', sum(D) '当月累計', avg(D) '平均(当月)'", 1)`;
    const venueDailyAverageQuery = `=QUERY(SalesRaw!A:D,"select A, B, avg(D) where A is not null group by A, B order by A desc label A '日付', B '会場', avg(D) '日次平均'", 1)`;

    const dashboardUpdates = [
      {
        range: `${sheetName}!A1`,
        values: [['Sales Dashboard']],
      },
      {
        range: `${sheetName}!A3:B7`,
        values: [
          [
            '今月の累計売上',
            '=SUM(FILTER(SalesRaw!D:D, SalesRaw!A:A>=EOMONTH(TODAY(),-1)+1, SalesRaw!A:A<=EOMONTH(TODAY(),0)))',
          ],
          [
            '代理店平均（当月）',
            '=AVERAGE(FILTER(SalesRaw!D:D, SalesRaw!A:A>=EOMONTH(TODAY(),-1)+1, SalesRaw!A:A<=EOMONTH(TODAY(),0)))',
          ],
          ['代理店単位 当月累計（一覧は右）', ''],
          ['会場単位 日次平均（一覧は下）', ''],
          ['最終同期', payload.syncedAt],
        ],
      },
      {
        range: `${sheetName}!D2:F2`,
        values: [['代理店', '当月累計', '平均(当月)']],
      },
      {
        range: `${sheetName}!D3`,
        values: [[agencyMonthlyQuery]],
      },
      {
        range: `${sheetName}!D11:F11`,
        values: [['日付', '会場', '日次平均']],
      },
      {
        range: `${sheetName}!D12`,
        values: [[venueDailyAverageQuery]],
      },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        data: dashboardUpdates,
      },
    });
  } catch (error) {
    console.warn('[googleSheets] syncSalesToSheets failed', error);
  }
}
