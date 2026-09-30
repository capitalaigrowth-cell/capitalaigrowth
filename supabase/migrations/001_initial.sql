-- ============================================================
-- Capital AI Growth — Initial database schema
-- Run this via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ── Webhook idempotency ──────────────────────────────────────
-- Stores (provider, event_id) pairs so duplicate webhooks are ignored
create table if not exists webhook_events (
  id          uuid primary key default uuid_generate_v4(),
  provider    text        not null,
  event_id    text        not null,
  payload     jsonb,
  processed_at timestamptz default now(),
  unique (provider, event_id)
);

-- ── Leads ────────────────────────────────────────────────────
create table if not exists leads (
  id                        uuid primary key default uuid_generate_v4(),
  name                      text,
  phone                     text,                  -- E.164 format, e.g. +61412345678
  email                     text,
  source                    text        not null,  -- sms | chat_widget | linkedin | meta | webhook | manual
  language                  text        not null default 'en', -- en | es | pt
  business                  text,
  problem                   text,
  raw_payload               jsonb       not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Status lifecycle
  status                    text        not null default 'new',
  qualification_score       integer     check (qualification_score between 1 and 10),

  -- Call retry tracking
  call_attempts             integer     not null default 0,
  last_call_attempt         timestamptz,
  next_call_attempt         timestamptz,

  -- Booking
  booking_time              timestamptz,
  booking_calendar_event_id text,

  -- Post-call data
  transcript_url            text,
  transcript_text           text,
  ai_summary                text,
  vapi_call_id              text,

  -- CRM sync
  crm_synced_at             timestamptz,
  crm_record_id             text
);

-- Index for retry cron job: find leads needing a call attempt
create index if not exists leads_next_call_attempt_idx
  on leads (next_call_attempt)
  where next_call_attempt is not null and status = 'call_failed';

-- Index for dashboard ordering
create index if not exists leads_created_at_idx on leads (created_at desc);

-- ── Calls ────────────────────────────────────────────────────
create table if not exists calls (
  id                  uuid primary key default uuid_generate_v4(),
  lead_id             uuid        not null references leads (id) on delete cascade,
  vapi_call_id        text        unique,
  status              text        not null default 'initiated',
  started_at          timestamptz,
  ended_at            timestamptz,
  duration_seconds    integer,
  transcript_text     text,
  recording_url       text,
  qualification_score integer     check (qualification_score between 1 and 10),
  ai_summary          text,
  created_at          timestamptz not null default now()
);

create index if not exists calls_lead_id_idx    on calls (lead_id);
create index if not exists calls_vapi_call_id_idx on calls (vapi_call_id);

-- ── Bookings ─────────────────────────────────────────────────
create table if not exists bookings (
  id                  uuid primary key default uuid_generate_v4(),
  lead_id             uuid        not null references leads (id) on delete cascade,
  call_id             uuid        references calls (id),
  scheduled_at        timestamptz not null,
  duration_minutes    integer     not null default 30,
  calendar_event_id   text,
  meeting_link        text,
  status              text        not null default 'confirmed',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists bookings_lead_id_idx on bookings (lead_id);
create index if not exists bookings_scheduled_at_idx on bookings (scheduled_at);

-- ── Spend log ─────────────────────────────────────────────────
-- Approximate cost tracking for hard caps — not billing
create table if not exists spend_log (
  id            uuid primary key default uuid_generate_v4(),
  provider      text    not null,   -- vapi | anthropic | twilio
  amount_cents  integer not null,
  description   text,
  lead_id       uuid    references leads (id),
  created_at    timestamptz not null default now()
);

create index if not exists spend_log_provider_month_idx
  on spend_log (provider, created_at);

-- ── Trigger: updated_at on leads ─────────────────────────────
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at
  before update on leads
  for each row execute procedure update_updated_at();

create trigger bookings_updated_at
  before update on bookings
  for each row execute procedure update_updated_at();

-- ── Row Level Security ────────────────────────────────────────
-- Service role key (used by all API routes) bypasses RLS automatically.
-- Authenticated users (dashboard) can read and write their own data.
-- This is a single-tenant app — one user (Andy) owns all rows.

alter table leads          enable row level security;
alter table calls          enable row level security;
alter table bookings       enable row level security;
alter table webhook_events enable row level security;
alter table spend_log      enable row level security;

-- Authenticated users can do anything (Andy's dashboard session)
create policy "auth_all_leads"          on leads          for all to authenticated using (true) with check (true);
create policy "auth_all_calls"          on calls          for all to authenticated using (true) with check (true);
create policy "auth_all_bookings"       on bookings       for all to authenticated using (true) with check (true);
create policy "auth_all_webhook_events" on webhook_events for all to authenticated using (true) with check (true);
create policy "auth_all_spend_log"      on spend_log      for all to authenticated using (true) with check (true);
