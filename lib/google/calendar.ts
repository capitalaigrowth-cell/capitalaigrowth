import { google } from "googleapis";
import { addMinutes, addHours, startOfHour, isWeekend, format } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { getGoogleAuth } from "./auth";
import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";
import { formatSlotLabel } from "@/lib/anthropic/client";
import type { CalendarSlot, Language } from "@/types";

// ============================================================
// Google Calendar — free/busy queries and event creation
// ============================================================

function getCalendarClient() {
  return google.calendar({ version: "v3", auth: getGoogleAuth() });
}

// ── Find available slots ──────────────────────────────────────
// Returns next N available 30-min slots within lookahead window
export async function getAvailableSlots(opts: {
  language?: Language;
  lead_id?: string;
}): Promise<CalendarSlot[]> {
  const { language = "en", lead_id } = opts;
  const env = getEnv();

  return withRetry(
    async () => {
      const calendar = getCalendarClient();
      const timezone = env.TIMEZONE;
      const durationMinutes = env.BOOKING_DURATION_MINUTES;
      const lookaheadHours = env.BOOKING_LOOKAHEAD_HOURS;
      const slotsToOffer = env.BOOKING_SLOTS_TO_OFFER;
      const hoursStart = env.BOOKING_HOURS_START;
      const hoursEnd = env.BOOKING_HOURS_END;

      const now = new Date();
      const windowEnd = addHours(now, lookaheadHours);

      // Fetch existing calendar events for free/busy analysis
      const freeBusyResponse = await calendar.freebusy.query({
        requestBody: {
          timeMin: now.toISOString(),
          timeMax: windowEnd.toISOString(),
          timeZone: "UTC",
          items: [{ id: env.GOOGLE_CALENDAR_ID }],
        },
      });

      const busySlots =
        freeBusyResponse.data.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy ?? [];

      // Build candidate slots: every 30 min within business hours
      const candidates: Date[] = [];
      let cursor = startOfHour(addHours(now, 1)); // Start at next full hour + 1h buffer

      while (cursor < windowEnd) {
        const zonedCursor = toZonedTime(cursor, timezone);
        const hour = zonedCursor.getHours();
        const dayOfWeek = zonedCursor.getDay(); // 0=Sun, 6=Sat

        const inBusinessHours = hour >= hoursStart && hour < hoursEnd;
        const isWorkday = !isWeekend(zonedCursor);

        if (inBusinessHours && isWorkday) {
          candidates.push(cursor);
        }

        cursor = addMinutes(cursor, durationMinutes);
      }

      // Filter out busy slots
      const available = candidates.filter((slot) => {
        const slotEnd = addMinutes(slot, durationMinutes);
        return !busySlots.some((busy) => {
          const busyStart = new Date(busy.start ?? "");
          const busyEnd = new Date(busy.end ?? "");
          // Overlap check: slot starts before busy ends AND slot ends after busy starts
          return slot < busyEnd && slotEnd > busyStart;
        });
      });

      const selected = available.slice(0, slotsToOffer);

      logger.info("Calendar slots fetched", {
        lead_id,
        available: available.length,
        offering: selected.length,
      });

      return selected.map((slot) => ({
        id: slot.toISOString(),
        start: slot.toISOString(),
        end: addMinutes(slot, durationMinutes).toISOString(),
        label: formatSlotLabel(slot.toISOString(), language, timezone),
      }));
    },
    { name: "google.getAvailableSlots", lead_id }
  );
}

// ── Create calendar event ─────────────────────────────────────
export async function createBookingEvent(opts: {
  lead_id: string;
  lead_name: string;
  lead_phone?: string;
  lead_email?: string;
  language: Language;
  start_iso: string; // ISO UTC
  transcript_text?: string;
  ai_summary?: string;
  qualification_score?: number;
  talking_points?: string[];
}): Promise<{ event_id: string; html_link: string; meet_link: string | null }> {
  const {
    lead_id,
    lead_name,
    lead_phone,
    lead_email,
    language,
    start_iso,
    transcript_text,
    ai_summary,
    qualification_score,
    talking_points,
  } = opts;
  const env = getEnv();

  return withRetry(
    async () => {
      const calendar = getCalendarClient();
      const start = new Date(start_iso);
      const end = addMinutes(start, env.BOOKING_DURATION_MINUTES);

      // Build rich description for Andy's calendar event
      const descriptionParts: string[] = [
        `📞 Lead Source: ${language.toUpperCase()} call via Capital AI Growth`,
        `🎯 Qualification Score: ${qualification_score ?? "N/A"}/10`,
        `🌍 Language: ${language}`,
        "",
        "── AI Summary ──────────────────────",
        ai_summary ?? "No summary available",
        "",
      ];

      if (talking_points?.length) {
        descriptionParts.push("── Suggested Talking Points ────────");
        talking_points.forEach((pt) => descriptionParts.push(`• ${pt}`));
        descriptionParts.push("");
      }

      if (lead_phone) descriptionParts.push(`📱 Phone: ${lead_phone}`);
      if (lead_email) descriptionParts.push(`📧 Email: ${lead_email}`);

      if (transcript_text) {
        descriptionParts.push(
          "",
          "── Full Transcript ─────────────────",
          transcript_text.slice(0, 4000) // Calendar events have character limits
        );
      }

      const attendees = [];
      if (lead_email) {
        attendees.push({ email: lead_email, displayName: lead_name });
      }

      const event = await calendar.events.insert({
        calendarId: env.GOOGLE_CALENDAR_ID,
        sendNotifications: true,
        requestBody: {
          summary: `Strategy Call: ${lead_name} (Score: ${qualification_score ?? "?"}⁄10)`,
          description: descriptionParts.join("\n"),
          start: { dateTime: start.toISOString(), timeZone: "UTC" },
          end: { dateTime: end.toISOString(), timeZone: "UTC" },
          attendees,
          conferenceData: {
            createRequest: {
              requestId: `cap-ai-${lead_id}`,
              conferenceSolutionKey: { type: "hangoutsMeet" },
            },
          },
          colorId: qualification_score && qualification_score >= 7 ? "2" : "5", // Green for hot leads
        },
        conferenceDataVersion: 1,
      });

      const eventId = event.data.id ?? "";
      const htmlLink = event.data.htmlLink ?? "";
      const meetLink =
        event.data.conferenceData?.entryPoints?.find(
          (ep) => ep.entryPointType === "video"
        )?.uri ?? null;

      logger.info("Calendar event created", {
        lead_id,
        event_id: eventId,
        scheduled_at: start_iso,
      });

      return { event_id: eventId, html_link: htmlLink, meet_link: meetLink };
    },
    { name: "google.createBookingEvent", lead_id }
  );
}

// ── Format slot for ICS attachment ───────────────────────────
export function buildIcsContent(opts: {
  summary: string;
  description: string;
  start_iso: string;
  end_iso: string;
  organizer_email: string;
  attendee_email: string;
  meeting_link: string | null;
}): string {
  const { summary, description, start_iso, end_iso, organizer_email, attendee_email, meeting_link } = opts;

  const formatIcsDate = (iso: string) =>
    iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Capital AI Growth//Lead Qualification//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${formatIcsDate(start_iso)}`,
    `DTEND:${formatIcsDate(end_iso)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, "\\n")}`,
    `ORGANIZER;CN=Andy Young:mailto:${organizer_email}`,
    `ATTENDEE;RSVP=TRUE;CN=Guest:mailto:${attendee_email}`,
    meeting_link ? `URL:${meeting_link}` : "",
    `UID:cap-ai-${Date.now()}@capitalaigrowth.com.au`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Strategy call with Andy starting soon",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}
