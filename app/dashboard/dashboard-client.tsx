"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Lead, LeadStatus } from "@/types";

// ============================================================
// Dashboard client component
// Handles lead list rendering, filtering, status tagging
// ============================================================

interface Stats {
  leadsThisWeek: number;
  bookedThisWeek: number;
  conversionRate: number;
  totalLeads: number;
  appUrl: string;
}

export default function DashboardClient({
  leads,
  stats,
}: {
  leads: Lead[];
  stats: Stats;
}) {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const router = useRouter();

  const filtered = leads.filter((l) => {
    if (filter !== "all" && l.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.name?.toLowerCase().includes(q) ||
        l.phone?.includes(q) ||
        l.email?.toLowerCase().includes(q) ||
        l.business?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Capital AI Growth</span>
          <span style={{ color: "var(--color-muted)", marginLeft: 12, fontSize: 13 }}>
            Lead System
          </span>
        </div>
        <button onClick={handleSignOut} style={{ fontSize: 12 }}>
          Sign out
        </button>
      </header>

      <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <StatCard label="Leads this week" value={stats.leadsThisWeek} />
          <StatCard label="Booked this week" value={stats.bookedThisWeek} />
          <StatCard label="Conversion rate" value={`${stats.conversionRate}%`} />
          <StatCard label="All-time leads" value={stats.totalLeads} />
        </div>

        {/* Controls */}
        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            placeholder="Search by name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 160 }}
          >
            <option value="all">All statuses</option>
            <option value="new">New</option>
            <option value="call_queued">Call queued</option>
            <option value="calling">Calling</option>
            <option value="qualified">Qualified</option>
            <option value="booked">Booked</option>
            <option value="no_show">No-show</option>
            <option value="call_failed">Call failed</option>
            <option value="closed_won">Closed won</option>
            <option value="closed_lost">Closed lost</option>
            <option value="needs_nurture">Nurture</option>
          </select>
          <span
            style={{ marginLeft: "auto", fontSize: 12, color: "var(--color-muted)" }}
          >
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Lead table */}
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
        >
          {filtered.length === 0 ? (
            <div className="empty-state">
              <p style={{ fontSize: 15, marginBottom: 4 }}>No leads yet</p>
              <p style={{ fontSize: 13 }}>SMS +61 7 4428 7400 to create the first one</p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Source</th>
                    <th>Lang</th>
                    <th>Score</th>
                    <th>Status</th>
                    <th>Booking</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      onClick={() => setSelectedLead(lead)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lead detail panel */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onUpdate={(updated) => {
            setSelectedLead(updated);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="card" style={{ padding: "16px 20px" }}>
      <div style={{ fontSize: 11, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function LeadRow({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const score = lead.qualification_score;
  const scoreClass = score
    ? score >= 7
      ? "score-high"
      : score >= 4
        ? "score-mid"
        : "score-low"
    : "";

  const statusClass = {
    new: "status-new",
    booked: "status-booked",
    calling: "status-calling",
    call_failed: "status-failed",
    closed_won: "status-won",
    closed_lost: "status-lost",
    qualified: "status-new",
  }[lead.status as string] ?? "status-new";

  const bookingDate = lead.booking_time
    ? new Date(lead.booking_time).toLocaleDateString("en-AU", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "Australia/Brisbane",
      })
    : "—";

  const createdDate = new Date(lead.created_at).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Brisbane",
  });

  return (
    <tr
      onClick={onClick}
      style={{ cursor: "pointer" }}
      title="Click to view details"
    >
      <td style={{ fontWeight: 500 }}>{lead.name ?? <span style={{ color: "var(--color-muted)" }}>Unknown</span>}</td>
      <td style={{ fontFamily: "monospace", fontSize: 12 }}>{lead.phone ?? "—"}</td>
      <td style={{ fontSize: 12, color: "var(--color-muted)" }}>{lead.source}</td>
      <td>
        <span className="lang-badge">{lead.language}</span>
      </td>
      <td>
        {score ? (
          <span className={`score-badge ${scoreClass}`}>{score}</span>
        ) : (
          <span style={{ color: "var(--color-muted)" }}>—</span>
        )}
      </td>
      <td>
        <span className={`status-badge ${statusClass}`}>
          {lead.status.replace(/_/g, " ")}
        </span>
      </td>
      <td style={{ fontSize: 12 }}>{bookingDate}</td>
      <td style={{ fontSize: 12, color: "var(--color-muted)" }}>{createdDate}</td>
    </tr>
  );
}

function LeadDetail({
  lead,
  onClose,
  onUpdate,
}: {
  lead: Lead;
  onClose: () => void;
  onUpdate: (updated: Lead) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(lead.status);

  const handleStatusChange = useCallback(
    async (newStatus: LeadStatus) => {
      setSaving(true);
      try {
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          const data = (await res.json()) as { lead: Lead };
          setStatus(newStatus);
          onUpdate(data.lead);
        }
      } finally {
        setSaving(false);
      }
    },
    [lead.id, onUpdate]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(600px, 100vw)",
          background: "var(--color-surface)",
          borderLeft: "1px solid var(--color-border)",
          zIndex: 50,
          overflowY: "auto",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
            {lead.name ?? "Unknown Lead"}
          </h2>
          <button onClick={onClose} style={{ padding: "4px 12px" }}>✕</button>
        </div>

        {/* Contact info */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Contact</div>
          <Grid2>
            <Field label="Phone" value={lead.phone ?? "—"} mono />
            <Field label="Email" value={lead.email ?? "—"} />
            <Field label="Source" value={lead.source} />
            <Field label="Language" value={lead.language.toUpperCase()} />
            <Field label="Business" value={lead.business ?? "—"} />
            <Field
              label="Score"
              value={lead.qualification_score ? `${lead.qualification_score}/10` : "—"}
            />
          </Grid2>
        </div>

        {/* Booking */}
        {lead.booking_time && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Booking</div>
            <Field
              label="Scheduled"
              value={new Date(lead.booking_time).toLocaleString("en-AU", {
                timeZone: "Australia/Brisbane",
                dateStyle: "full",
                timeStyle: "short",
              })}
            />
          </div>
        )}

        {/* AI Summary */}
        {lead.ai_summary && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">AI Summary</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>{lead.ai_summary}</p>
          </div>
        )}

        {/* Transcript */}
        {lead.transcript_text && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="section-title">Transcript</div>
            <pre
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
                color: "var(--color-muted)",
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {lead.transcript_text}
            </pre>
          </div>
        )}

        {/* Outcome tagging */}
        <div className="card">
          <div className="section-title">Tag outcome</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[
              { value: "send_proposal", label: "Send proposal" },
              { value: "needs_nurture", label: "Needs nurture" },
              { value: "closed_won", label: "Closed won" },
              { value: "closed_lost", label: "Closed lost" },
              { value: "not_a_fit", label: "Not a fit" },
              { value: "no_show", label: "No-show" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => handleStatusChange(value as LeadStatus)}
                disabled={saving || status === value}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  opacity: status === value ? 0.5 : 1,
                  background: status === value ? "var(--color-accent)" : undefined,
                  borderColor: status === value ? "var(--color-accent)" : undefined,
                  color: status === value ? "#fff" : undefined,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Grid2({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px 16px",
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontFamily: mono ? "monospace" : undefined }}>{value}</div>
    </div>
  );
}
