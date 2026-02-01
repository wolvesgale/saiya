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

function columnToLetter(column: number) {
  let temp = column;
  let letter = '';
  while (temp > 0) {
    const modulo = (temp - 1) % 26;
    letter = String.fromCharCode(65 + modulo) + letter;
    temp = Math.floor((temp - modulo) / 26);
  }
  return letter;
}

export async function appendDailySales(agencyName: string, venueName: string, date: Date, amount: number) {
  const moduleName = 'googleapis';
  let googleApis: any;
  try {
    googleApis = await import(moduleName);
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

  const agencyRowIndex = 3;
  const agencyRow = values[agencyRowIndex] ?? [];
  const agencyColumnIndex = agencyRow.findIndex((cell: string) => cell === agencyName);
  if (agencyColumnIndex < 0) {
    console.warn('[googleSheets] agency column not found', agencyName);
    return;
  }

  const weekIndex = getWeekIndex(date);
  const startRow = 6 + weekIndex * 7;
  const endRow = startRow + 6;
  let venueRowIndex = -1;
  for (let row = startRow; row <= endRow; row += 1) {
    const rowData = values[row - 1] ?? [];
    if (rowData[agencyColumnIndex] === venueName) {
      venueRowIndex = row;
      break;
    }
  }
  if (venueRowIndex < 0) {
    console.warn('[googleSheets] venue row not found', venueName);
    return;
  }

  const columnLetter = columnToLetter(agencyColumnIndex + 1);
  const cellRange = `${sheetName}!${columnLetter}${venueRowIndex}`;
  const currentValue = toNumber((values[venueRowIndex - 1] ?? [])[agencyColumnIndex]);
  const updatedValue = currentValue + amount;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: cellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[updatedValue]] },
  });

  const summaryColumnLetter = 'B';
  const summaryCellRange = `${sheetName}!${summaryColumnLetter}${venueRowIndex}`;
  const summaryCurrentValue = toNumber((values[venueRowIndex - 1] ?? [])[1]);
  const summaryUpdatedValue = summaryCurrentValue + amount;

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: summaryCellRange,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[summaryUpdatedValue]] },
  });
}
