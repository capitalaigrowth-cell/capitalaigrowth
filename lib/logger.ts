// ============================================================
// Structured logger — outputs JSON lines in production
// Every log includes lead_id and channel for traceability
// ============================================================

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogPayload {
  level: LogLevel;
  msg: string;
  lead_id?: string;
  call_id?: string;
  channel?: string;
  attempt?: number;
  provider?: string;
  duration_ms?: number;
  error?: string;
  [key: string]: unknown;
}

function log(payload: LogPayload): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...payload,
  });

  if (payload.level === "error") {
    console.error(line);
  } else if (payload.level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (msg: string, extra?: Partial<LogPayload>) =>
    log({ level: "debug", msg, ...extra }),
  info: (msg: string, extra?: Partial<LogPayload>) =>
    log({ level: "info", msg, ...extra }),
  warn: (msg: string, extra?: Partial<LogPayload>) =>
    log({ level: "warn", msg, ...extra }),
  error: (msg: string, extra?: Partial<LogPayload>) =>
    log({ level: "error", msg, ...extra }),
};

// Wraps an async operation with timing and error logging
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    name: string;
    maxAttempts?: number;
    lead_id?: string;
    channel?: string;
  }
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    try {
      const result = await fn();
      logger.info(`${opts.name} succeeded`, {
        lead_id: opts.lead_id,
        channel: opts.channel,
        attempt,
        duration_ms: Date.now() - start,
      });
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(`${opts.name} failed (attempt ${attempt}/${maxAttempts})`, {
        lead_id: opts.lead_id,
        channel: opts.channel,
        attempt,
        error: lastError.message,
        duration_ms: Date.now() - start,
      });

      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError ?? new Error(`${opts.name} failed after ${maxAttempts} attempts`);
}
