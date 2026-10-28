# MeReporter — deployable package (full build, NOT yet live)

A runnable Next.js 14 (App Router) app for authentic SEO reporting.
It contains **no demo data, no invented rankings, traffic, backlinks, locations
or "connected" states, and no key values** — only env var names.
Everything missing is shown as **no-data** or **draft**, never estimated.

Target live host (not yet deployed): `mereporter.nurulnahid.com`
Supabase project already created (verified separately, not by this repo):
- Name: `mereporter`
- Region: West Europe (London) — `eu-west-2`
- Hostname: `qyrflqvktqzalvfvmjwf.supabase.co`
- Status at creation: Healthy, Nano

## Feature list — what is built

### Pages (all real UI wired to the API routes, not placeholder text)
- **Dashboard (`/dashboard`) — KPI-first:** average SERP rank (null ranks excluded),
  latest audit score, tracked keyword count, imported metric rows, monthly report count.
  Empty projects show honest empty states.
- **Projects (`/projects`):** create + list projects. Owner is always the signed-in user.
- **Rank Tracker (`/rank`):** SERP + GBP keywords stored separately, stored history,
  live SERP check (see DataForSEO below).
- **Competitors (`/competitors`):** stored competitor domains only — no invented
  competitor rank or traffic.
- **Site Audit (`/audit`):** live scan of the project's own URL + scan history.
- **Backlinks (`/backlinks`):** stored backlinks only — no live discovery provider
  is configured, so nothing is invented here.
- **AI Visibility (`/ai-visibility`):** stored prompts with checked / not-checked status.
  No live LLM-answer provider is wired in, so prompts stay "not checked" honestly.
- **GBP & Local (`/gbp-local`):** BrightLocal-style 3×3 grid (green 1–3, orange 4–10,
  red 11+, grey = no-data). Centre via Nominatim geocoding or explicit coordinates.
- **Integrations (`/integrations`):** CSV import for GSC / GA4 / Bing + live config
  booleans (no values) from `/api/health`.
- **Reports (`/reports`):** generate + list monthly draft reports, with per-section
  no-data / partial labelling and SERP/GBP averages.
- **Setup & Team (`/setup`) — admin only:** real user list with approve / reject /
  revoke, all-projects list via the admin server route, and the 10-step Report Guide.

### API routes
- `GET/POST /api/projects` — own projects (admins: all, via the same ownership rules
  in code; the browser list limit is fixed by `/api/admin/projects`).
- `GET/POST /api/rank` — stored keywords + snapshots; live check only with DataForSEO.
- `GET/POST/DELETE /api/competitors`, `GET/POST /api/backlinks`,
  `GET/POST /api/ai-visibility` — stored rows, ownership-checked.
- `GET/POST /api/audit` — live page scan (below).
- `GET/POST /api/gbp-grid` — stored snapshots; live grid only with DataForSEO.
- `GET/POST /api/import` — CSV/JSON import for `gsc | ga4 | bing | csv`; every row
  stores `source` + `imported_at`.
- `GET /api/report`, `POST /api/report` — draft-only monthly report from stored rows.
- `GET /api/admin/projects` — dedicated admin server route using
  `SUPABASE_SECRET_KEY` server-side only. Fixes the admin dashboard list RLS
  limitation (the browser anon client can only see an admin's own projects under
  RLS). Non-admins get 403. No key value is ever returned.
- `GET/POST /api/admin/users` — approve / reject / revoke, admin-only. **Nobody can
  be promoted to admin here:** the effective role is always derived from the two
  admin emails in `lib/access.ts`; any role field in a request is ignored.
- `GET /api/cron/monthly` — scheduler-only, gated by `CRON_SECRET` (503 if unset).
- `GET /api/health` — booleans only, never key values.

### Live site audit (`/api/audit`, `lib/audit.ts`)
Fetches the project's own URL and scores 0–100 from these real checks only
(weights sum to 100): HTTPS 10, HTTP 200 10, title present 10, meta description
present 10, exactly one H1 10, viewport meta 10, image alt coverage (proportional,
max 15), H2 present 5, links present 5, response time under 2s 10, page size
under 500 KB 5. Verified against `https://example.com` during build testing:
score 60, correctly reflecting that page's missing meta description, H1, H2 and links.
Optional PageSpeed data (`GOOGLE_PAGESPEED_API_KEY`) is stored as info only and is
never mixed into the audit score.

### DataForSEO system (`lib/dataforseo.ts`, server-only)
- Reads `DATAFORSEO_LOGIN` and `DATAFORSEO_PASSWORD` from env vars only, Basic Auth,
  POST to the DataForSEO SERP API: live SERP ranks
  (`/v3/serp/google/organic/live/regular`) and GBP/local grid
  (`/v3/serp/google/maps/live/regular`) with location + language params.
- When either env var is unset, routes return `configured:false` and **store nothing**
  — never scrape Google, never fake a rank, never estimate a grid cell.
- A live rank that finds no matching domain in the returned items is stored as
  `rank: null` (no-data), not as rank 0.
- **Billing — read this before enabling:** DataForSEO is **pay-as-you-go, no
  subscription**. The user pays DataForSEO themselves. Muse must NOT subscribe,
  pay, or buy credits for the user. Set the two env vars yourself in Vercel
  (or `.env.local` locally) after creating your own DataForSEO account.
- Add both names (empty) to `.env.example` — done; no values are in this repo.

### Free authentic fallbacks (kept alongside DataForSEO)
- **GSC / GA4 / Bing CSV import** (`/api/import`): every row stored with source +
  import date, labelled imported — never presented as a live sync.
- **Live site audit** (above): needs no key at all.
- **Nominatim geocoding** (`https://nominatim.openstreetmap.org`, with a proper
  `User-Agent` identifying MeReporter): for grid centre coordinates only — never a rank.
- **Stored-data reports** (`lib/report.ts`): SERP and GBP kept separate, null ranks
  excluded from averages, missing sections labelled no-data, partial reports flagged.

### Access model (unchanged, enforced everywhere)
- Admins ONLY: `nurulnahid468@gmail.com` and `amranspixel09@gmail.com`
  (`lib/access.ts`). A signup with one of those emails becomes admin/approved
  automatically; everyone else starts **Pending** and sees only the locked pending screen.
- Approved users see only their own projects; admins see all projects/users via the
  admin server routes. API routes require a valid Supabase JWT + approved profile
  (`lib/auth.ts`); a stored `role: 'admin'` for any other email is downgraded to
  `user` in the API. `/api/projects` never trusts a caller-supplied `owner_id`.
- `pixelamran09@gmail.com` is an approved non-admin test user, NOT an admin, and
  must not be promoted.

## What is live vs no-data

| Area | Live now | No-data until… |
|---|---|---|
| Site audit | Yes — real fetch + real checks, no key | — |
| CSV import (GSC/GA4/Bing) | Yes — stored rows with source + date | Live OAuth sync (see NOT YET READY) |
| Competitors / backlinks / AI prompts | Stored rows only | Live discovery / LLM provider (not built) |
| SERP ranks | Only with DataForSEO keys | `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD` set |
| GBP grid | Only with DataForSEO keys (+ Nominatim centre needs no key) | DataForSEO keys set |
| PageSpeed info | Only with key | `GOOGLE_PAGESPEED_API_KEY` set |
| Monthly reports | Drafts from stored rows | Email sending (see NOT YET READY) |
| Monthly email | No | Resend key + verified sender + recipients |

## Cron timezone — read carefully

**Vercel cron schedules are UTC.** `vercel.json` keeps the schedule at
`0 9 1 * *` (09:00 UTC on the 1st of each month). That is **not** 09:00
Europe/London. The owner must either:
- accept 09:00 UTC, **or**
- change the schedule in the Vercel dashboard to the London equivalent:
  **08:00 UTC in winter** (London = UTC+0) / **07:00 UTC in summer**
  (London = UTC+1), i.e. `0 8 1 * *` in winter, `0 7 1 * *` in summer.

Do NOT claim Vercel cron itself runs in Europe/London time.
Separately, the monthly route itself derives the report month from
**Europe/London time** (`Intl.DateTimeFormat` with `timeZone: 'Europe/London'`),
so a run just after midnight UTC on the 1st still files the report under the
correct London month.

## How to run locally (zip / local run)

```bash
npm install
cp .env.example .env.local   # fill in real values locally only, never commit them
npm run dev                  # http://localhost:3000
npm run build                # production build check
npm start
```
Windows: double-click `start-windows.bat`. Mac: run `start-mac.command`.
Without Supabase values the app runs in honest not-configured mode: sign-in
fails cleanly and `/api/health` reports all booleans false — it does not fake a login.

## How to deploy on Vercel (instructions only — NOT done by this package)

1. Push this folder to the existing repo `https://github.com/nahids01/mereporter`
   (currently README-only; pushing is deliberately NOT done here).
2. In Vercel, import that repo (connect GitHub first), framework: Next.js.
3. In Vercel → Project → Settings → Environment Variables, set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server-only; never expose it to the browser)
   - `CRON_SECRET` (required for the monthly cron route, else it returns 503)
   - Optional: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`,
     `GOOGLE_PAGESPEED_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `REPORT_RECIPIENTS`
4. In Supabase, run `supabase/schema.sql` in the SQL editor for the `mereporter`
   project before first use. It creates profiles/projects/keywords/metric_imports/
   reports plus competitors/audit_scans/backlinks/ai_prompts/gbp_grid_snapshots/
   ranking_snapshots, with RLS mirroring project ownership. It inserts NO seed data.
5. Deploy, then test on the Vercel URL first: sign up → Pending screen → admin
   approves → approved user sees only their own projects → audit runs live →
   rank/grid show configured:false until DataForSEO keys are set → report shows
   no-data where data is missing.
6. Only after that works, add the custom domain in Vercel (Connect External:
   `mereporter.nurulnahid.com`) and add the matching DNS record at the external
   DNS provider. Hostinger was verified to hold NO DNS record for this subdomain,
   and nurulnahid.com's DNS is external, so a Hostinger-only record would not go
   live. Main site `nurulnahid.com` must stay untouched. DNS may be deferred
   (deploy/test first on the Vercel URL) but not permanently skipped for the
   subdomain to go publicly live.

## What is genuinely working in this build

- `npm run build` passes (see build result in the delivery report).
- Supabase auth sign-up / sign-in; admin/approved only for the two initial admin
  emails, everyone else Pending with a locked screen.
- Ownership + admin separation in every API route (JWT + approved profile +
  project ownership; admin role derived from email list only).
- Live audit with a real 0–100 score from real checks (verified on example.com).
- CSV import with source + import date on every row.
- Draft monthly reports from stored rows only, SERP/GBP separate, null ranks
  excluded from averages, partial labelling.
- Admin server routes fixing the RLS list limit, with approve/reject/revoke and
  no admin promotion.
- Cron route gated by `CRON_SECRET` (503 if unset) and London-derived report month.

## NOT YET READY — do not claim otherwise

- **NOT live** on `mereporter.nurulnahid.com` (no Vercel project, no DNS record;
  no code pushed to GitHub and no Vercel deployment made from this package).
- **Live GSC / GA4 / Bing OAuth sync: NOT built.** Needs the owner's Google Cloud
  OAuth client + Bing Webmaster API key and a server OAuth flow. CSV import is the
  authentic path until then. No integration is shown as "connected" without its key.
- **Live email sending: NOT built.** Reports stay `draft` and are never marked
  `sent` until `RESEND_API_KEY` + a verified sender (`RESEND_FROM`) + recipients
  (`REPORT_RECIPIENTS`) are set and a Resend send step is added. No monthly email
  has been sent from this package.
- **Live AI-answer visibility checks: NOT built.** No LLM provider is wired in;
  prompts honestly stay "not checked". Adding one must store provider + timestamp
  with the result, never invent a mention/citation.
- **Live backlink discovery: NOT built.** Backlinks are stored rows only.
- **Live SERP / GBP data: NOT available without the owner's DataForSEO keys**
  (pay-as-you-go, owner pays). Without them those sections are honestly no-data.
- **No white-label PDF export** beyond the on-screen draft report JSON/sections;
  the artifact's white-label report UI is represented here by the draft report
  structure and the Setup Report Guide, not by a printable branded PDF.
