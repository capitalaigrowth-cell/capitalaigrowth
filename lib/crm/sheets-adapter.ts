import { appendLeadRow, updateLeadRow } from "@/lib/google/sheets";
import type { CrmAdapter } from "./interface";
import type { CrmRow } from "@/types";

// ============================================================
// Google Sheets CRM adapter
// Default destination for Phase 1
// ============================================================

export class SheetsAdapter implements CrmAdapter {
  async upsertLead(row: CrmRow, lead_id: string): Promise<void> {
    await appendLeadRow(row, lead_id);
  }

  async updateLead(
    phone: string,
    updates: Partial<CrmRow>,
    lead_id: string
  ): Promise<void> {
    await updateLeadRow(phone, updates, lead_id);
  }
}
