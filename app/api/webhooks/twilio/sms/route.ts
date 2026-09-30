import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { validateTwilioSignature, normalisePhone } from "@/lib/twilio/client";
import { ingestLead, sendAutoReply, queueOutboundCall } from "@/lib/leads/pipeline";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

// ============================================================
// POST /api/webhooks/twilio/sms
//
// Twilio webhook — fires when an SMS arrives on +61744287400
//
// Twilio setup (in Twilio console):
//   Phone Numbers → +61744287400 → Messaging → Webhook:
//   URL: https://your-app.vercel.app/api/webhooks/twilio/sms
//   Method: HTTP POST
// ============================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const env = getEnv();

  // 1. Parse form-encoded body from Twilio
  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const {
    From: rawFrom,
    Body: body,
    MessageSid: messageSid,
    AccountSid: accountSid,
  } = params;

  // 2. Validate Twilio signature to prevent spoofed requests
  const signature = req.headers.get("x-twilio-signature") ?? "";
  const webhookUrl = `${env.APP_URL}/api/webhooks/twilio/sms`;

  if (!validateTwilioSignature({ url: webhookUrl, params, signature })) {
    logger.warn("Invalid Twilio signature on SMS webhook", {
      channel: "sms",
      from: rawFrom,
    });
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 3. Validate Twilio account SID matches ours
  if (accountSid !== env.TWILIO_ACCOUNT_SID) {
    logger.warn("Twilio account SID mismatch", { received: accountSid });
    return new NextResponse("Forbidden", { status: 403 });
  }

  // 4. Idempotency check — reject duplicate deliveries
  const db = createServiceClient();
  const { data: existing } = await db
    .from("webhook_events")
    .select("id")
    .eq("provider", "twilio")
    .eq("event_id", messageSid)
    .single();

  if (existing) {
    logger.info("Duplicate Twilio SMS webhook — skipping", {
      channel: "sms",
      event_id: messageSid,
    });
    return twimlOk(); // Must return 200 to Twilio or it retries
  }

  // Record the event
  await db.from("webhook_events").insert({
    provider: "twilio",
    event_id: messageSid,
    payload: params,
  });

  logger.info("Inbound SMS received", {
    channel: "sms",
    from: rawFrom,
    body_preview: body?.slice(0, 50),
  });

  // 5. Check feature flag
  if (!env.FEATURE_SMS_INBOUND) {
    logger.info("SMS inbound feature disabled");
    return twimlOk();
  }

  // 6. Normalise phone
  const phone = normalisePhone(rawFrom ?? "");
  if (!phone) {
    logger.warn("Could not normalise sender phone", { raw: rawFrom });
    return twimlOk();
  }

  // 7. Run ingestion pipeline after response using Next.js `after()`
  // `after()` runs post-response so Twilio gets 200 immediately.
  // The call triggers within ~10s of SMS landing — well within the 60-90s target.
  // Phase 3 will add QStash for configurable delay scheduling.
  after(async () => {
    await ingestAndCall({ phone, body: body ?? "", messageSid }).catch((e) => {
      logger.error("Pipeline error after SMS ingest", {
        channel: "sms",
        error: String(e),
        from: rawFrom,
      });
    });
  });

  return twimlOk();
}

async function ingestAndCall(opts: {
  phone: string;
  body: string;
  messageSid: string;
}): Promise<void> {
  const { phone, body } = opts;
  const env = getEnv();

  // Parse name from the message body if possible
  // Simple heuristic: "Hi, I'm John" / "Hola, soy Juan"
  let name: string | undefined;
  const nameMatch = body.match(/(?:I'm|I am|soy|me llamo|meu nome é|sou)\s+([A-Z][a-z]+)/i);
  if (nameMatch?.[1]) {
    name = nameMatch[1];
  }

  const lead = await ingestLead({
    name,
    phone,
    source: "sms",
    raw_payload: { body, phone },
    problem: body.slice(0, 500), // Use SMS text as initial problem description
  });

  // Send auto-reply immediately
  await sendAutoReply(lead);

  // Queue outbound call
  await queueOutboundCall(lead);

  // Trigger the call after a short delay (60 seconds)
  // Using setTimeout here — in production, use Upstash QStash for reliability
  // See: POST /api/jobs/trigger-call for the QStash-compatible endpoint
  if (env.FEATURE_VAPI_CALLS) {
    const { initiateVapiCall } = await import("@/lib/leads/pipeline");
    await initiateVapiCall(lead).catch((e) => {
      logger.error("Vapi call trigger failed", {
        lead_id: lead.id,
        error: String(e),
      });
    });
  }
}

// Returns a valid empty TwiML response (200 OK, no SMS reply)
function twimlOk(): NextResponse {
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    }
  );
}
