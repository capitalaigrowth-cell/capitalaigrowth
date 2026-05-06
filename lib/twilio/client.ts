import twilio from "twilio";
import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";

// ============================================================
// Twilio SMS client
// Handles: sending SMS, validating inbound webhook signatures
// ============================================================

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    const env = getEnv();
    _client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return _client;
}

export async function sendSms(opts: {
  to: string;
  body: string;
  lead_id?: string;
}): Promise<string> {
  const { to, body, lead_id } = opts;
  const env = getEnv();

  return withRetry(
    async () => {
      const client = getClient();
      const message = await client.messages.create({
        from: env.TWILIO_PHONE_NUMBER,
        to,
        body,
      });

      logger.info("SMS sent", {
        lead_id,
        channel: "sms",
        provider: "twilio",
        to,
        sid: message.sid,
      });

      return message.sid;
    },
    { name: "twilio.sendSms", lead_id }
  );
}

// Validates Twilio webhook signature to prevent spoofed requests
export function validateTwilioSignature(opts: {
  url: string;
  params: Record<string, string>;
  signature: string;
}): boolean {
  const env = getEnv();
  return twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    opts.signature,
    opts.url,
    opts.params
  );
}

// Normalise any phone number format to E.164
// Assumes Australian numbers if no country code
export function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  if (digits.startsWith("61") && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+61${digits.slice(1)}`;
  }
  if (digits.length >= 10 && digits.startsWith("+")) {
    return raw.replace(/\s/g, "");
  }
  // International with leading +
  const stripped = raw.replace(/[\s\-\(\)]/g, "");
  if (stripped.startsWith("+") && stripped.length >= 10) {
    return stripped;
  }

  logger.warn("Could not normalise phone number", { raw });
  return null;
}
