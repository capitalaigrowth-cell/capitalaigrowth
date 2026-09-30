import { createServiceClient } from "@/lib/supabase/server";
import { detectLanguage, generateAutoReply, qualifyLead, generateBookingConfirmationSms, generateNoAnswerSms } from "@/lib/anthropic/client";
import { sendSms, normalisePhone } from "@/lib/twilio/client";
import { triggerOutboundCall } from "@/lib/vapi/client";
import { createBookingEvent, buildIcsContent, getAvailableSlots } from "@/lib/google/calendar";
import { sendBookingConfirmation, sendLeadAlertToAndy, sendNoAnswerEmail } from "@/lib/resend/client";
import { getCrmAdapter } from "@/lib/crm";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { InboundLead, Language, Lead, QualificationResult } from "@/types";

// ============================================================
// Lead pipeline — the core orchestration layer
// All lead sources funnel into ingestLead(), then the same
// downstream sequence runs regardless of source.
// ============================================================

// ── Step 1: Ingest a new lead ─────────────────────────────────
export async function ingestLead(inbound: InboundLead): Promise<Lead> {
  const env = getEnv();
  const db = createServiceClient();

  // Normalise phone
  const phone = inbound.phone ? normalisePhone(inbound.phone) : null;

  // Detect language from any available text
  let language: Language = inbound.language_hint ?? "en";
  const textForDetection = [inbound.business, inbound.problem, inbound.name]
    .filter(Boolean)
    .join(" ");
  if (textForDetection.trim().length > 5) {
    try {
      language = await detectLanguage(textForDetection);
    } catch (e) {
      logger.warn("Language detection failed, defaulting to en", { error: String(e) });
    }
  }

  // Create lead record
  const { data: lead, error } = await db
    .from("leads")
    .insert({
      name: inbound.name ?? null,
      phone,
      email: inbound.email ?? null,
      source: inbound.source,
      language,
      business: inbound.business ?? null,
      problem: inbound.problem ?? null,
      raw_payload: inbound.raw_payload,
      status: "new",
    })
    .select()
    .single();

  if (error || !lead) {
    throw new Error(`Failed to create lead: ${error?.message}`);
  }

  logger.info("Lead created", {
    lead_id: lead.id,
    source: inbound.source,
    language,
    has_phone: !!phone,
  });

  // Push to CRM immediately
  if (env.FEATURE_SHEET_SYNC) {
    try {
      const crm = getCrmAdapter();
      await crm.upsertLead(
        {
          timestamp: new Date().toISOString(),
          source: inbound.source,
          name: lead.name ?? "",
          phone: phone ?? "",
          email: lead.email ?? "",
          language,
          business: lead.business ?? "",
          problem: lead.problem ?? "",
          qualification_score: "",
          transcript_url: "",
          booking_status: "new",
          booking_time: "",
          outcome: "",
          next_touch_date: "",
          notes: "",
        },
        lead.id
      );
    } catch (e) {
      logger.error("CRM upsert failed (non-fatal)", {
        lead_id: lead.id,
        error: String(e),
      });
    }
  }

  return lead as Lead;
}

// ── Step 2: Send auto-reply SMS ───────────────────────────────
export async function sendAutoReply(lead: Lead): Promise<void> {
  const env = getEnv();
  if (!env.FEATURE_SMS_INBOUND) return;
  if (!lead.phone) return;

  const message = await generateAutoReply({
    language: lead.language as Language,
    lead_name: lead.name ?? undefined,
    lead_id: lead.id,
  });

  await sendSms({ to: lead.phone, body: message, lead_id: lead.id });

  const db = createServiceClient();
  await db
    .from("leads")
    .update({ status: "auto_replied" })
    .eq("id", lead.id);
}

// ── Step 3: Queue outbound call ───────────────────────────────
// Marks lead as call_queued so cron/worker can pick it up
export async function queueOutboundCall(lead: Lead): Promise<void> {
  const db = createServiceClient();
  await db
    .from("leads")
    .update({ status: "call_queued" })
    .eq("id", lead.id);

  logger.info("Lead queued for outbound call", { lead_id: lead.id });
}

// ── Step 4: Trigger the Vapi call ────────────────────────────
export async function initiateVapiCall(lead: Lead): Promise<void> {
  const env = getEnv();
  if (!env.FEATURE_VAPI_CALLS) {
    logger.info("Vapi calls disabled by feature flag", { lead_id: lead.id });
    return;
  }
  if (!lead.phone) {
    logger.warn("Cannot initiate call — no phone number", { lead_id: lead.id });
    return;
  }

  const db = createServiceClient();

  // Check spend cap before calling
  const allowed = await checkSpendCap("vapi", lead.id);
  if (!allowed) {
    logger.error("Vapi spend cap reached — call blocked", { lead_id: lead.id });
    await sendLeadAlertToAndy({
      lead_id: lead.id,
      lead_name: lead.name ?? "Unknown",
      lead_phone: lead.phone ?? undefined,
      lead_source: lead.source,
      language: lead.language,
      ai_summary: "⚠️ SPEND CAP: Vapi monthly cap reached — call was NOT made. Manual follow-up required.",
    });
    return;
  }

  // Create call record
  const { data: callRecord } = await db
    .from("calls")
    .insert({ lead_id: lead.id, status: "initiated" })
    .select()
    .single();

  try {
    const vapiCallId = await triggerOutboundCall({
      lead_id: lead.id,
      phone: lead.phone,
      language: lead.language as Language,
      lead_name: lead.name ?? undefined,
      business: lead.business ?? undefined,
    });

    await db.from("calls").update({ vapi_call_id: vapiCallId, status: "ringing" }).eq("id", callRecord!.id);
    await db
      .from("leads")
      .update({
        status: "calling",
        vapi_call_id: vapiCallId,
        call_attempts: (lead.call_attempts ?? 0) + 1,
        last_call_attempt: new Date().toISOString(),
      })
      .eq("id", lead.id);

    // Approximate Vapi cost: ~$0.10/min, estimated 5 min = 50 cents
    await logSpend("vapi", 50, `Outbound call to ${lead.phone}`, lead.id);
  } catch (e) {
    await db.from("calls").update({ status: "failed" }).eq("id", callRecord!.id);
    await db.from("leads").update({ status: "call_failed" }).eq("id", lead.id);
    logger.error("Vapi call initiation failed", {
      lead_id: lead.id,
      error: String(e),
    });
    throw e;
  }
}

// ── Step 5: Handle call ended (called from Vapi webhook) ──────
export async function processCallEnded(opts: {
  vapi_call_id: string;
  transcript: string;
  recording_url?: string;
  ended_reason: string;
  call_metadata?: Record<string, unknown>;
}): Promise<void> {
  const { vapi_call_id, transcript, recording_url, ended_reason, call_metadata } = opts;
  const env = getEnv();
  const db = createServiceClient();

  // Find the lead by vapi call ID
  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("vapi_call_id", vapi_call_id)
    .single();

  if (!lead) {
    logger.warn("processCallEnded: lead not found for vapi_call_id", { vapi_call_id });
    return;
  }

  // Update call record
  await db
    .from("calls")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      transcript_text: transcript,
      recording_url: recording_url ?? null,
    })
    .eq("vapi_call_id", vapi_call_id);

  // Check if call was answered at all
  const noAnswer =
    ended_reason === "no-answer" ||
    ended_reason === "machine-detected-greeting-end" ||
    transcript.trim().length < 50;

  if (noAnswer) {
    await handleNoAnswer(lead as Lead);
    return;
  }

  // Qualify with Anthropic
  let qualification: QualificationResult | null = null;
  try {
    qualification = await qualifyLead({
      transcript,
      language: lead.language as Language,
      lead_name: lead.name ?? undefined,
      lead_business: lead.business ?? undefined,
      lead_id: lead.id,
    });

    // Log Anthropic spend estimate (~$0.01 per qualification)
    await logSpend("anthropic", 1, `Lead qualification ${lead.id}`, lead.id);
  } catch (e) {
    logger.error("Qualification failed", { lead_id: lead.id, error: String(e) });
  }

  // Update lead with qualification results
  const leadUpdates: Record<string, unknown> = {
    status: "qualified",
    transcript_text: transcript,
    transcript_url: recording_url ?? null,
    ai_summary: qualification?.summary ?? null,
    qualification_score: qualification?.score ?? null,
  };

  // Update detected name if the AI found it
  if (qualification?.lead_name && !lead.name) {
    leadUpdates.name = qualification.lead_name;
  }

  await db.from("leads").update(leadUpdates).eq("id", lead.id);

  // Update call record with qualification
  await db
    .from("calls")
    .update({
      qualification_score: qualification?.score ?? null,
      ai_summary: qualification?.summary ?? null,
      transcript_text: transcript,
    })
    .eq("vapi_call_id", vapi_call_id);

  // If booked during the call, process the booking
  if (qualification?.booked && qualification.booking_slot) {
    await processBooking({
      lead: { ...(lead as Lead), ...leadUpdates } as Lead,
      slot_iso: qualification.booking_slot,
      qualification,
    });
  } else {
    // Send Andy a notification about the qualified (but unbooked) lead
    if (env.MY_EMAIL) {
      await sendLeadAlertToAndy({
        lead_id: lead.id,
        lead_name: lead.name ?? "Unknown",
        lead_phone: lead.phone ?? undefined,
        lead_source: lead.source,
        language: lead.language,
        qualification_score: qualification?.score,
        ai_summary: qualification?.summary,
        talking_points: qualification?.talking_points,
      }).catch((e) =>
        logger.error("Failed to send lead alert", { lead_id: lead.id, error: String(e) })
      );
    }
  }

  // Update CRM
  if (env.FEATURE_SHEET_SYNC) {
    try {
      const crm = getCrmAdapter();
      if (lead.phone) {
        await crm.updateLead(
          lead.phone,
          {
            qualification_score: String(qualification?.score ?? ""),
            transcript_url: recording_url ?? "",
            booking_status: qualification?.booked ? "booked" : "qualified",
            outcome: "",
          },
          lead.id
        );
      }
    } catch (e) {
      logger.error("CRM update failed (non-fatal)", { lead_id: lead.id, error: String(e) });
    }
  }
}

// ── Process a booking ─────────────────────────────────────────
// Called when the Vapi assistant books a slot during a call,
// OR when the calendar/book API endpoint is hit directly
export async function processBooking(opts: {
  lead: Lead;
  slot_iso: string;
  qualification?: QualificationResult | null;
}): Promise<void> {
  const { lead, slot_iso, qualification } = opts;
  const env = getEnv();
  const db = createServiceClient();

  logger.info("Processing booking", { lead_id: lead.id, slot_iso });

  // 1. Create Google Calendar event
  let calendarResult: Awaited<ReturnType<typeof createBookingEvent>> | null = null;
  if (env.FEATURE_CALENDAR_BOOKING) {
    try {
      calendarResult = await createBookingEvent({
        lead_id: lead.id,
        lead_name: lead.name ?? "Unknown Lead",
        lead_phone: lead.phone ?? undefined,
        lead_email: lead.email ?? undefined,
        language: lead.language as Language,
        start_iso: slot_iso,
        transcript_text: lead.transcript_text ?? undefined,
        ai_summary: qualification?.summary ?? lead.ai_summary ?? undefined,
        qualification_score: qualification?.score ?? lead.qualification_score ?? undefined,
        talking_points: qualification?.talking_points,
      });
    } catch (e) {
      logger.error("Calendar event creation failed", { lead_id: lead.id, error: String(e) });
    }
  }

  // 2. Create booking record in Supabase
  const { data: callRecord } = await db
    .from("calls")
    .select("id")
    .eq("vapi_call_id", lead.vapi_call_id ?? "")
    .single();

  const bookingEnd = new Date(new Date(slot_iso).getTime() + env.BOOKING_DURATION_MINUTES * 60000);

  await db.from("bookings").insert({
    lead_id: lead.id,
    call_id: callRecord?.id ?? null,
    scheduled_at: slot_iso,
    duration_minutes: env.BOOKING_DURATION_MINUTES,
    calendar_event_id: calendarResult?.event_id ?? null,
    meeting_link: calendarResult?.meet_link ?? null,
    status: "confirmed",
  });

  // 3. Update lead status
  await db
    .from("leads")
    .update({
      status: "booked",
      booking_time: slot_iso,
      booking_calendar_event_id: calendarResult?.event_id ?? null,
    })
    .eq("id", lead.id);

  const rescheduleUrl = `${env.APP_URL}/reschedule?lead=${lead.id}`;

  // 4. Send SMS confirmation to lead
  if (lead.phone) {
    const { formatSlotLabel } = await import("@/lib/anthropic/client");
    const timeLabel = formatSlotLabel(slot_iso, lead.language as Language, env.TIMEZONE);
    const smsBody = generateBookingConfirmationSms({
      language: lead.language as Language,
      lead_name: lead.name ?? undefined,
      booking_time_label: timeLabel,
      reschedule_url: rescheduleUrl,
    });

    await sendSms({ to: lead.phone, body: smsBody, lead_id: lead.id }).catch((e) =>
      logger.error("Booking confirmation SMS failed", { lead_id: lead.id, error: String(e) })
    );
  }

  // 5. Send email confirmation to lead (if we have their email)
  if (lead.email && env.FEATURE_EMAIL_CONFIRMATIONS) {
    try {
      const ics = buildIcsContent({
        summary: `Strategy Call with Andy Young — Capital AI Growth`,
        description: `Your 30-minute strategy call. ${calendarResult?.meet_link ? `Join: ${calendarResult.meet_link}` : "Andy will call you."}`,
        start_iso: slot_iso,
        end_iso: bookingEnd.toISOString(),
        organizer_email: env.RESEND_FROM_EMAIL,
        attendee_email: lead.email,
        meeting_link: calendarResult?.meet_link ?? null,
      });

      await sendBookingConfirmation({
        lead_id: lead.id,
        lead_name: lead.name ?? "there",
        lead_email: lead.email,
        language: lead.language as Language,
        booking_iso: slot_iso,
        meeting_link: calendarResult?.meet_link ?? null,
        reschedule_url: rescheduleUrl,
        ics_content: ics,
      });
    } catch (e) {
      logger.error("Booking confirmation email failed (non-fatal)", {
        lead_id: lead.id,
        error: String(e),
      });
    }
  }

  // 6. Send Andy a notification
  await sendLeadAlertToAndy({
    lead_id: lead.id,
    lead_name: lead.name ?? "Unknown",
    lead_phone: lead.phone ?? undefined,
    lead_source: lead.source,
    language: lead.language,
    qualification_score: qualification?.score ?? lead.qualification_score ?? undefined,
    ai_summary: qualification?.summary ?? lead.ai_summary ?? undefined,
    talking_points: qualification?.talking_points,
    booking_time: slot_iso,
  }).catch((e) =>
    logger.error("Lead alert to Andy failed (non-fatal)", { lead_id: lead.id, error: String(e) })
  );

  // 7. Update CRM
  if (env.FEATURE_SHEET_SYNC && lead.phone) {
    try {
      const crm = getCrmAdapter();
      await crm.updateLead(
        lead.phone,
        {
          booking_status: "booked",
          booking_time: slot_iso,
          qualification_score: String(qualification?.score ?? lead.qualification_score ?? ""),
        },
        lead.id
      );
    } catch (e) {
      logger.error("CRM booking update failed (non-fatal)", { lead_id: lead.id, error: String(e) });
    }
  }

  logger.info("Booking processed successfully", {
    lead_id: lead.id,
    slot_iso,
    has_calendar_event: !!calendarResult?.event_id,
    has_meet_link: !!calendarResult?.meet_link,
  });
}

// ── No-answer handler ─────────────────────────────────────────
async function handleNoAnswer(lead: Lead): Promise<void> {
  const env = getEnv();
  const db = createServiceClient();

  const attemptCount = lead.call_attempts ?? 1;

  logger.info("Call not answered", { lead_id: lead.id, attempt: attemptCount });

  if (attemptCount >= 3) {
    // Max retries reached — SMS fallback
    await db
      .from("leads")
      .update({ status: "call_failed", next_call_attempt: null })
      .eq("id", lead.id);

    if (lead.phone) {
      const bookingUrl = `${env.APP_URL}/book?lead=${lead.id}`;
      const sms = generateNoAnswerSms({
        language: lead.language as Language,
        lead_name: lead.name ?? undefined,
        booking_url: bookingUrl,
      });
      await sendSms({ to: lead.phone, body: sms, lead_id: lead.id }).catch((e) =>
        logger.error("No-answer SMS failed", { lead_id: lead.id, error: String(e) })
      );
    }

    if (lead.email) {
      const bookingUrl = `${env.APP_URL}/book?lead=${lead.id}`;
      await sendNoAnswerEmail({
        lead_id: lead.id,
        lead_name: lead.name ?? "there",
        lead_email: lead.email,
        language: lead.language as Language,
        booking_url: bookingUrl,
      }).catch((e) =>
        logger.error("No-answer email failed", { lead_id: lead.id, error: String(e) })
      );
    }

    return;
  }

  // Schedule retry
  const delayHours = attemptCount === 1 ? 4 : 24;
  const nextAttempt = new Date(Date.now() + delayHours * 60 * 60 * 1000);

  await db
    .from("leads")
    .update({
      status: "call_failed",
      next_call_attempt: nextAttempt.toISOString(),
    })
    .eq("id", lead.id);

  logger.info("Call retry scheduled", {
    lead_id: lead.id,
    next_attempt: nextAttempt.toISOString(),
    delay_hours: delayHours,
  });
}

// ── Spend cap enforcement ─────────────────────────────────────
async function checkSpendCap(
  provider: "vapi" | "anthropic" | "twilio",
  lead_id?: string
): Promise<boolean> {
  const env = getEnv();
  const db = createServiceClient();

  const caps: Record<string, number> = {
    vapi: env.VAPI_MONTHLY_CAP_CENTS,
    anthropic: env.ANTHROPIC_MONTHLY_CAP_CENTS,
    twilio: env.TWILIO_MONTHLY_CAP_CENTS,
  };

  const cap = caps[provider] ?? 0;
  if (cap === 0) return true;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data } = await db
    .from("spend_log")
    .select("amount_cents")
    .eq("provider", provider)
    .gte("created_at", startOfMonth.toISOString());

  const total = (data ?? []).reduce((sum, row) => sum + (row.amount_cents ?? 0), 0);
  const pct = total / cap;

  if (pct >= 0.8 && pct < 1.0) {
    logger.warn(`Spend alert: ${provider} at ${Math.round(pct * 100)}% of monthly cap`, {
      lead_id,
      provider,
      total_cents: total,
      cap_cents: cap,
    });
    // TODO Phase 3: send alert email to Andy
  }

  if (pct >= 1.0) {
    logger.error(`Spend cap REACHED: ${provider} blocked`, {
      lead_id,
      provider,
      total_cents: total,
      cap_cents: cap,
    });
    return false;
  }

  return true;
}

async function logSpend(
  provider: "vapi" | "anthropic" | "twilio",
  amount_cents: number,
  description: string,
  lead_id?: string
): Promise<void> {
  try {
    const db = createServiceClient();
    await db.from("spend_log").insert({
      provider,
      amount_cents,
      description,
      lead_id: lead_id ?? null,
    });
  } catch (e) {
    logger.warn("Failed to log spend (non-fatal)", { provider, error: String(e) });
  }
}
