import { google } from "googleapis";
import { getEnv } from "@/lib/env";

// ============================================================
// Google API authentication via service account
// The service account must be:
//   1. Created in Google Cloud Console
//   2. Given "Editor" access to the target Google Calendar
//   3. Given "Editor" access to the target Google Sheet
// ============================================================

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
];

let _auth: InstanceType<typeof google.auth.JWT> | null = null;

export function getGoogleAuth() {
  if (!_auth) {
    const env = getEnv();

    // Private key may have escaped \n — unescape for actual newlines
    const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(
      /\\n/g,
      "\n"
    );

    _auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: SCOPES,
    });
  }
  return _auth;
}
