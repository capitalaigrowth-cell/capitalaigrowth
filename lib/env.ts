import { z } from "zod";

// ============================================================
// Environment variable validation — fails loudly on boot
// Any missing required var stops the app from starting
// ============================================================

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().startsWith("AC"),
  TWILIO_AUTH_TOKEN: z.string().min(1),
  TWILIO_PHONE_NUMBER: z.string().startsWith("+"),
  TWILIO_PHONE_NUMBER_SID: z.string().startsWith("PN"),

  // Vapi
  VAPI_API_KEY: z.string().min(1),
  VAPI_ASSISTANT_ID: z.string().optional(),
  VAPI_WEBHOOK_SECRET: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().startsWith("sk-"),

  // Google
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: z.string().includes("PRIVATE KEY"),
  GOOGLE_CALENDAR_ID: z.string().min(1),
  GOOGLE_SHEETS_ID: z.string().min(1),

  // Resend
  RESEND_API_KEY: z.string().startsWith("re_"),
  RESEND_FROM_EMAIL: z.string().email(),
  RESEND_FROM_NAME: z.string().min(1),

  // App config
  APP_URL: z.string().url(),
  MY_EMAIL: z.string().email(),
  MY_PHONE: z.string().startsWith("+"),
  MY_NAME: z.string().min(1),

  // CRM
  CRM_DESTINATION: z
    .enum(["google_sheets", "hubspot", "pipedrive", "airtable", "webhook"])
    .default("google_sheets"),

  // Feature flags
  FEATURE_SMS_INBOUND: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  FEATURE_VAPI_CALLS: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  FEATURE_CALENDAR_BOOKING: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  FEATURE_EMAIL_CONFIRMATIONS: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),
  FEATURE_SHEET_SYNC: z
    .string()
    .transform((v) => v !== "false")
    .default("true"),

  // Spend caps (USD cents)
  VAPI_MONTHLY_CAP_CENTS: z.coerce.number().default(5000),
  ANTHROPIC_MONTHLY_CAP_CENTS: z.coerce.number().default(2000),
  TWILIO_MONTHLY_CAP_CENTS: z.coerce.number().default(2000),

  // Booking config
  TIMEZONE: z.string().default("Australia/Brisbane"),
  BOOKING_DURATION_MINUTES: z.coerce.number().default(30),
  BOOKING_SLOTS_TO_OFFER: z.coerce.number().default(3),
  BOOKING_LOOKAHEAD_HOURS: z.coerce.number().default(72),
  BOOKING_HOURS_START: z.coerce.number().default(9),
  BOOKING_HOURS_END: z.coerce.number().default(17),
});

export type Env = z.infer<typeof envSchema>;

// Validate and export — throws on boot if anything is wrong
function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues.map(
      (i) => `  ${i.path.join(".")}: ${i.message}`
    );
    throw new Error(
      `\n\n❌ Environment variable validation failed:\n${missing.join("\n")}\n\nCheck .env.example for the full list of required variables.\n`
    );
  }
  return result.data;
}

// Cached — only validated once per server process
let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}
