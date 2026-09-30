import { getEnv } from "@/lib/env";
import { SheetsAdapter } from "./sheets-adapter";
import type { CrmAdapter } from "./interface";

// ============================================================
// CRM adapter factory
// Returns the configured adapter based on CRM_DESTINATION env var
// Add new adapters here — no other code changes needed
// ============================================================

let _adapter: CrmAdapter | null = null;

export function getCrmAdapter(): CrmAdapter {
  if (_adapter) return _adapter;

  const destination = getEnv().CRM_DESTINATION;

  switch (destination) {
    case "google_sheets":
      _adapter = new SheetsAdapter();
      break;

    // Phase 5: HubSpot, Pipedrive, Airtable adapters go here
    // case "hubspot": _adapter = new HubSpotAdapter(); break;
    // case "pipedrive": _adapter = new PipedriveAdapter(); break;
    // case "airtable": _adapter = new AirtableAdapter(); break;
    // case "webhook": _adapter = new WebhookAdapter(); break;

    default:
      _adapter = new SheetsAdapter();
  }

  return _adapter;
}

export type { CrmAdapter };
