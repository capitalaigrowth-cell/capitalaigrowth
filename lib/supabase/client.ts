"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser client for Client Components (dashboard UI)
// Uses NEXT_PUBLIC_ vars which are baked in at build time — no server secrets
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
    process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]!
  );
}
