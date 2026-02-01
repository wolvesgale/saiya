function getServiceAccount() {
  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!encoded) return null;
  const json = Buffer.from(encoded, 'base64').toString('utf-8');
  return JSON.parse(json);
}

function getSheetName() {
  return process.env.SHEET_MONTHLY_SALES_NAME;
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
    googleApis = await (0, eval)('import("googleapis")');
  } catch (error) {
    console.warn('[googleSheets] googleapis not available', error);
    return;
  }
  const { google } = googleApis;
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = getSheetName();
  const serviceAccount = getServiceAccount();
  const scope = process.env.GOOGLE_SHEETS_SCOPE ?? 'https://www.googleapis.com/auth/spreadsheets';

  if (!sheetId || !sheetName || !serviceAccount) {
    console.warn('[googleSheets] missing environment configuration');
    return;
  }

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
}
