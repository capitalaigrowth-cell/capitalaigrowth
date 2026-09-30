# Capital AI Growth — Lead Qualification & Booking System

**Phase 1 — Money path end-to-end**

> SMS → AI qualification call → booking → calendar event + Google Sheet row

---

## Before you start

You need:
- [ ] All accounts and API keys from the setup checklist (Supabase, Resend, Anthropic)
- [ ] Twilio Account SID + Auth Token
- [ ] Vapi API key
- [ ] Google Cloud service account JSON (Calendar + Sheets API enabled)
- [ ] Vercel account connected to this repository

---

## One-time account setup checklist

### 1. Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → New project
2. Choose a name (e.g. `capitalaigrowth`), choose a strong password, pick the Sydney region
3. When the project loads, go to **Settings → API**
4. Copy:
   - `NEXT_PUBLIC_SUPABASE_URL` (Project URL)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon public key)
   - `SUPABASE_SERVICE_ROLE_KEY` (service_role secret key)
5. Go to **SQL Editor** → paste the contents of `supabase/migrations/001_initial.sql` → click Run
6. Go to **Authentication → Settings → Auth Providers → Email** — make sure it's enabled
7. Go to **Authentication → Users** → **Add user** → create Andy's account with email + password

### 2. Resend (email sending)

1. Go to [resend.com](https://resend.com) → Sign up (free tier: 3,000 emails/month)
2. **Domains** → Add Domain → add `capitalaigrowth.com.au` → follow DNS instructions
3. **API Keys** → Create API Key → copy the key (starts with `re_`)
4. Set `RESEND_FROM_EMAIL=andy@capitalaigrowth.com.au` and `RESEND_FROM_NAME=Andy Young | Capital AI Growth`

### 3. Twilio (SMS)

1. Go to [console.twilio.com](https://console.twilio.com)
2. **Account Info** panel on the dashboard home — copy:
   - Account SID (starts with `AC`)
   - Auth Token (click the eye icon to reveal)
3. The number +61 7 4428 7400 is already purchased — no action needed

### 4. Vapi.ai (AI voice)

1. Go to [dashboard.vapi.ai](https://dashboard.vapi.ai) → Account → API Keys
2. Create a new key and copy it
3. **Webhooks** → add a webhook URL (you'll fill this in after deploying to Vercel):
   `https://your-app.vercel.app/api/webhooks/vapi`
4. Generate a webhook secret and save it

### 5. Anthropic (Claude API)

1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys
2. Create a new key (starts with `sk-ant-`)
3. Set a usage limit in the Billing section (e.g. $20/month hard cap)

### 6. Google Cloud (Calendar + Sheets)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → project `project-5ccb150e-4456-4c72-956`
2. **APIs & Services → Library** → enable:
   - Google Calendar API
   - Google Sheets API
3. **IAM & Admin → Service Accounts** → Create service account:
   - Name: `capitalaigrowth-app`
   - Skip role assignment
4. Click the service account → **Keys** → **Add Key** → JSON → download the file
5. Open the JSON file — you need:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
6. **Share your Google Calendar** with the service account email:
   - Open [Google Calendar](https://calendar.google.com) → Settings → your calendar → Share
   - Add the service account email with "Make changes to events" permission
7. Find your Calendar ID in Settings → your calendar → scroll down to "Calendar ID"
   (for primary calendar it's usually your Gmail address)
8. **Create a new Google Sheet** for leads → share it with the service account email (Editor)
9. Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/THIS_PART/edit`

---

## Deploying to Vercel

### First deploy

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → Import Git Repository → select this repo
3. Framework: **Next.js** (auto-detected)
4. **Environment Variables** — add every variable from `.env.example`:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   TWILIO_ACCOUNT_SID
   TWILIO_AUTH_TOKEN
   TWILIO_PHONE_NUMBER=+61744287400
   TWILIO_PHONE_NUMBER_SID=PNb02cfec15bba2589e6f7b14bb62b0843
   VAPI_API_KEY
   VAPI_WEBHOOK_SECRET
   ANTHROPIC_API_KEY
   GOOGLE_SERVICE_ACCOUNT_EMAIL
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
   GOOGLE_CALENDAR_ID
   GOOGLE_SHEETS_ID
   RESEND_API_KEY
   RESEND_FROM_EMAIL=andy@capitalaigrowth.com.au
   RESEND_FROM_NAME=Andy Young | Capital AI Growth
   APP_URL=https://your-app.vercel.app
   MY_EMAIL=andy@capitalaigrowth.com.au
   MY_PHONE=+61xxxxxxxxx
   MY_NAME=Andy Young
   CRM_DESTINATION=google_sheets
   ```
5. Click **Deploy**

**Important for `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`:** In Vercel, paste the entire key including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`. Vercel handles the newlines correctly.

### After first deploy

1. Copy your Vercel URL (e.g. `https://capitalaigrowth.vercel.app`)
2. Update `APP_URL` env var in Vercel with this URL → Redeploy
3. **Run one-time setup** — log into the dashboard, then visit:
   ```
   https://your-app.vercel.app/api/vapi/setup
   ```
   (POST request — use the browser or curl while logged in)
   This creates the Vapi assistant and sets up the Google Sheet header row.
4. Copy the `vapi_assistant_id` from the response → add it as `VAPI_ASSISTANT_ID` env var → Redeploy

### Wire up Twilio SMS webhook

1. Go to [console.twilio.com](https://console.twilio.com) → Phone Numbers → +61744287400
2. Under **Messaging** → **A Message Comes In**:
   - URL: `https://your-app.vercel.app/api/webhooks/twilio/sms`
   - Method: HTTP POST
3. Save

---

## Testing Phase 1 end-to-end

### Test 1 — English SMS

1. From any phone, send an SMS to **+61 7 4428 7400**:
   ```
   Hi, I run a plumbing company and I need help with lead follow-up
   ```
2. Within 30 seconds you should receive: "Thanks! I'm calling you in about 60 seconds..."
3. ~60 seconds later, your phone rings from the Twilio number
4. Answer the call — the Vapi AI will greet you and ask qualification questions
5. Pick a time slot when offered
6. Check:
   - Google Calendar: event should appear with transcript + AI summary
   - Google Sheet: new row with lead data
   - Your email: lead alert with score and talking points
   - Your phone (the one you tested from): booking confirmation SMS

### Test 2 — Spanish SMS

```
Hola, tengo un negocio de limpieza y necesito automatizar mis presupuestos
```

The response SMS and Vapi call should be in Spanish.

### Test 3 — Portuguese SMS

```
Olá, tenho uma empresa de construção e perco muito tempo com orçamentos
```

The response SMS and Vapi call should be in Portuguese.

### Test 4 — No answer

1. SMS to +61 7 4428 7400 from a phone you won't answer
2. Decline the Vapi call (or let it ring out)
3. Check the lead's `next_call_attempt` is set ~4 hours in the future
4. The cron job runs every 30 minutes to retry

---

## What each file does

```
app/
  api/
    webhooks/
      twilio/sms/    ← Twilio fires this when SMS arrives at +61744287400
      vapi/          ← Vapi fires this for all call events + function calls
      generic/       ← For Typeform, GoDaddy forms, LinkedIn, Meta ads
    calendar/
      slots/         ← Returns available booking slots (used by Vapi during calls)
      book/          ← Creates a booking (used by Vapi during calls)
    leads/           ← Dashboard API (list, create, update leads)
    vapi/setup/      ← One-time: creates Vapi assistant + Sheet header row
    cron/
      retry-calls/   ← Runs every 30min: calls leads who didn't answer
  dashboard/         ← Lead list with status, score, transcript, outcome tagging
  login/             ← Single-user login (Andy only)

lib/
  anthropic/         ← Language detection, lead scoring, summaries
  twilio/            ← SMS sending, signature validation
  vapi/              ← Outbound call trigger, assistant management
  google/
    auth/            ← Service account authentication
    calendar/        ← Free/busy queries, event creation
    sheets/          ← Row append and update
  resend/            ← Booking confirmation emails, Andy alerts
  crm/               ← Pluggable CRM adapter (Sheets by default)
  leads/pipeline/    ← The core orchestration: ingest → call → qualify → book

supabase/
  migrations/001_initial.sql  ← Database schema (run once in Supabase SQL editor)
```

---

## Troubleshooting

### SMS arrives but no auto-reply
1. Check Vercel logs → Functions → `api/webhooks/twilio/sms`
2. Verify `TWILIO_AUTH_TOKEN` matches what's in Twilio console
3. Verify `TWILIO_ACCOUNT_SID` starts with `AC` and matches
4. Check `APP_URL` matches your actual Vercel URL (no trailing slash)

### Auto-reply sent but no Vapi call
1. Check `FEATURE_VAPI_CALLS=true` in env vars
2. Check Vapi dashboard → Calls — did a call attempt appear?
3. Verify `VAPI_API_KEY` and `VAPI_ASSISTANT_ID` are set
4. Check `TWILIO_PHONE_NUMBER_SID=PNb02cfec15bba2589e6f7b14bb62b0843` is correct

### Vapi call works but no calendar event
1. Check `FEATURE_CALENDAR_BOOKING=true`
2. Verify service account email has Editor access to your calendar
3. Check `GOOGLE_CALENDAR_ID` — try setting it to `primary` first

### No Google Sheet row
1. Check `FEATURE_SHEET_SYNC=true`
2. Verify service account email has Editor access to the sheet
3. Check `GOOGLE_SHEETS_ID` is the ID from the URL (the long string between /d/ and /edit)
4. Run setup endpoint again to re-create the header row

### Environment variable errors on deploy
The app validates all env vars on boot. If any are missing, the Vercel deploy will fail with:
```
❌ Environment variable validation failed:
  TWILIO_ACCOUNT_SID: must start with AC
```
Fix the listed variable and redeploy.

---

## Phase 2 (when Phase 1 is validated with real calls)

Phase 2 adds:
- Chat widget + diagnostic for capitalaigrowth.com.au (5-question form → AI plan → callback offer)
- LinkedIn Lead Gen Form webhook
- Meta Lead Ads webhook
- Manual lead entry in dashboard

Do NOT start Phase 2 until at least 3 real leads have been booked through Phase 1.

---

## Cost at 50 leads/month (approx)

| Service | Cost |
|---|---|
| Vercel | $0 (free tier) |
| Supabase | $0 (free tier) |
| Resend | $0 (under 3,000 emails/month) |
| Twilio (SMS + number) | ~$8 |
| Vapi (5 min avg × 50 calls) | ~$25 |
| Anthropic (scoring + detection) | ~$3 |
| Google Cloud | $0 |
| **Total** | **~$36/month** |

Spend caps enforce hard stops at configured limits. Andy gets an email alert at 80%.
