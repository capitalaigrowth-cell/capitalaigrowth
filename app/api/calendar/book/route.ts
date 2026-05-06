import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processBooking } from "@/lib/leads/pipeline";
import { logger } from "@/lib/logger";

// ============================================================
// POST /api/calendar/book
//
// Creates a booking for a lead.
// Called by Vapi function tool during live calls.
// Body: { lead_id, slot_id, lead_name? }
// ============================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { lead_id?: string; slot_id?: string; lead_name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { lead_id, slot_id, lead_name } = body;

  if (!lead_id || !slot_id) {
    return NextResponse.json(
      { error: "lead_id and slot_id are required" },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  const { data: lead, error } = await db
    .from("leads")
    .select("*")
    .eq("id", lead_id)
    .single();

  if (error || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead_name && !lead.name) {
    await db.from("leads").update({ name: lead_name }).eq("id", lead_id);
    lead.name = lead_name;
  }

  try {
    await processBooking({ lead, slot_iso: slot_id });
    return NextResponse.json({ success: true, booking_time: slot_id });
  } catch (e) {
    logger.error("Booking failed", { lead_id, slot_id, error: String(e) });
    return NextResponse.json({ error: "Booking failed" }, { status: 500 });
  }
}
