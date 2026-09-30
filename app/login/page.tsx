"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError("Wrong password — try again.");
        setLoading(false);
      }
    } catch {
      setError("Could not connect — try again.");
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

        <form onSubmit={handleLogin}>
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
              autoFocus
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
              <p style={{ margin: 0, color: "var(--color-danger)", fontSize: 13 }}>{error}</p>
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
