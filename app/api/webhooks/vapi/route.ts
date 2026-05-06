import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { validateVapiSignature } from "@/lib/vapi/client";
import { processCallEnded, processBooking } from "@/lib/leads/pipeline";
import { getAvailableSlots } from "@/lib/google/calendar";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { VapiWebhookPayload, Language } from "@/types";

// ============================================================
// POST /api/webhooks/vapi
//
// Vapi webhook — receives all call lifecycle events:
//   - call-started
//   - end-of-call-report (transcript, recording, summary)
//   - function-call (get_available_slots, book_appointment)
//   - transcript (real-time, ignored for now)
//
// Configured in the Vapi assistant as serverUrl
// ============================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  // Validate signature if secret is configured
  const signature = req.headers.get("x-vapi-signature");
  if (!(await validateVapiSignature(rawBody, signature))) {
    logger.warn("Invalid Vapi webhook signature");
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: VapiWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as VapiWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message } = payload;

  logger.info("Vapi webhook received", {
    channel: "vapi",
    type: message.type,
    call_id: "call" in message ? message.call.id : undefined,
  });

  // Route by message type
  switch (message.type) {
    case "call-started":
      return handleCallStarted(message.call.id);

    case "end-of-call-report":
      return handleCallEnded(message);

    case "function-call":
      return handleFunctionCall(message);

    case "transcript":
      // Real-time transcript — ignore for now (Phase 3 feature)
      return NextResponse.json({ ok: true });

    default:
      logger.warn("Unknown Vapi message type", { type: (message as { type: string }).type });
      return NextResponse.json({ ok: true });
  }
}

// ── call-started ──────────────────────────────────────────────
async function handleCallStarted(callId: string): Promise<NextResponse> {
  const db = createServiceClient();

  await db
    .from("calls")
    .update({ status: "in_progress", started_at: new Date().toISOString() })
    .eq("vapi_call_id", callId);

  logger.info("Call started", { call_id: callId, channel: "vapi" });
  return NextResponse.json({ ok: true });
}

// ── end-of-call-report ────────────────────────────────────────
async function handleCallEnded(
  message: Extract<VapiWebhookPayload["message"], { type: "end-of-call-report" }>
): Promise<NextResponse> {
  const { call, artifact, endedReason } = message;
  const db = createServiceClient();

  // Idempotency check
  const { data: existing } = await db
    .from("webhook_events")
    .select("id")
    .eq("provider", "vapi")
    .eq("event_id", `end-${call.id}`)
    .single();

  if (existing) {
    logger.info("Duplicate Vapi end-of-call webhook — skipping", { call_id: call.id });
    return NextResponse.json({ ok: true });
  }

  await db.from("webhook_events").insert({
    provider: "vapi",
    event_id: `end-${call.id}`,
    payload: { call_id: call.id, endedReason },
  });

  // Run pipeline processing async
  processCallEnded({
    vapi_call_id: call.id,
    transcript: artifact.transcript ?? "",
    recording_url: artifact.recordingUrl,
    ended_reason: endedReason,
    call_metadata: call.metadata,
  }).catch((e) => {
    logger.error("processCallEnded failed", {
      call_id: call.id,
      error: String(e),
    });
  });

  return NextResponse.json({ ok: true });
}

// ── function-call ─────────────────────────────────────────────
// Vapi calls this synchronously during the call — must respond quickly
async function handleFunctionCall(
  message: Extract<VapiWebhookPayload["message"], { type: "function-call" }>
): Promise<NextResponse> {
  const { call, functionCall } = message;
  const { name, parameters } = functionCall;

  logger.info("Vapi function call", {
    channel: "vapi",
    call_id: call.id,
    function: name,
  });

  // Get lead context from call metadata
  const metadata = call.metadata ?? {};
  const lead_id = String(metadata.lead_id ?? "");
  const language = (String(metadata.language ?? "en") as Language) || "en";

  switch (name) {
    case "get_available_slots": {
      const slots = await getAvailableSlots({ language, lead_id });

      if (slots.length === 0) {
        return NextResponse.json({
          result: JSON.stringify({
            message:
              language === "es"
                ? "No hay horarios disponibles en los próximos 3 días. Déjame tomar tu número para que Andy te contacte personalmente."
                : language === "pt"
                  ? "Não há horários disponíveis nos próximos 3 dias. Deixe-me anotar seu número para Andy entrar em contato pessoalmente."
                  : "No slots are available in the next 3 days. Let me take your details and Andy will reach out personally.",
            slots: [],
          }),
        });
      }

      return NextResponse.json({
        result: JSON.stringify({ slots }),
      });
    }

    case "book_appointment": {
      const { slot_id, lead_name } = parameters as {
        slot_id?: string;
        lead_name?: string;
      };

      if (!slot_id) {
        return NextResponse.json({
          result: JSON.stringify({ error: "slot_id is required" }),
        });
      }

      // Get the lead from DB
      const db = createServiceClient();
      const { data: lead } = await db
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (!lead) {
        logger.warn("book_appointment: lead not found", { lead_id, call_id: call.id });
        return NextResponse.json({
          result: JSON.stringify({ error: "Lead not found" }),
        });
      }

      // Update name if provided during call
      if (lead_name && !lead.name) {
        await db.from("leads").update({ name: lead_name }).eq("id", lead_id);
        lead.name = lead_name;
      }

      // Process the booking
      try {
        await processBooking({
          lead,
          slot_iso: slot_id,
        });

        const env = getEnv();
        const bookingDate = new Date(slot_id);
        const timeLabel = bookingDate.toLocaleString(
          language === "es" ? "es" : language === "pt" ? "pt-BR" : "en-AU",
          {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
            timeZone: env.TIMEZONE,
          }
        );

        return NextResponse.json({
          result: JSON.stringify({
            success: true,
            booking_time: slot_id,
            booking_time_label: timeLabel,
            message:
              language === "es"
                ? `¡Perfecto! Tu llamada está confirmada para el ${timeLabel}, hora de Brisbane. Recibirás una confirmación por SMS en breve.`
                : language === "pt"
                  ? `Perfeito! Sua chamada está confirmada para ${timeLabel}, horário de Brisbane. Você receberá uma confirmação por SMS em breve.`
                  : `Perfect! Your call is confirmed for ${timeLabel} Brisbane time. You'll receive an SMS confirmation shortly.`,
          }),
        });
      } catch (e) {
        logger.error("book_appointment failed", {
          lead_id,
          slot_id,
          error: String(e),
        });
        return NextResponse.json({
          result: JSON.stringify({
            error: "Booking failed — please try another slot",
          }),
        });
      }
    }

    default:
      logger.warn("Unknown Vapi function", { name, call_id: call.id });
      return NextResponse.json({
        result: JSON.stringify({ error: `Unknown function: ${name}` }),
      });
  }
}
