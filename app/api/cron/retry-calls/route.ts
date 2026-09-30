import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { initiateVapiCall } from "@/lib/leads/pipeline";
import { logger } from "@/lib/logger";

// ============================================================
// GET /api/cron/retry-calls
//
// Picks up leads with next_call_attempt in the past and calls them.
// Runs every 30 minutes via Vercel Cron.
//
// vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/retry-calls",
//     "schedule": "*/30 * * * *"
//   }]
// }
//
// Secured by Vercel's CRON_SECRET header (set automatically).
// ============================================================

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env["CRON_SECRET"];

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.warn("Cron retry-calls: unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const now = new Date().toISOString();

  // Find leads due for a retry call
  const { data: leads, error } = await db
    .from("leads")
    .select("*")
    .eq("status", "call_failed")
    .lte("next_call_attempt", now)
    .not("next_call_attempt", "is", null)
    .limit(10); // Process max 10 per run to avoid timeouts

  if (error) {
    logger.error("Cron retry-calls: DB query failed", { error: error.message });
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  const results = { processed: 0, errors: 0 };

  for (const lead of leads ?? []) {
    try {
      await initiateVapiCall(lead);
      results.processed++;
    } catch (e) {
      results.errors++;
      logger.error("Cron retry call failed", {
        lead_id: lead.id,
        error: String(e),
      });
    }
  }

  logger.info("Cron retry-calls completed", results);
  return NextResponse.json(results);
}
