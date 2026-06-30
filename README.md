# Splitter

A free online **bill splitter & group expense calculator**. Create a group, add the
people, log shared expenses, and Splitter instantly works out the simplest way to
settle up — who owes whom and exactly how much. No sign-up, no app to install.

**Live:** https://splitter.xajik0.workers.dev

## Features

- **Groups** — create a party, add people, record expenses
- **Flexible splitting** — split each expense evenly or between just some people
- **Instant settlement** — greedy debt-minimisation shows who owes whom with the fewest transfers
- **Receipts** — attach photos (up to 100 per party) and auto-extract the total with Workers AI
- **Share & seal** — share a group with a link; seal it to produce an immutable, read-only snapshot
- **Default name** — set your name once (stored locally) and you're added to every new group automatically
- **Community stats** — global split distribution over time (day / week / month / year), aggregated across all users
- **History** — recently visited parties are remembered locally (cookie) and shown on the home dashboard
- **Mobile-first add flow** — sticky "+ Add expense" button opens a bottom sheet for fast, repeated entry
- **PWA + SEO** — installable manifest, Open Graph/Twitter cards, JSON-LD, server-rendered landing

## Tech stack

- **Cloudflare Workers** + **[Hono](https://hono.dev)** (TypeScript)
- **KV** (`PARTIES`) — parties, immutable snapshots, global stats, daily AI quota counters
- **R2** (`RECEIPTS`, bucket `splitter-receipts`) — receipt images
- **Workers AI** (`AI`) — receipt total extraction via `@cf/meta/llama-3.2-11b-vision-instruct`
- **Vanilla JS SPA** served inline from a TypeScript template (no client framework)
- **Tailwind CSS** — precompiled and inlined (see [Styling](#styling))

## Project structure

```
src/
  index.ts     Hono app — all routes (pages, API, receipts, SEO endpoints)
  html.ts      The single-page app (HTML + inline JS) returned at "/"
  settle.ts    calculateSettlements() — greedy debt minimisation
  types.ts     Data model (Party, Expense, Receipt, Snapshot, Env)
  styles.ts    AUTO-GENERATED compiled Tailwind CSS (do not edit by hand)
  input.css    Tailwind entrypoint (@tailwind base/components/utilities)
  og.ts        AUTO-GENERATED base64 of the 1200×630 OG image
scripts/
  build-css.mjs  Regenerates src/styles.ts from Tailwind
tailwind.config.js
wrangler.toml    Worker config + bindings (KV / R2 / AI)
```

## Development

```bash
npm install
npm run dev          # wrangler dev on http://localhost:8787
npm run typecheck    # tsc --noEmit
```

### Styling

Styling does **not** use the Tailwind CDN. The CSS is precompiled into `src/styles.ts`
and inlined into the page `<head>`, so there is no render-blocking external request and
no build step at deploy time.

> ⚠️ **If you add or change any Tailwind class, run `npm run build:css`** before deploying,
> or the new class won't be styled. The build scans `src/**` for class names (including
> arbitrary values like `bg-[#1c1c1e]`) and rewrites `src/styles.ts`, which is committed.

## Deployment

```bash
npm run build:css    # only needed if Tailwind classes changed
npm run deploy       # wrangler deploy
```

`wrangler` bundles the TypeScript directly — no separate build step. Bindings (KV, R2, AI)
are defined in `wrangler.toml`.

## Data model & KV schema

- `party:{id}` → mutable `Party` JSON (`people[]`, `expenses[]`, `receipts[]`, `sealed`)
- `snapshot:{id}` → immutable `Snapshot` JSON (the shareable read-only link)
- `stats:bills` / `stats:money` → global all-time counters (bumped on expense add)
- `ai:neurons:{YYYY-MM-DD}` → daily Workers AI neuron usage (UTC, TTL 2 days)

### AI quota

Receipt extraction stays within the Workers AI free tier: a fixed budget (~2,000 neurons)
is committed **before** each call against a daily limit of 10,000 (UTC). When the budget
would be exceeded, extraction is blocked until midnight UTC.

## API routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | The SPA |
| POST | `/api/parties` | Create a party |
| GET | `/api/parties/:id` | Get a party |
| POST/DELETE | `/api/parties/:id/people[/:personId]` | Add / remove a person |
| POST/DELETE | `/api/parties/:id/expenses[/:eid]` | Add / remove an expense |
| GET | `/api/parties/:id/settlements` | Computed settlements |
| POST | `/api/parties/:id/seal` | Seal (lock) a party |
| POST | `/api/parties/:id/share` | Create an immutable snapshot |
| GET | `/api/share/:id` | Get a snapshot |
| POST/DELETE | `/api/parties/:id/receipts[/:rid]` | Upload / delete a receipt |
| POST | `/api/parties/:id/receipts/:rid/extract` | Extract total from a receipt (AI) |
| GET | `/api/ai/quota` | Remaining daily AI quota |
| GET | `/api/stats` | Global counters |
| GET | `/api/stats/series` | Community split distribution over time (day/week/month/year) |
| POST | `/api/summaries` | Batch party summaries (home list) |
| GET | `/receipt/:partyId/:rid` | Serve a receipt image from R2 |
| GET | `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, `/favicon.svg`, `/og.svg`, `/og.png` | SEO / PWA assets |

## SEO

Full meta + Open Graph + Twitter cards, four JSON-LD blocks (`WebApplication`, `FAQPage`,
`WebSite`, `Organization`), a server-rendered landing section (H1, how-it-works, features,
FAQ), `robots.txt`/`sitemap.xml`, a PWA manifest, and a real 1200×630 PNG OG image.

The OG PNG is base64-embedded in `src/og.ts`. To regenerate it, render `og.html` (1200×630)
with a headless Chromium screenshot and re-encode it into `src/og.ts`.

> The biggest remaining ranking lever is a **custom domain** + verification in
> **Google Search Console** with the sitemap submitted — `*.workers.dev` caps rankings.

## Security & abuse protection

- **No secrets in the client or repo** — KV/R2/AI are Cloudflare *bindings*. The one
  secret, `APP_KEY`, is set via `wrangler secret put APP_KEY` and injected into the page
  at runtime (never committed).
- **API key gate** — `/api/*` requires the `X-App-Key` header (enforced only when
  `APP_KEY` is set, so local dev works). It's a deterrent against direct/scripted abuse;
  because a public SPA must send it, it is *not* a defense against a determined attacker.
- **Per-IP daily caps (KV)** on costly actions — party creation and receipt uploads;
  rejections don't write, so the limiter stays within the KV write quota.
- **AI cost cap** — a daily neuron budget (global + per-IP) is *committed before* each
  vision call, so spend can never exceed the cap even on failures/retries.
- **Security headers** on every response: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- **Input limits** — field-length caps, positive-amount checks, 10 MB upload limit,
  MIME allowlist, ≤ 100 receipts/party.

> To set the API key: `npx wrangler secret put APP_KEY` (paste a random value, e.g. `openssl rand -hex 24`).

---

🤖 Built with [Claude Code](https://claude.com/claude-code)
