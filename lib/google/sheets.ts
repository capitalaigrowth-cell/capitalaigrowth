import { google } from "googleapis";
import { getGoogleAuth } from "./auth";
import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";
import type { CrmRow } from "@/types";

// ============================================================
// Google Sheets — append rows to the lead tracking sheet
// ============================================================

// Header row — must match CrmRow field order
export const SHEET_HEADERS: (keyof CrmRow)[] = [
  "timestamp",
  "source",
  "name",
  "phone",
  "email",
  "language",
  "business",
  "problem",
  "qualification_score",
  "transcript_url",
  "booking_status",
  "booking_time",
  "outcome",
  "next_touch_date",
  "notes",
];

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getGoogleAuth() });
}

// ── Ensure header row exists ─────────────────────────────────
// Run once on setup — idempotent
export async function ensureHeaderRow(): Promise<void> {
  const env = getEnv();
  const sheets = getSheetsClient();

  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: "A1:O1",
  });

  if (existing.data.values?.[0]?.length) {
    logger.info("Sheet header row already exists");
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: "A1",
    valueInputOption: "RAW",
    requestBody: {
      values: [SHEET_HEADERS],
    },
  });

  logger.info("Sheet header row created");
}

// ── Append a lead row ─────────────────────────────────────────
export async function appendLeadRow(
  row: CrmRow,
  lead_id?: string
): Promise<void> {
  const env = getEnv();

  return withRetry(
    async () => {
      const sheets = getSheetsClient();
      const values = SHEET_HEADERS.map((key) => row[key] ?? "");

      await sheets.spreadsheets.values.append({
        spreadsheetId: env.GOOGLE_SHEETS_ID,
        range: "A:O",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [values] },
      });

      logger.info("Lead row appended to sheet", { lead_id });
    },
    { name: "google.appendLeadRow", lead_id }
  );
}

// ── Update a row by phone number ──────────────────────────────
// Used when a lead's status changes (booked, outcome tagged, etc.)
export async function updateLeadRow(
  phone: string,
  updates: Partial<CrmRow>,
  lead_id?: string
): Promise<void> {
  const env = getEnv();

  return withRetry(
    async () => {
      const sheets = getSheetsClient();

      // Find the row with this phone number
      const allData = await sheets.spreadsheets.values.get({
        spreadsheetId: env.GOOGLE_SHEETS_ID,
        range: "A:O",
      });

      const rows = allData.data.values ?? [];
      const phoneColIndex = SHEET_HEADERS.indexOf("phone");
      const rowIndex = rows.findIndex((row) => row[phoneColIndex] === phone);

      if (rowIndex === -1) {
        logger.warn("Could not find sheet row to update", { lead_id, phone });
        return;
      }

      // Apply updates
      const updatedRow = [...(rows[rowIndex] ?? [])];
      for (const [key, value] of Object.entries(updates)) {
        const colIndex = SHEET_HEADERS.indexOf(key as keyof CrmRow);
        if (colIndex !== -1) {
          updatedRow[colIndex] = value ?? "";
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: env.GOOGLE_SHEETS_ID,
        range: `A${rowIndex + 1}:O${rowIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [updatedRow] },
      });

      logger.info("Sheet row updated", { lead_id, phone });
    },
    { name: "google.updateLeadRow", lead_id }
  );
}
