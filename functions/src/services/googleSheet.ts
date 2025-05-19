import { google } from "googleapis";
import { authenticate } from "@google-cloud/local-auth";
import path from "path";
import fs from "fs/promises";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "google-sheet-bolton.json");

const loadSavedCredentialsIfExist = async () => {
  try {
    const content: any = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
};

const saveCredentials = async (client: any): Promise<void> => {
  const content: any = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  console.log("Saving credentials to token.json");
  try {
    await fs.writeFile(TOKEN_PATH, payload);
  } catch (err) {
    console.error("Error saving credentials:", err);
  }
};

export const googleAuthorize = async () => {
  let client: any = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
};

export interface SheetRow {
  [key: string]: string | number | boolean;
}

export const searchRowsInSheet = async (
  spreadsheetId: string,
  range: string,
  searchValue: string,
  columnIndex: number
): Promise<{ row: SheetRow[]; index: number }> => {
  try {
    const auth = await googleAuthorize();

    const sheets = google.sheets({ version: "v4", auth });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    const rows = response.data.values || [];

    const foundRowIndex = rows.findIndex(
      (row) => row[columnIndex] === searchValue
    );
    if (foundRowIndex === -1) {
      return { row: [], index: -1 };
    }
    const foundRow = rows[foundRowIndex];

    return { row: foundRow, index: foundRowIndex };
  } catch (error) {
    console.error("Error searching rows in sheet:", error);
    throw error;
  }
};

export const updateRowInSheet = async (
  spreadsheetId: string,
  range: string,
  values: SheetRow,
): Promise<void> => {
  try {
    const auth = await googleAuthorize();

    const sheets = google.sheets({ version: "v4", auth });

    const rowValues = Object.values(values);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [rowValues],
      },
    });

    console.log("Successfully updated row in sheet");
  } catch (error) {
    console.error("Error updating row in sheet:", error);
    throw error;
  }
}

export const appendRowToSheet = async (
  spreadsheetId: string,
  range: string,
  values: SheetRow
): Promise<void> => {
  try {
    const auth = await googleAuthorize();

    const sheets = google.sheets({ version: "v4", auth });

    const rowValues = Object.values(values);

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [rowValues],
      },
    });

    console.log("Successfully added new row to sheet");
  } catch (error) {
    console.error("Error appending row to sheet:", error);
    throw error;
  }
};
