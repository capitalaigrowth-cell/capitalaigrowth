import { NextRequest, NextResponse } from "next/server";
import { createSessionClient } from "@/lib/supabase/server";
import { getOrCreateAssistant, updateAssistant } from "@/lib/vapi/client";
import { ensureHeaderRow } from "@/lib/google/sheets";
import { logger } from "@/lib/logger";

// ============================================================
// POST /api/vapi/setup
//
// One-time setup endpoint — run this ONCE after deployment:
//   curl -X POST https://your-app.vercel.app/api/vapi/setup \
//     -H "Cookie: <your-auth-cookie>"
//
// What it does:
//   1. Creates (or finds) the Vapi assistant
//   2. Ensures the Google Sheet has a header row
//   3. Returns the assistant ID to save in VAPI_ASSISTANT_ID
//
// Auth required — must be logged in as Andy.
// ============================================================

export async function POST(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // 1. Create/verify Vapi assistant
  try {
    const assistantId = await getOrCreateAssistant();
    results.vapi_assistant_id = assistantId;
    results.vapi_status = "ok";
    logger.info("Setup: Vapi assistant ready", { assistantId });
  } catch (e) {
    results.vapi_status = "error";
    results.vapi_error = String(e);
    logger.error("Setup: Vapi assistant creation failed", { error: String(e) });
  }

  // 2. Ensure Google Sheet header row
  try {
    await ensureHeaderRow();
    results.sheet_status = "ok";
    logger.info("Setup: Google Sheet header row ready");
  } catch (e) {
    results.sheet_status = "error";
    results.sheet_error = String(e);
    logger.error("Setup: Google Sheet setup failed", { error: String(e) });
  }

  logger.info("Setup completed", results);

  return NextResponse.json({
    setup: results,
    next_steps: results.vapi_assistant_id
      ? [
          `✅ Save this to Vercel env vars: VAPI_ASSISTANT_ID=${results.vapi_assistant_id}`,
          "✅ Redeploy after saving the env var",
          "✅ Test with an SMS to +61744287400",
        ]
      : ["❌ Vapi setup failed — check VAPI_API_KEY and APP_URL env vars"],
  });
}

// GET — update existing assistant config (call after changing APP_URL)
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const supabase = await createSessionClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const assistantId = await getOrCreateAssistant();
    await updateAssistant(assistantId);
    return NextResponse.json({ updated: true, assistantId });
  } catch (e) {
    logger.error("Assistant update failed", { error: String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
