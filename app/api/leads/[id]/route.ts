import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createSessionClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

// ============================================================
// GET   /api/leads/[id]  — Get single lead with calls + bookings
// PATCH /api/leads/[id]  — Update lead (outcome tagging, notes)
// ============================================================

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const [leadResult, callsResult, bookingsResult] = await Promise.all([
    db.from("leads").select("*").eq("id", id).single(),
    db.from("calls").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    db.from("bookings").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);

  if (leadResult.error || !leadResult.data) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead: leadResult.data,
    calls: callsResult.data ?? [],
    bookings: bookingsResult.data ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let updates: Record<string, unknown>;
  try {
    updates = (await req.json()) as typeof updates;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Whitelist updatable fields
  const allowed = new Set([
    "status",
    "name",
    "email",
    "business",
    "problem",
    "qualification_score",
    "booking_time",
  ]);

  const safe: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (allowed.has(key)) safe[key] = val;
  }

  if (Object.keys(safe).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("leads")
    .update(safe)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    logger.error("Lead update failed", { lead_id: id, error: error.message });
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ lead: data });
}
