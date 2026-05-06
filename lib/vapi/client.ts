import { getEnv } from "@/lib/env";
import { logger, withRetry } from "@/lib/logger";
import type { Language } from "@/types";

// ============================================================
// Vapi.ai client
// Handles: creating/fetching assistants, triggering outbound calls
// ============================================================

const VAPI_BASE = "https://api.vapi.ai";

async function vapiRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const env = getEnv();
  const res = await fetch(`${VAPI_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Vapi ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Assistant definition ──────────────────────────────────────
// Returns the assistant config to send to Vapi
// Language is passed as metadata on each call, not baked into the assistant
function buildAssistantConfig(env: ReturnType<typeof getEnv>) {
  return {
    name: "Capital AI Growth — Lead Qualifier",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-5",
      systemPrompt: `You are a friendly AI assistant for Capital AI Growth, Andy Young's AI automation consulting business based in Queensland, Australia.

Your ONLY job: have a warm, brief qualification conversation and book the caller for a 30-minute strategy call with Andy.

LANGUAGE RULE: The caller's preferred language will be passed to you in the call metadata as "language". Respond in that language throughout the call:
- "en" → English
- "es" → Español
- "pt" → Português

If the caller switches languages mid-call, match them instantly.

QUALIFICATION FLOW (conversational, not a checklist — aim for 5–7 minutes total):
1. Warm greeting: Introduce yourself as Andy's AI assistant. Confirm they have 5 minutes.
2. Ask: "What does your business do?" (keep it open)
3. Ask: "What's taking up the most time that you'd love to automate or hand off?"
4. Ask: "Are you looking to make changes this quarter, or still at the research stage?"
5. If engaged: use get_available_slots to fetch 3 time slots and offer them by voice.
   Example: "Great — I have Tuesday the 13th at 2pm, Wednesday the 14th at 10am, or Thursday the 15th at 3pm, all Brisbane time. Which suits you best?"
6. When they choose a slot: call book_appointment with the slot_id and their name.
7. Confirm the booking verbally and end the call warmly.

NOT interested? "No problem at all — you can always text us at this number if you'd like to chat later."

KEEP IT TIGHT: Under 8 minutes. Don't pitch. Don't oversell. Andy will do that on the actual call.

If asked about Andy: He has 40 years of sales experience, speaks English, Spanish and Portuguese fluently, and builds AI automation systems for businesses. He works personally with every client.

IMPORTANT: After booking, ALWAYS confirm the date and time back to the caller before ending.`,
    },
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel — natural, professional
    },
    firstMessage:
      "Hi there — I'm Andy's AI assistant at Capital AI Growth. I'm calling because you reached out to us. Do you have about 5 minutes for a quick chat?",
    firstMessageMode: "assistant-speaks-first",
    endCallMessage: "Great talking with you — looking forward to the call with Andy. Bye for now!",
    maxDurationSeconds: 600, // 10 min hard limit
    backgroundDenoisingEnabled: true,
    tools: [
      {
        type: "function",
        function: {
          name: "get_available_slots",
          description:
            "Get the next available time slots for a strategy call with Andy. Returns 3 slots in the caller's language.",
          parameters: {
            type: "object",
            properties: {
              language: {
                type: "string",
                enum: ["en", "es", "pt"],
                description: "The caller's language for formatting slot labels",
              },
            },
          },
        },
        server: {
          url: `${env.APP_URL}/api/calendar/slots`,
        },
        async: false,
      },
      {
        type: "function",
        function: {
          name: "book_appointment",
          description:
            "Book a strategy call for the lead. Call this after the lead has chosen a slot.",
          parameters: {
            type: "object",
            properties: {
              slot_id: {
                type: "string",
                description:
                  "The slot ID (ISO 8601 UTC datetime) returned by get_available_slots",
              },
              lead_name: {
                type: "string",
                description: "The name the caller gave during this call",
              },
            },
            required: ["slot_id"],
          },
        },
        server: {
          url: `${env.APP_URL}/api/calendar/book`,
        },
        async: false,
      },
    ],
    serverUrl: `${env.APP_URL}/api/webhooks/vapi`,
    serverUrlSecret: env.VAPI_WEBHOOK_SECRET ?? undefined,
    analysisPlan: {
      summaryPrompt:
        "Summarise this sales qualification call in 2-3 sentences. Note: business described, main pain point, timeline, and whether a booking was made.",
    },
  };
}

// ── Create or fetch assistant ─────────────────────────────────
export async function getOrCreateAssistant(): Promise<string> {
  const env = getEnv();

  if (env.VAPI_ASSISTANT_ID) {
    logger.info("Using existing Vapi assistant", {
      assistantId: env.VAPI_ASSISTANT_ID,
    });
    return env.VAPI_ASSISTANT_ID;
  }

  logger.info("Creating new Vapi assistant");
  const config = buildAssistantConfig(env);
  const assistant = await vapiRequest<{ id: string }>("POST", "/assistant", config);

  logger.info("Vapi assistant created — save this ID to VAPI_ASSISTANT_ID env var", {
    assistantId: assistant.id,
  });

  return assistant.id;
}

// ── Update assistant config ───────────────────────────────────
// Call this if APP_URL changes (e.g., after deploying to custom domain)
export async function updateAssistant(assistantId: string): Promise<void> {
  const env = getEnv();
  const config = buildAssistantConfig(env);
  await vapiRequest("PATCH", `/assistant/${assistantId}`, config);
  logger.info("Vapi assistant updated", { assistantId });
}

// ── Trigger outbound call ─────────────────────────────────────
export async function triggerOutboundCall(opts: {
  lead_id: string;
  phone: string;
  language: Language;
  lead_name?: string;
  business?: string;
}): Promise<string> {
  const { lead_id, phone, language, lead_name, business } = opts;

  return withRetry(
    async () => {
      const assistantId = await getOrCreateAssistant();

      const callPayload = {
        assistantId,
        customer: {
          number: phone,
          name: lead_name ?? undefined,
        },
        phoneNumberId: getEnv().TWILIO_PHONE_NUMBER_SID,
        // Pass context to the assistant so it can personalise the call
        assistantOverrides: {
          metadata: {
            lead_id,
            language,
            lead_name: lead_name ?? null,
            business: business ?? null,
          },
          variableValues: {
            language,
          },
        },
      };

      const call = await vapiRequest<{ id: string }>("POST", "/call", callPayload);

      logger.info("Vapi outbound call initiated", {
        lead_id,
        channel: "vapi",
        provider: "vapi",
        call_id: call.id,
        to: phone,
      });

      return call.id;
    },
    { name: "vapi.triggerOutboundCall", lead_id }
  );
}

// ── Validate Vapi webhook signature ──────────────────────────
export async function validateVapiSignature(
  body: string,
  signature: string | null
): Promise<boolean> {
  const env = getEnv();
  if (!env.VAPI_WEBHOOK_SECRET) return true; // Not configured — skip validation
  if (!signature) return false;

  // Vapi uses HMAC-SHA256
  // signature header: X-Vapi-Signature
  const { createHmac, timingSafeEqual: tse } = await import("crypto");
  const expected = createHmac("sha256", env.VAPI_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  return tse(Buffer.from(signature), Buffer.from(expected));
}
