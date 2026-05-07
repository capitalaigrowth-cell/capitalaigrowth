"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseKey = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const missingConfig = !supabaseUrl || !supabaseKey;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (missingConfig) {
      setError("Supabase environment variables are not configured. Please check Vercel settings.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error — check browser console";
      setError(message);
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
      }}
    >
      <div className="card" style={{ width: 360 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 600 }}>
          Capital AI Growth
        </h1>
        <p style={{ margin: "0 0 24px", color: "var(--color-muted)", fontSize: 13 }}>
          Lead System
        </p>

        {missingConfig && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              background: "rgba(239,68,68,0.1)",
              borderRadius: "var(--radius)",
              border: "1px solid rgba(239,68,68,0.3)",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "var(--color-danger)", fontWeight: 600 }}>
              Configuration missing
            </p>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-danger)" }}>
              NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in Vercel
              environment variables, then redeployed.
            </p>
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 12 }}>
            <label
              htmlFor="email"
              style={{ display: "block", marginBottom: 6, fontSize: 12, color: "var(--color-muted)" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="andy@capitalaigrowth.com.au"
              required
              autoFocus
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="password"
              style={{ display: "block", marginBottom: 6, fontSize: 12, color: "var(--color-muted)" }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div
              style={{
                marginBottom: 12,
                padding: "10px 14px",
                background: "rgba(239,68,68,0.1)",
                borderRadius: "var(--radius)",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
            >
              <p style={{ margin: 0, color: "var(--color-danger)", fontSize: 13, fontWeight: 600 }}>
                Login failed
              </p>
              <p style={{ margin: "4px 0 0", color: "var(--color-danger)", fontSize: 12 }}>
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || missingConfig}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
