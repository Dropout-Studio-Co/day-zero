# Day Zero

Track all your goals on one simple board that counts down to each date and is easy to share.

## What it is

Day Zero is a countdown tracker for goals and milestones. Each countdown points at a date, with an optional time of day, and shows the time left. You can use the board without an account; signing in saves it to the server and unlocks sharing and the AI copilot.

## What you can do

- Create a countdown for any goal with a date and an optional time of day.
- See the soonest goal as a large hero countdown, the rest in a grid, and reached dates in their own section below.
- Use the board as a guest (saved in your browser) or sign in with Google or a passkey to sync it across devices.
- Share a countdown as a read-only public link with a full-screen view.
- Ask the AI copilot to add, edit, reorder, or delete countdowns in plain English.

## Requirements

- Bun 1.2 or newer and Node.js 22.12 or newer.
- A Google OAuth 2.0 client for sign-in (you can skip it locally with `E2E_BYPASS_AUTH=true`).
- A Cloudflare account with a D1 database named `day_zero` to deploy.

## Setup

```bash
git clone https://github.com/Dropout-Studio-Co/day-zero.git
cd day-zero
bun install
```

Create a `.dev.vars` file in the project root and fill in your values:

```dotenv
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TOKEN_ENCRYPTION_KEY=
```

Generate `BETTER_AUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`. Apply the database migrations:

```bash
bun run db:migrate:local
```

## Run

```bash
bun run dev       # http://localhost:5173
bun run preview   # production build, then Workers preview at http://localhost:8787
```

To skip Google sign-in locally, set `E2E_BYPASS_AUTH=true` in `.dev.vars`. Run `bun run seed` once to load sample countdowns for the local test user.

## Configuration

Values live in `.dev.vars` locally and as Worker secrets or vars in production.

| Variable                  | Purpose                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`      | Signs sessions. Required.                                                                |
| `BETTER_AUTH_URL`         | App origin, for example `http://localhost:5173`. Required.                               |
| `GOOGLE_CLIENT_ID`        | Google OAuth client ID. Required for sign-in.                                            |
| `GOOGLE_CLIENT_SECRET`    | Google OAuth client secret. Required for sign-in.                                        |
| `TOKEN_ENCRYPTION_KEY`    | Base64 32-byte key that encrypts each user's Cloudflare token. Required for the copilot. |
| `PUBLIC_GOOGLE_CLIENT_ID` | Optional. Enables Google One Tap; the Google button still works without it.              |
| `AI_COPILOT_ENABLED`      | Set to `"false"` to turn the copilot off.                                                |
| `AI_MONTHLY_CAP_USD`      | Optional monthly copilot spend cap in US dollars.                                        |
| `E2E_BYPASS_AUTH`         | Local only. `true` signs requests in as the test user.                                   |

Remote Drizzle commands (`bun run db:push`, `db:pull`, `db:studio`) read `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, and `CLOUDFLARE_D1_TOKEN` from a `.env` file.

**Never enable `E2E_BYPASS_AUTH` in production.** It grants full unauthenticated access.

## Troubleshooting

**Every page returns a 500 after you enable `E2E_BYPASS_AUTH`.** The local D1 database has no tables. Run `bun run db:migrate:local`.

**Google sign-in fails.** Add `http://localhost:5173/api/auth/callback/google` as an authorized redirect URI, and make sure `BETTER_AUTH_URL` matches the URL you open.

**The copilot says your Cloudflare account is not connected.** Open `/settings` and connect your own Cloudflare account (account ID, API token, model), and make sure `TOKEN_ENCRYPTION_KEY` is set. The copilot cannot run fully in local development.

## License

MIT — see [LICENSE](./LICENSE).
