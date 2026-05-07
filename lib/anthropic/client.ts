import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";
import type { Language, QualificationResult } from "@/types";

// ============================================================
// Anthropic / Claude client
// Used for: language detection, lead scoring, summaries,
// talking-point generation, and diagnostic plan generation
// ============================================================

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  }
  return _client;
}

// Approximate token costs for spend tracking (USD cents per 1M tokens)
// Claude Sonnet 4: $3 input, $15 output per 1M tokens
const SONNET_INPUT_CENTS_PER_1M = 300;
const SONNET_OUTPUT_CENTS_PER_1M = 1500;

export function estimateCostCents(inputTokens: number, outputTokens: number): number {
  return Math.ceil(
    (inputTokens / 1_000_000) * SONNET_INPUT_CENTS_PER_1M +
      (outputTokens / 1_000_000) * SONNET_OUTPUT_CENTS_PER_1M
  );
}

// ── Language detection ────────────────────────────────────────
// Detects language from free text — used on incoming SMS and chat Q1
export async function detectLanguage(
  text: string,
  lead_id?: string
): Promise<Language> {
  return withRetry(
    async () => {
      const client = getClient();
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: `Detect the language of this text and respond with ONLY one of: en, es, pt\n\nText: "${text}"`,
          },
        ],
      });

      const raw = response.content[0];
      if (!raw || raw.type !== "text") return "en";
      const detected = raw.text.trim().toLowerCase();
      if (detected === "es") return "es";
      if (detected === "pt") return "pt";
      return "en";
    },
    { name: "anthropic.detectLanguage", lead_id }
  );
}

// ── Qualification scoring ─────────────────────────────────────
// Analyses a call transcript and produces a score + summary
export async function qualifyLead(opts: {
  transcript: string;
  language: Language;
  lead_name?: string;
  lead_business?: string;
  lead_id?: string;
}): Promise<QualificationResult> {
  const { transcript, language, lead_name, lead_business, lead_id } = opts;

  return withRetry(
    async () => {
      const client = getClient();

      const systemPrompt = `You are an expert sales analyst for Capital AI Growth, an AI automation consulting business.

Analyse this sales qualification call transcript and return a JSON object with these exact fields:
- score: integer 1-10 (10 = perfect fit, ready to buy; 1 = not a fit)
  Scoring: business size/fit (+2), clear automation need (+2), timeline under 3 months (+2), budget signal present (+2), engaged/interested (+2)
- summary: 2-3 sentence summary of the lead (in English, regardless of call language)
- talking_points: array of exactly 3 bullet points for Andy's sales call (concise, specific to this lead)
- language: detected language of the call ("en", "es", or "pt")
- booked: boolean — did the lead agree to a booking?
- booking_slot: if booked=true, the ISO 8601 UTC datetime they selected (or null)
- lead_name: the name they gave during the call (or null)

Respond with ONLY valid JSON. No markdown, no explanation.`;

      const userPrompt = `Lead: ${lead_name ?? "Unknown"} | Business: ${lead_business ?? "Unknown"}

TRANSCRIPT:
${transcript}`;

      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const raw = response.content[0];
      if (!raw || raw.type !== "text") {
        throw new Error("Unexpected response type from Anthropic");
      }

      const parsed = JSON.parse(raw.text) as QualificationResult;

      logger.info("Lead qualified", {
        lead_id,
        score: parsed.score,
        booked: parsed.booked,
        language: parsed.language,
      });

      return { ...parsed, language: parsed.language ?? language };
    },
    { name: "anthropic.qualifyLead", lead_id }
  );
}

// ── Auto-reply message generation ────────────────────────────
// Generates the initial SMS reply in the lead's detected language
export async function generateAutoReply(opts: {
  language: Language;
  lead_name?: string;
  lead_id?: string;
}): Promise<string> {
  const { language, lead_name } = opts;

  // These are pre-written templates — no API call needed for this
  const name = lead_name ? ` ${lead_name}` : "";

  const templates: Record<Language, string> = {
    en: `Thanks${name}! I'm calling you in about 60 seconds — answer from this number. By replying, you consent to a callback from Capital AI Growth. Reply STOP to opt out.`,
    es: `¡Gracias${name}! Te llamo en unos 60 segundos — responde desde este número. Al responder, aceptas una devolución de llamada de Capital AI Growth. Responde PARAR para cancelar.`,
    pt: `Obrigado${name}! Vou ligar em cerca de 60 segundos — atenda deste número. Ao responder, você consente em receber uma ligação da Capital AI Growth. Responda PARAR para cancelar.`,
  };

  return templates[language];
}

// ── SMS/booking confirmation messages ────────────────────────
export function generateBookingConfirmationSms(opts: {
  language: Language;
  lead_name?: string;
  booking_time_label: string;
  reschedule_url: string;
}): string {
  const { language, lead_name, booking_time_label, reschedule_url } = opts;
  const name = lead_name ? ` ${lead_name}` : "";

  const templates: Record<Language, string> = {
    en: `Booked${name}! Your strategy call with Andy is confirmed for ${booking_time_label}. Reschedule: ${reschedule_url}`,
    es: `¡Reservado${name}! Tu llamada estratégica con Andy está confirmada para ${booking_time_label}. Reprogramar: ${reschedule_url}`,
    pt: `Agendado${name}! Sua chamada estratégica com Andy está confirmada para ${booking_time_label}. Reagendar: ${reschedule_url}`,
  };

  return templates[language];
}

// ── No-answer SMS fallback ────────────────────────────────────
export function generateNoAnswerSms(opts: {
  language: Language;
  lead_name?: string;
  booking_url: string;
}): string {
  const { language, lead_name, booking_url } = opts;
  const name = lead_name ? ` ${lead_name}` : "";

  const templates: Record<Language, string> = {
    en: `Hi${name}, I tried calling but couldn't reach you. Book a time directly here: ${booking_url}`,
    es: `Hola${name}, intenté llamarte pero no pude comunicarme. Reserva un horario directamente aquí: ${booking_url}`,
    pt: `Olá${name}, tentei ligar mas não consegui te alcançar. Agende um horário diretamente aqui: ${booking_url}`,
  };

  return templates[language];
}

// ── Slot label formatter ──────────────────────────────────────
// Returns a human-friendly slot label in the lead's language
export function formatSlotLabel(
  isoUtc: string,
  language: Language,
  timezone = "Australia/Brisbane"
): string {
  const date = new Date(isoUtc);
  const timezonedDate = new Intl.DateTimeFormat(
    language === "es" ? "es" : language === "pt" ? "pt" : "en-AU",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: timezone,
    }
  ).format(date);

  const tzLabel =
    language === "es"
      ? "hora de Brisbane"
      : language === "pt"
        ? "horário de Brisbane"
        : "Brisbane time";

  return `${timezonedDate} ${tzLabel}`;
}
