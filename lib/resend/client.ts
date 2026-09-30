import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";
import { addMinutes } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { buildIcsContent } from "@/lib/google/calendar";
import type { Language } from "@/types";

// ============================================================
// Resend email client
// Handles: booking confirmations, no-answer follow-ups,
//          daily summary to Andy, lead qualification alerts
// ============================================================

let _client: Resend | null = null;

function getClient(): Resend {
  if (!_client) {
    _client = new Resend(getEnv().RESEND_API_KEY);
  }
  return _client;
}

// ── Booking confirmation to lead ──────────────────────────────
export async function sendBookingConfirmation(opts: {
  lead_id: string;
  lead_name: string;
  lead_email: string;
  language: Language;
  booking_iso: string; // ISO UTC
  meeting_link: string | null;
  reschedule_url: string;
  ics_content: string;
}): Promise<void> {
  const {
    lead_id,
    lead_name,
    lead_email,
    language,
    booking_iso,
    meeting_link,
    reschedule_url,
    ics_content,
  } = opts;
  const env = getEnv();

  const bookingDate = new Date(booking_iso);
  const brisbaneDate = toZonedTime(bookingDate, env.TIMEZONE);
  const formattedDate = brisbaneDate.toLocaleDateString(
    language === "es" ? "es" : language === "pt" ? "pt-BR" : "en-AU",
    { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: env.TIMEZONE }
  );
  const formattedTime = brisbaneDate.toLocaleTimeString(
    language === "es" ? "es" : language === "pt" ? "pt-BR" : "en-AU",
    { hour: "numeric", minute: "2-digit", hour12: true, timeZone: env.TIMEZONE }
  );

  const content = {
    en: {
      subject: `Confirmed: Strategy Call with Andy Young — ${formattedDate}`,
      greeting: `Hi ${lead_name},`,
      body: `Your 30-minute strategy call with Andy Young is confirmed.`,
      details: `📅 ${formattedDate} at ${formattedTime} (Brisbane time)`,
      meetingLine: meeting_link
        ? `🎥 Join here: ${meeting_link}`
        : `📞 Andy will call you at your number.`,
      whatToExpect: `What to expect: This is a real conversation — no slides, no pitch deck. Andy will listen to what you're dealing with and tell you honestly whether AI automation makes sense for your business, and what it would actually look like.`,
      rescheduleLine: `Need to move it? Reschedule here: ${reschedule_url}`,
      closing: `See you soon,\nAndy Young\nCapital AI Growth\nhttps://capitalaigrowth.com.au`,
    },
    es: {
      subject: `Confirmado: Llamada estratégica con Andy Young — ${formattedDate}`,
      greeting: `Hola ${lead_name},`,
      body: `Tu llamada estratégica de 30 minutos con Andy Young está confirmada.`,
      details: `📅 ${formattedDate} a las ${formattedTime} (hora de Brisbane)`,
      meetingLine: meeting_link
        ? `🎥 Únete aquí: ${meeting_link}`
        : `📞 Andy te llamará a tu número.`,
      whatToExpect: `Qué esperar: Esta es una conversación real — sin diapositivas, sin discurso de ventas. Andy escuchará lo que estás enfrentando y te dirá honestamente si la automatización con IA tiene sentido para tu negocio.`,
      rescheduleLine: `¿Necesitas cambiar la hora? Reprograma aquí: ${reschedule_url}`,
      closing: `Hasta pronto,\nAndy Young\nCapital AI Growth\nhttps://capitalaigrowth.com.au`,
    },
    pt: {
      subject: `Confirmado: Chamada estratégica com Andy Young — ${formattedDate}`,
      greeting: `Olá ${lead_name},`,
      body: `Sua chamada estratégica de 30 minutos com Andy Young está confirmada.`,
      details: `📅 ${formattedDate} às ${formattedTime} (horário de Brisbane)`,
      meetingLine: meeting_link
        ? `🎥 Participe aqui: ${meeting_link}`
        : `📞 Andy ligará para o seu número.`,
      whatToExpect: `O que esperar: Esta é uma conversa real — sem slides, sem discurso de vendas. Andy ouvirá o que você está enfrentando e dirá honestamente se a automação com IA faz sentido para o seu negócio.`,
      rescheduleLine: `Precisa reagendar? Faça aqui: ${reschedule_url}`,
      closing: `Até breve,\nAndy Young\nCapital AI Growth\nhttps://capitalaigrowth.com.au`,
    },
  };

  const c = content[language];

  await withRetry(
    async () => {
      const resend = getClient();
      await resend.emails.send({
        from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
        to: lead_email,
        subject: c.subject,
        text: [c.greeting, "", c.body, "", c.details, c.meetingLine, "", c.whatToExpect, "", c.rescheduleLine, "", c.closing].join("\n"),
        attachments: [
          {
            filename: "strategy-call.ics",
            content: Buffer.from(ics_content).toString("base64"),
          },
        ],
      });

      logger.info("Booking confirmation email sent", { lead_id, to: lead_email });
    },
    { name: "resend.sendBookingConfirmation", lead_id }
  );
}

// ── New lead alert to Andy ────────────────────────────────────
export async function sendLeadAlertToAndy(opts: {
  lead_id: string;
  lead_name: string;
  lead_phone?: string;
  lead_source: string;
  language: string;
  qualification_score?: number;
  ai_summary?: string;
  talking_points?: string[];
  booking_time?: string;
}): Promise<void> {
  const env = getEnv();
  const {
    lead_id,
    lead_name,
    lead_phone,
    lead_source,
    language,
    qualification_score,
    ai_summary,
    talking_points,
    booking_time,
  } = opts;

  const bookingLine = booking_time
    ? `📅 BOOKING: ${new Date(booking_time).toLocaleString("en-AU", { timeZone: env.TIMEZONE, dateStyle: "full", timeStyle: "short" })} Brisbane time`
    : "❌ No booking made";

  const talkingPointsText = talking_points?.length
    ? talking_points.map((p) => `  • ${p}`).join("\n")
    : "  • None generated";

  await withRetry(
    async () => {
      const resend = getClient();
      await resend.emails.send({
        from: `Capital AI Growth System <${env.RESEND_FROM_EMAIL}>`,
        to: env.MY_EMAIL,
        subject: `🎯 New Lead: ${lead_name} — Score ${qualification_score ?? "?"}/10`,
        text: [
          `NEW QUALIFIED LEAD`,
          "─".repeat(40),
          `Name: ${lead_name}`,
          `Phone: ${lead_phone ?? "Unknown"}`,
          `Source: ${lead_source}`,
          `Language: ${language.toUpperCase()}`,
          `Score: ${qualification_score ?? "N/A"}/10`,
          "",
          bookingLine,
          "",
          "AI SUMMARY:",
          ai_summary ?? "No summary available",
          "",
          "SUGGESTED TALKING POINTS:",
          talkingPointsText,
          "",
          `Dashboard: ${env.APP_URL}/dashboard`,
          `Lead ID: ${lead_id}`,
        ].join("\n"),
      });

      logger.info("Lead alert sent to Andy", { lead_id });
    },
    { name: "resend.sendLeadAlertToAndy", lead_id }
  );
}

// ── No-answer email follow-up ─────────────────────────────────
export async function sendNoAnswerEmail(opts: {
  lead_id: string;
  lead_name: string;
  lead_email: string;
  language: Language;
  booking_url: string;
}): Promise<void> {
  const { lead_id, lead_name, lead_email, language, booking_url } = opts;
  const env = getEnv();

  const content = {
    en: {
      subject: "I tried calling — quick note from Andy at Capital AI Growth",
      body: `Hi ${lead_name},\n\nI tried to reach you earlier about the message you sent us — but couldn't get through.\n\nIf you'd like to chat about automating part of your business, you can book a time directly here:\n${booking_url}\n\nOr just reply to this email.\n\nAndy Young\nCapital AI Growth`,
    },
    es: {
      subject: "Intenté llamarte — nota rápida de Andy en Capital AI Growth",
      body: `Hola ${lead_name},\n\nIntentamos comunicarnos contigo por el mensaje que nos enviaste — pero no pudimos contactarte.\n\nSi te gustaría hablar sobre cómo automatizar parte de tu negocio, puedes reservar un horario directamente aquí:\n${booking_url}\n\nO simplemente responde este correo.\n\nAndy Young\nCapital AI Growth`,
    },
    pt: {
      subject: "Tentei ligar — nota rápida de Andy na Capital AI Growth",
      body: `Olá ${lead_name},\n\nTentamos entrar em contato sobre a mensagem que você nos enviou — mas não conseguimos falar.\n\nSe quiser conversar sobre como automatizar parte do seu negócio, você pode agendar um horário diretamente aqui:\n${booking_url}\n\nOu apenas responda este e-mail.\n\nAndy Young\nCapital AI Growth`,
    },
  };

  const c = content[language];

  await withRetry(
    async () => {
      const resend = getClient();
      await resend.emails.send({
        from: `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`,
        to: lead_email,
        subject: c.subject,
        text: c.body,
      });

      logger.info("No-answer email sent", { lead_id, to: lead_email });
    },
    { name: "resend.sendNoAnswerEmail", lead_id }
  );
}
