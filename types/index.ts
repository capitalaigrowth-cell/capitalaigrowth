// ============================================================
// Capital AI Growth — Shared TypeScript types
// All database enums and domain types live here
// ============================================================

export type Language = "en" | "es" | "pt";

export type LeadSource =
  | "sms"
  | "chat_widget"
  | "linkedin"
  | "meta"
  | "webhook"
  | "manual";

export type LeadStatus =
  | "new"
  | "auto_replied"
  | "call_queued"
  | "calling"
  | "call_failed"
  | "qualified"
  | "booked"
  | "reminder_sent"
  | "no_show"
  | "send_proposal"
  | "needs_nurture"
  | "closed_won"
  | "closed_lost"
  | "not_a_fit";

export type CallStatus =
  | "initiated"
  | "ringing"
  | "in_progress"
  | "ended"
  | "no_answer"
  | "failed";

export type BookingStatus =
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed"
  | "no_show";

export type SpendProvider = "vapi" | "anthropic" | "twilio";

// ── Normalised lead record ────────────────────────────────────
export interface Lead {
  id: string;
  name: string | null;
  phone: string | null; // E.164
  email: string | null;
  source: LeadSource;
  language: Language;
  business: string | null;
  problem: string | null;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  status: LeadStatus;
  qualification_score: number | null; // 1–10
  call_attempts: number;
  last_call_attempt: string | null;
  next_call_attempt: string | null;
  booking_time: string | null;
  booking_calendar_event_id: string | null;
  transcript_url: string | null;
  transcript_text: string | null;
  ai_summary: string | null;
  vapi_call_id: string | null;
  crm_synced_at: string | null;
  crm_record_id: string | null;
}

export interface Call {
  id: string;
  lead_id: string;
  vapi_call_id: string | null;
  status: CallStatus;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  transcript_text: string | null;
  recording_url: string | null;
  qualification_score: number | null;
  ai_summary: string | null;
  created_at: string;
}

export interface Booking {
  id: string;
  lead_id: string;
  call_id: string | null;
  scheduled_at: string; // ISO UTC
  duration_minutes: number;
  calendar_event_id: string | null;
  meeting_link: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
}

// ── Incoming lead from any source ────────────────────────────
export interface InboundLead {
  name?: string;
  phone?: string; // Will be normalised to E.164
  email?: string;
  source: LeadSource;
  language_hint?: Language;
  business?: string;
  problem?: string;
  raw_payload: Record<string, unknown>;
}

// ── Calendar slot ─────────────────────────────────────────────
export interface CalendarSlot {
  id: string; // ISO start time — used as booking identifier
  start: string; // ISO UTC
  end: string; // ISO UTC
  label: string; // Human-readable in lead's language, e.g. "Tuesday 2pm Brisbane"
}

// ── Vapi function call payloads ───────────────────────────────
export interface GetAvailableSlotsArgs {
  language?: Language;
}

export interface BookAppointmentArgs {
  slot_id: string; // ISO start time
  lead_name?: string;
}

// ── CRM destination row ───────────────────────────────────────
export interface CrmRow {
  timestamp: string;
  source: string;
  name: string;
  phone: string;
  email: string;
  language: string;
  business: string;
  problem: string;
  qualification_score: string;
  transcript_url: string;
  booking_status: string;
  booking_time: string;
  outcome: string;
  next_touch_date: string;
  notes: string;
}

// ── Qualification analysis from Anthropic ─────────────────────
export interface QualificationResult {
  score: number; // 1–10
  summary: string; // 2–3 sentence summary
  talking_points: string[]; // 3 bullet points for Andy
  language: Language;
  booked: boolean;
  booking_slot?: string; // ISO UTC if booked
  lead_name?: string;
}

// ── Vapi webhook event shapes ────────────────────────────────
export interface VapiWebhookPayload {
  message: VapiMessage;
}

export type VapiMessage =
  | VapiCallStartedMessage
  | VapiCallEndedMessage
  | VapiFunctionCallMessage
  | VapiTranscriptMessage;

export interface VapiCallStartedMessage {
  type: "call-started";
  call: VapiCall;
}

export interface VapiCallEndedMessage {
  type: "end-of-call-report";
  call: VapiCall;
  artifact: {
    transcript: string;
    recordingUrl?: string;
    messages: VapiTranscriptLine[];
  };
  analysis?: {
    summary?: string;
    successEvaluation?: string;
  };
  endedReason: string;
}

export interface VapiFunctionCallMessage {
  type: "function-call";
  call: VapiCall;
  functionCall: {
    name: string;
    parameters: Record<string, unknown>;
  };
}

export interface VapiTranscriptMessage {
  type: "transcript";
  call: VapiCall;
  role: "user" | "assistant";
  transcriptType: "partial" | "final";
  transcript: string;
}

export interface VapiCall {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  type: "outboundPhoneCall" | "inboundPhoneCall" | "webCall";
  status: string;
  phoneNumberId?: string;
  assistantId?: string;
  customer?: {
    number?: string;
    name?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface VapiTranscriptLine {
  role: "user" | "assistant" | "tool";
  message?: string;
  time?: number;
  endTime?: number;
  secondsFromStart?: number;
}
