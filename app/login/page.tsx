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

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

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
            <p
              style={{
                color: "var(--color-danger)",
                fontSize: 13,
                marginBottom: 12,
                padding: "8px 12px",
                background: "rgba(239,68,68,0.1)",
                borderRadius: "var(--radius)",
              }}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
