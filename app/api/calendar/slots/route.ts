import { NextRequest, NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/google/calendar";
import { logger } from "@/lib/logger";
import type { Language } from "@/types";

// ============================================================
// GET /api/calendar/slots
//
// Returns available booking slots.
// Called by Vapi function tool during live calls — must be fast.
// Also usable from the dashboard or a self-serve booking page.
//
// Query params:
//   language: en | es | pt (default: en)
//   lead_id: (optional) for logging
// ============================================================

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const language = (searchParams.get("language") ?? "en") as Language;
  const lead_id = searchParams.get("lead_id") ?? undefined;

  try {
    const slots = await getAvailableSlots({ language, lead_id });
    return NextResponse.json({ slots });
  } catch (e) {
    logger.error("Failed to get calendar slots", {
      lead_id,
      error: String(e),
      channel: "calendar",
    });
    return NextResponse.json(
      { error: "Failed to fetch available slots" },
      { status: 500 }
    );
  }
}
