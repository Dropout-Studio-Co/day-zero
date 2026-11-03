# AGENTS.md

## Branch Policy (Strict)

**All work must be done on `main`. Never create a new branch unless Rahi explicitly instructs you to do so.**

Guidance for AI coding agent working in this repository.

---

## Frontend-design skill

Follow the workspace selection rule and consult the Mind Palace for brand/voice/design context.
The existing Dropout DS and Day Zero visual language win during constrained work.

---

## Project Overview

**Day Zero** — a goal/milestone **countdown tracker** (a Dropout Studio free/public tool, sibling to `order-processor` and `invoice-generator`). A user creates countdowns toward a target date for a goal, makes many, and sees them all at once on one board: the soonest upcoming goal is promoted to an oversized **hero**, the rest fill a responsive grid, and reached goals collapse into a quieter section. A countdown is either kept or deleted (delete asks for confirmation) — there is no archive. Any countdown can be shared via a read-only public link (`/s/[token]`). An AI copilot manages countdowns in natural language. **No ads.**

**Stack**: SvelteKit 3 + Svelte 5 runes · TypeScript strict · Tailwind v4 (CSS-first; tokens from `@dropout/ds`, vendored) + shadcn-svelte · Better Auth (Google OAuth + Google One Tap + passkey/WebAuthn biometrics; email/password disabled) · Cloudflare D1 + Drizzle · Cloudflare Workers AI (copilot, **BYO** per-user via REST) · GSAP · Bun. Dark-only (`app.html` hardcodes `<html class="dark">`).

**Auth is optional, not a wall**: logged-out visitors get the **full board**, persisted to `localStorage` (`day-zero:guest:v1`); signing in unlocks server storage, cross-device sync, shareable links, and the AI Copilot. The board (`/`) no longer redirects — only `/settings` redirects to `/login` when signed out. No global guard (none in `hooks.server.ts`/`+layout.server.ts`); routes are public by default, but `/api/*` mutations and `/api/ai/*` stay 401-gated. Authed data is scoped to `userId` in D1; guest data lives only in the browser and is migrated into the account on first sign-in (`countdowns.migrateGuestToServer`).

---

## Commands

```bash
bun run dev               # vite dev (--open --host); bindings via the adapter's platform proxy + .dev.vars
bun run build             # production build (Cloudflare adapter)
bun run preview           # build + wrangler dev (full Workers preview)
bun run check             # svelte-check (strict TS) — must be 0 errors/0 warnings
bun run lint              # eslint
bun run format            # prettier --write
bun run test              # vitest unit tests (pure logic only: no DOM, network, or D1)
bun run test:watch        # vitest in watch mode
bun run sync-ds           # re-vendor @dropout/ds from ../../dropout-design-system (rsync --delete)
bun run db:generate       # generate Drizzle migration from schema
bun run db:migrate        # apply migrations to REMOTE D1 (production)
bun run db:migrate:local  # apply migrations to local D1 (dev/preview)
bun run seed              # idempotent local D1 fixtures for e2e-test-user
bun run cf-typegen        # regenerate worker-configuration.d.ts after wrangler.jsonc changes
```

---

## Architecture

### Path aliases

`#lib` → `src/lib/` (SvelteKit default) · `$src` → `src/` (custom; route files import `$src/components/*`). Never use relative paths from route files.

### Design system (`#lib/ds`)

**HARD RULE — the Dropout DS guidelines are binding.** Every UI/design change in this repo MUST obey **`~/Desktop/projects/dropout-design-system/GUIDELINES.md`** — the law for all UI: tokens, typography, layout shells, the shadcn-svelte primitive layer (pinned `components.json` preset + blessed kit), overlay/glass tokens, motion, a11y. Non-negotiable: theme via tokens, **never recolor a component**, components before custom markup. This applies automatically to every UI task whether or not the request mentions it. This project vendors `@dropout/ds` at `src/lib/ds/`.

The frontend runs on the **Dropout Design System**, **vendored** at `src/lib/ds/` — NOT an npm/`file:` dependency (a sibling-path dep breaks Cloudflare git-push auto-deploy). `app.css` imports `tailwindcss`, `ds/styles/tokens.css` + `ds/styles/animations.css` (ink ramp, semantic aliases, type scale, fonts, `--ease`, base layer), `tw-animate-css`, and `lib/styles/chat-animations.css` (copilot motion). DS exports `cn`, editorial components (`Cta`, `IconButton`, `Heading`, `Eyebrow`, `Input`, `Tile`, `Select`, `StatusBadge`, and the `Settings*` shell family), biometric helpers (`isPlatformAuthenticatorAvailable`/`detectPlatform`/`biometricLabel`), and style-string consts (`inputBase`, `labelBase`, `tileBase`, …). `StatusBadge` is the only sanctioned break from monochrome — it renders the `--status-connected` mint for the live "connected" state. DS law: monochrome black-led ink ramp, ONE `signal` accent, editorial/typographic, restraint hierarchy, ↗ glyph, dark canonical. **Never hand-edit `src/lib/ds/`** — edit upstream then `bun run sync-ds`.

### Domain

- `src/lib/types.ts` — `Countdown` ({ id, title, `targetAt` (ISO UTC string), hasTime, shareToken, position, createdAt }), `CountdownInput`, `CountdownPatch`, `PublicCountdown`, `AppConfig`. **No per-countdown color**, **no `note`**, and **no `archived`** (all dropped) — differentiation is typographic; a countdown is kept or deleted, never archived.
- `src/lib/server/schema.ts` — Drizzle: Better Auth tables (`users`, `sessions`, `accounts`, `verifications`, `passkeys` (WebAuthn creds), `rate_limits` (DB-backed rate limiting)) + `countdowns` + `user_settings` (per-user BYO-Cloudflare creds; AES-GCM-encrypted token blob) + AI tables (`ai_conversations`, `ai_messages`, `ai_actions`). Snake_case columns (Better Auth adapter invariant). `share_token` is unique & nullable.
- `src/lib/server/repositories/countdowns.ts` — `listByUser`, `create`, `update`, `remove`, `reorder`, `setShare`, and the one cross-user read `getByShareToken` (returns only the safe public projection — never owner/ids). `repositories/state.ts` exposes `loadAppState` (the `+page.server.ts`/chat board projection).
- `src/lib/server/{api,db,auth,dto,validation}.ts` — `requireApiContext`/`parseJson`/`ok`, Drizzle factory, Better Auth factory (Google OAuth + `oneTap()` + `passkey()` plugins; DB rate-limiting via `rate_limits`; 5-min signed session cookie cache; passkey `rpID`/`origin` derived from `BETTER_AUTH_URL` so dev/preview/prod all work), row→domain mappers, Zod request schemas. `src/lib/auth-client.ts` is the browser client (`passkeyClient` + `oneTapClient`, reads `PUBLIC_GOOGLE_CLIENT_ID`). `server/crypto.ts` (WebCrypto AES-GCM for the token at rest) + `server/ai/{cloudflare-config,run-rest,errors}.ts` back the BYO Copilot.
- REST: `src/routes/api/countdowns/{+server (GET/POST/PUT-reorder), [id]/+server (PATCH/DELETE), [id]/share/+server (POST/DELETE)}`.

### Stores (factory-closure runes singletons)

- `src/lib/stores/clock.svelte.ts` — **single shared 1Hz ticker** (`clock.now`). Every card derives remaining time from it; never one interval per card.
- `src/lib/stores/countdowns.svelte.ts` — board state. An `authed` flag (set at hydrate) routes writes: authed → D1 (title edits debounced, structural changes immediate); guest → `localStorage` synchronously (creates mint their own id/position client-side). `loadGuest`/`migrateGuestToServer` bridge the two. Derived partitions `active`/`upcoming`/`past`/`hero`; `upcoming`/`past` read `clock.now` so the board re-partitions the instant a countdown crosses zero. `aiInject`/`aiRemove` are local-only mutators the copilot uses to reflect its API writes.
- `src/lib/stores/ai.svelte.ts` — copilot state (conversations, messages, confirm queue, undo).

### UI

- `src/routes/+page.svelte` — the board. Server data is seeded ONCE inside `untrack()` (`countdowns.hydrate` + `ai.hydrate`); a separate `onMount` bridge then runs the browser-only guest path (authed → `migrateGuestToServer`, guest → `loadGuest`). Hero + grid + past sections; `use:reveal` entrance motion. Guests see `SignInButton`; the share control is hidden when logged out (`canShare`).
- `src/components/` (app components, imported via `$src/components/*`) — `CountdownDisplay` (the shared boxed-tile digits unit with tick animation; hero/card/share sizes; reads the clock), `CountdownHero`, `CountdownCard`, `CountdownCalendar` (local DS-styled date picker built on the bits-ui Calendar primitive — replaces the unthemeable native `<input type="date">`; bindable `@internationalized/date` `DateValue`), `CountdownComposerDialog` (create/edit; uses `CountdownCalendar` + Switch-gated 12h AM/PM time → absolute UTC ISO), `ShareDialog`, `SectionEyebrow`, `EmptyState`, `Navbar` (invisible, in-flow top nav holding the `SignInButton`/`User` auth controls; shifts left when the copilot rail opens), `SignInButton`, `User`, `ai/*` (copilot UI — overlay drawer: `AiDesktopLauncher`/`AiSidebar` on lg+, `AiMobileFab`/`AiMobileSheet` on mobile). shadcn-svelte primitives live separately in `#lib/components/ui/*` (auto-generated — don't hand-edit).
- `src/routes/login/+page.svelte` — three sign-in paths: "Continue with Google" (social OAuth), auto-prompted Google One Tap (only when `PUBLIC_GOOGLE_CLIENT_ID` is set + in browser), and "Sign in with Face ID / Touch ID" (WebAuthn platform biometrics; hidden where the browser lacks WebAuthn). Passkeys are _registered_ in `/settings`, not here.
- `src/routes/changelog/+page.svelte` — public, static changelog page; entries sourced from `src/lib/data/changelog.ts`. `src/routes/settings/+page.svelte` — BYO-Cloudflare connect form (account id + API token + model picker) **+ Face ID / Touch ID management** (list / add / remove; platform-biometric only — `authenticatorAttachment: "platform"`, no roaming security keys).
- `src/lib/countdown/format.ts` — pure, SSR-safe time math (`remaining`, `humanize`, `formatTargetDate`). Granularity rule: **live seconds ALWAYS tick** (hero, cards, share, zen alike); the Days segment leads only once ≥1 full day remains, else H/M/S. `hasTime` no longer affects segments. `now` is passed in (never read inside) so server/first-client renders match.

### Share (public)

`src/routes/s/[token]/` — public/unauthenticated (no guard; the board no longer walls anything). Loads via `getByShareToken`; 404 if the token isn't shared. Reuses `CountdownDisplay`; supports full-screen zen mode. Dynamic OG/Twitter meta.

### AI Copilot (BYO Cloudflare)

Gated by `AI_COPILOT_ENABLED` (set `"false"` to disable) **and signed-in only**. Inference runs on the **end user's OWN Cloudflare account over the Workers AI REST API** (`POST /accounts/{id}/ai/run/{model}`, billed to them) — **NOT** the bound `env.AI` (retained for typing/compat only); **no AI Gateway, no RAG/Vectorize**. The user connects their account at `/settings` (account id + account-scoped API token + model from `/api/cf/models`); the token is AES-GCM-encrypted at rest in `user_settings` (`crypto.ts`, key from `TOKEN_ENCRYPTION_KEY`). `src/lib/server/ai/run-rest.ts` does the REST call + model catalog; `src/lib/ai/client.ts` buffers one turn into frames. The chat route resolves creds via `server/ai/cloudflare-config.ts` and returns **412 `cloudflare_not_connected`** (pointing to `/settings`) when unconnected. Five tools (`createCountdown`/`updateCountdown`/`reorderCountdowns` = Tier A auto-apply; `deleteCountdown`/`setShareCountdown` = Tier B, require confirmation), each with a Zod schema (`schemas.ts`), a client executor wired to the countdowns store (`tools.ts`), and an inverse for undo (`inverse.ts` / server `ai-undo.ts`). The model receives the user's current countdowns + today's date each turn (`context.ts`, `prompts.ts`). Chat route (`api/ai/chat`) keeps the load-bearing imperative-retry + false-claim suppression + text-JSON tool-call salvage. Conversations/messages/actions persist in D1; quota/spend caps degrade gracefully when `AI_QUOTA_KV` is absent. **The Copilot can't be exercised in local dev** (needs a real connected account + remote Workers AI) — verify after deploy.

---

## Conventions & Warnings

- **Svelte 5 runes only** — `$state`/`$derived`/`$props`/`$effect`; never `export let` or `$:`. Arrow functions, double quotes, tabs, no trailing commas (Prettier).
- **`untrack()` hydration** — `+page.svelte` seeds SERVER data once inside `untrack()`. Do not add a second server-hydrate path; the guest `localStorage` re-seed is the separate `onMount` bridge (browser-only, additive).
- **Snake_case D1 columns** — required by the Better Auth Drizzle adapter; renaming breaks auth.
- **Two `cn()`** — use `#lib/ds/utils.js` `cn()` inside DS-token markup (handles custom `text-*` sizes); `#lib/utils.js` `cn()` everywhere else. Countdown digits use plain Tailwind `text-*` sizes + `tabular-nums`.
- **GSAP only via `#lib/motion`** — never a top-level `import ... from "gsap"` (SSR-unsafe on Workers). All motion respects `prefers-reduced-motion`.
- **Never nest `<button>` in `<button>`** — SSR auto-closes and desyncs hydration (whole-app double-render). Use `div[role="button"]` + tabindex/keydown, inner actions `stopPropagation`.
- **Vendored DS is read-only** — edit upstream + `sync-ds`.
- **Icons via `@lucide/svelte`** — import named icon components (e.g. `Fingerprint`, `ArrowLeft`); scoped package, not `lucide-svelte`. No inline SVGs.
- **`E2E_BYPASS_AUTH`** — `=true` in `.dev.vars` (gitignored; never `wrangler.jsonc`/prod) skips Google OAuth by synthesizing a session, upserting an `e2e-test-user` row on **every** request. **Double-gated**: the flag **and** a localhost request host (see the "Test auth & mock data" section). So an **unmigrated local D1 → 500 on every route**; run `bun run db:migrate:local` first.
- **Before every commit**: `bun run check` (0 errors/0 warnings) + `bun run lint` must pass.
- **Tests**: `bun run test` runs `src/**/*.test.ts` (pure logic only — no DOM, network, D1, or browser). The vendored DS contract scripts (`src/lib/ds/*.test.js`) are plain `node --test` files and are intentionally outside the vitest glob; run them with `node --test src/lib/ds/*.test.js`. CI (`.github/workflows/ci.yml`) runs secrets/audit/lint, types/tests, and build as three parallel jobs; deploy stays with Workers Builds.

---

## Test auth & mock data (dev only)

**Reach the signed-in board locally without Google OAuth** — for manual, Playwright, and curl checks. (email/password is disabled, so there is no password to seed; the bypass injects a session directly.)

- **Test user:** `e2e-test-user` / `e2e@test.local` — synthesized into `event.locals.{user,session,currentUser}` by `hooks.server.ts`.
- **Activate:** already on — `.dev.vars` (gitignored) carries `E2E_BYPASS_AUTH=true`. The bypass is **double-gated (defense in depth)**: the flag **AND** a `localhost`/`127.0.0.1` request host, so it is inert on the prod domain even if the flag ever leaked. Primary safety is still flag-absence — Cloudflare never uploads `.dev.vars`. Works under `bun run dev` (5173), where `event.url` stays on localhost. Under `wrangler dev`/`preview` the custom-domain route can rewrite `event.url` to `day-zero.dropoutstudio.co`, which makes the host gate inert; pass `--var` overrides and a config without `routes` when a local signed-in run is needed.
- **Seed the board:** `bun run db:migrate:local` (once) → `bun run seed`. Idempotent (`seed/seed.sql`, fixed ids + `INSERT OR REPLACE`); inserts realistic countdowns for the test user — a soonest-upcoming **hero**, an upcoming grid, and one reached goal in the "past" section. Evergreen (relative dates), so it never expires.
- **⚠️ NEVER enable in production.** `E2E_BYPASS_AUTH` must never appear in `wrangler.jsonc` `[vars]` or secrets — it grants full unauthenticated access. The real Google OAuth / passkey path is byte-for-byte unchanged; the bypass is an additive, gated branch.

---

## Cloudflare bindings & production

Bindings are read as `env` from **`cloudflare:workers`** (SvelteKit 3 dropped the Cloudflare `platform` shim) and typed by the `Cloudflare.Env` augmentation in `src/app.d.ts` — no generated `worker-configuration.d.ts` is needed. `wrangler.jsonc`: `DB` (D1 `day_zero`, required — absent at runtime, `/api/*` returns 503), `AI` (Workers AI, `remote: true` — typing/compat only; inference is BYO REST), `AI_QUOTA_KV` (optional quota/spend + `cf-models` cache). `compatibility_flags: ["nodejs_compat"]` is **required** — Better Auth and the AI layer use Node built-ins; removing it breaks auth at runtime. `account_id` = Personal. Served ONLY on the custom domain `day-zero.dropoutstudio.co` (`workers_dev: false`, `preview_urls: false` — one canonical origin for OAuth/CSRF). Vars: `BETTER_AUTH_URL`, `AI_COPILOT_ENABLED`, `AI_MONTHLY_CAP_USD`, `PUBLIC_GOOGLE_CLIENT_ID` (browser-public, non-secret — enables Google One Tap; empty → One Tap stays off but the Google button still works). Passkey `rpID`/`origin` are auto-derived from `BETTER_AUTH_URL` — no extra config.

**Secrets** (`wrangler secret put`): `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (base64 32 bytes — encrypts each user's BYO Cloudflare token; copilot is disabled without it).

Google OAuth must register `https://day-zero.dropoutstudio.co/api/auth/callback/google`; One Tap uses the same client id in the public `PUBLIC_GOOGLE_CLIENT_ID` var. Apply remote migrations before schema-dependent releases. Pushes auto-deploy through Cloudflare Workers Builds; never run a routine manual deploy command. Each user connects their own Cloudflare account at `/settings` to use the Copilot.

<!-- SWISS-DESIGN-GLOBAL -->

## Swiss Design — mandatory for all frontend/UI work

For every website and web application, **always apply Swiss International Style principles to all frontend UI and design work, without exception. This is the required structural baseline, not an optional aesthetic direction.** Before creating, editing, reviewing, or auditing UI, read and follow `/Users/beyourahi/.agents/skills/swiss-design/SKILL.md`; when the stack is not Tailwind, translate the implementation syntax while preserving the principles. Enforce its grid-first, mobile-first, typographic, whitespace, hierarchy, restrained-color, responsive, and accessibility rules. Express project and client branding inside this system; brand requirements do not waive the Swiss principles. This directive supersedes conflicting optional style defaults elsewhere.
