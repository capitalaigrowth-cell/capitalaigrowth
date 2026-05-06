import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ingestLead, sendAutoReply, queueOutboundCall, initiateVapiCall } from "@/lib/leads/pipeline";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { InboundLead } from "@/types";

// ============================================================
// POST /api/webhooks/generic
//
// Accepts leads from: Typeform, GoDaddy forms, LinkedIn Lead Gen,
// Meta Lead Ads, and any other source that can POST JSON.
//
// Expected body (all optional except source):
// {
//   source: "typeform" | "linkedin" | "meta" | "godaddy" | string,
//   name?: string,
//   phone?: string,
//   email?: string,
//   business?: string,
//   problem?: string,
//   language_hint?: "en" | "es" | "pt",
//   event_id?: string,  // For idempotency
//   [any other fields]  // Stored in raw_payload
// }
//
// Auth: secret key in X-Webhook-Secret header
// Set WEBHOOK_SECRET in env vars (any random string you choose)
// ============================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Validate webhook secret
  const env = getEnv();
  const webhookSecret = process.env["WEBHOOK_SECRET"];
  if (webhookSecret) {
    const provided = req.headers.get("x-webhook-secret");
    if (provided !== webhookSecret) {
      logger.warn("Generic webhook: invalid secret");
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source = String(body["source"] ?? "webhook");
  const eventId = String(body["event_id"] ?? `${source}-${Date.now()}`);

  // Idempotency
  const db = createServiceClient();
  const { data: existing } = await db
    .from("webhook_events")
    .select("id")
    .eq("provider", source)
    .eq("event_id", eventId)
    .single();

  if (existing) {
    logger.info("Duplicate generic webhook — skipping", { source, event_id: eventId });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await db.from("webhook_events").insert({
    provider: source,
    event_id: eventId,
    payload: body,
  });

  // Normalise to InboundLead schema
  const inbound: InboundLead = {
    name: stringify(body["name"] ?? body["full_name"] ?? body["first_name"]),
    phone: stringify(body["phone"] ?? body["phone_number"] ?? body["mobile"]),
    email: stringify(body["email"] ?? body["email_address"]),
    source: source as InboundLead["source"],
    language_hint: (body["language_hint"] as InboundLead["language_hint"]) ?? undefined,
    business: stringify(body["business"] ?? body["company"] ?? body["organisation"]),
    problem: stringify(body["problem"] ?? body["message"] ?? body["pain_point"] ?? body["notes"]),
    raw_payload: body,
  };

  logger.info("Generic webhook received", {
    channel: "webhook",
    source,
    has_phone: !!inbound.phone,
    has_email: !!inbound.email,
  });

  // Run pipeline
  try {
    const lead = await ingestLead(inbound);

    if (inbound.phone) {
      await sendAutoReply(lead);
      await queueOutboundCall(lead);

      if (env.FEATURE_VAPI_CALLS) {
        after(async () => {
          await initiateVapiCall(lead).catch((e) =>
            logger.error("Call trigger failed from generic webhook", {
              lead_id: lead.id,
              error: String(e),
            })
          );
        });
      }
    }

    return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201 });
  } catch (e) {
    logger.error("Generic webhook pipeline failed", { error: String(e), source });
    return NextResponse.json({ error: "Pipeline error" }, { status: 500 });
  }
}

function stringify(val: unknown): string | undefined {
  if (val == null) return undefined;
  const s = String(val).trim();
  return s.length > 0 ? s : undefined;
}
