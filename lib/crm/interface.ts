import type { CrmRow } from "@/types";

// ============================================================
// CRM adapter interface
// All destinations (Sheets, HubSpot, Pipedrive, Airtable, webhook)
// implement this interface. Swap via CRM_DESTINATION env var — no code changes.
// ============================================================

export interface CrmAdapter {
  // Called when a new lead is first created
  upsertLead(row: CrmRow, lead_id: string): Promise<void>;

  // Called when any field on the lead changes (status, score, booking, outcome)
  updateLead(phone: string, updates: Partial<CrmRow>, lead_id: string): Promise<void>;
}
