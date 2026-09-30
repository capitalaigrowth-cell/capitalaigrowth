import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createSessionClient } from "@/lib/supabase/server";
import { ingestLead } from "@/lib/leads/pipeline";
import { logger } from "@/lib/logger";
import type { InboundLead } from "@/types";

// ============================================================
// GET  /api/leads        — List leads (dashboard)
// POST /api/leads        — Manually create a lead
//
// Auth required for GET (dashboard). POST from generic webhook
// uses a different auth approach (see /api/webhooks/* routes).
// ============================================================

// ── GET — list leads for dashboard ───────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const status = searchParams.get("status");
  const source = searchParams.get("source");

  const db = createServiceClient();
  let query = db
    .from("leads")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status) query = query.eq("status", status);
  if (source) query = query.eq("source", source);

  const { data, error, count } = await query;

  if (error) {
    logger.error("Failed to fetch leads", { error: error.message });
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }

  return NextResponse.json({ leads: data, total: count, page, limit });
}

// ── POST — manual lead creation ───────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Partial<InboundLead>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.phone && !body.email) {
    return NextResponse.json(
      { error: "Either phone or email is required" },
      { status: 400 }
    );
  }

  try {
    const lead = await ingestLead({
      ...body,
      source: body.source ?? "manual",
      raw_payload: body.raw_payload ?? { manual: true, created_by: user.id },
    } as InboundLead);

    return NextResponse.json({ lead }, { status: 201 });
  } catch (e) {
    logger.error("Manual lead creation failed", { error: String(e) });
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}
