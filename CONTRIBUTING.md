# Contributing

Thank you for taking the time to contribute. This guide covers everything you need to work on the project effectively — local setup, conventions, and how to submit changes.

---

## Table of Contents

1. [Contribution Philosophy](#contribution-philosophy)
2. [Local Development Setup](#local-development-setup)
3. [Project Structure](#project-structure)
4. [Coding Standards](#coding-standards)
5. [Git Workflow](#git-workflow)
6. [Commit Message Conventions](#commit-message-conventions)
7. [Reporting Issues and Feature Requests](#reporting-issues-and-feature-requests)
8. [Pull Request Workflow](#pull-request-workflow)
9. [Testing and Validation](#testing-and-validation)
10. [Database Migrations](#database-migrations)
11. [Documentation Standards](#documentation-standards)
12. [Code of Conduct](#code-of-conduct)

---

## Contribution Philosophy

This is a small, focused, single-purpose tool. Correctness and reliability matter more than feature breadth. Contributions should:

- **Solve a concrete problem.** A bug fix does not need surrounding refactors; avoid speculative features and premature abstractions. Three explicit lines beat a premature abstraction.
- **Prefer existing abstractions.** Read the codebase before adding a new utility — the core pipeline is usually already covered under `src/lib/`.
- **Leave the codebase cleaner than you found it.** Small, focused changes over large rewrites.
- **Not introduce security regressions.** Auth flows, session handling, and security headers are sensitive — flag any change that touches them.
- **Respect type safety.** TypeScript strict mode is enabled. No `any`, no loose casts, no suppression comments.
- **Ship self-documenting code.** Code should explain itself through naming and structure. A comment is warranted only when the _why_ is genuinely non-obvious.

When in doubt, open an issue to discuss the change before writing code.

---

## Local Development Setup

### Prerequisites

| Tool                                                            | Minimum Version | Notes                                                 |
| --------------------------------------------------------------- | --------------- | ----------------------------------------------------- |
| [Bun](https://bun.sh)                                           | 1.2+            | Package manager and runtime                           |
| [Node.js](https://nodejs.org)                                   | 20.19+ / 22.12+ | Required by the Vite/SvelteKit toolchain              |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) | 4.x             | Cloudflare Workers CLI, installed as a dev dependency |
| Git                                                             | 2.5+            | Required for worktree support                         |

Authentication uses Google OAuth, so a Google Cloud Console project with OAuth 2.0 credentials is required to exercise auth-gated routes during development.

### Installation

```bash
git clone <repository-url>
cd <project>
bun install
```

### Running the Development Server

```bash
bun run dev
```

This starts the Vite dev server and opens the app in your browser.

> **Note:** The plain Vite dev server does not provide a Cloudflare D1 binding. Authentication is silently disabled and every route treats the session as unauthenticated. Use `bun run preview` (Wrangler-backed) to test auth and D1 locally.

### Environment Variables

Two gitignored env files live at the project root, each read by a different tool. Create them and fill in the values:

```bash
# .dev.vars — read by `wrangler dev` / `bun run preview`
BETTER_AUTH_SECRET     # generate with: openssl rand -base64 32
BETTER_AUTH_URL        # your local dev origin
GOOGLE_CLIENT_ID       # from Google Cloud Console
GOOGLE_CLIENT_SECRET   # from Google Cloud Console

# .env — read by drizzle-kit for remote D1 commands
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_DATABASE_ID
CLOUDFLARE_D1_TOKEN
```

Wrangler reads `.dev.vars` for the Worker runtime; Bun loads `.env` for `bun run` scripts. **Never commit `.dev.vars` or `.env`** — they contain secrets.

### Common Scripts

| Script                     | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `bun run dev`              | Vite dev server                                          |
| `bun run build`            | Production build                                         |
| `bun run preview`          | Build + Wrangler local Workers preview (real D1/runtime) |
| `bun run check`            | TypeScript + Svelte type checking                        |
| `bun run lint`             | Prettier check + ESLint                                  |
| `bun run format`           | Auto-format with Prettier                                |
| `bun run cf-typegen`       | Regenerate Cloudflare Worker type definitions            |
| `bun run db:generate`      | Generate a Drizzle migration from schema changes         |
| `bun run db:migrate:local` | Apply migrations to the local D1 instance                |
| `bun run db:migrate`       | Apply migrations to the remote (production) D1 instance  |

### Regenerating Cloudflare Types

After any change to `wrangler.jsonc`, regenerate the Worker type definitions:

```bash
bun run cf-typegen
```

### Clean Rebuild

If the dev server behaves unexpectedly, do a full clean:

```bash
rm -rf node_modules/ .wrangler/ .svelte-kit/ && bun install
```

---

## Project Structure

The project follows the standard SvelteKit layout:

```
.
├── migrations/          # Drizzle-generated D1 SQL migrations (never edit by hand)
├── src/
│   ├── routes/          # SvelteKit file-based routing (+page, +layout, +server, api/)
│   ├── lib/
│   │   ├── server/      # Server-only code: auth factory, Drizzle schema, repositories, validation
│   │   ├── stores/      # Closure-based Svelte 5 rune stores (*.svelte.ts)
│   │   ├── components/  # UI components (ui/ holds auto-generated shadcn-svelte primitives)
│   │   └── ...          # Domain libraries, utilities, types, config
│   ├── app.css          # Tailwind v4 CSS-first config + global styles
│   ├── app.d.ts         # App.Locals / App.Platform / App.PageData / App.Error types
│   ├── app.html         # HTML shell
│   ├── hooks.server.ts  # Auth session middleware + security headers
│   └── hooks.client.ts  # Client-side error handling
├── static/              # Static assets
├── wrangler.jsonc       # Cloudflare Workers config + bindings
├── vite.config.ts       # Vite config
├── drizzle.config.ts    # Drizzle ORM config
├── tsconfig.json        # TypeScript strict config
└── eslint.config.js     # ESLint flat config
```

### Path Aliases

Use the path aliases declared in `package.json` `imports` (`#lib` for `src/lib/`, with explicit file extensions) and in `vite.config.ts`/`tsconfig.json` (`$src` for `src/`). **Never use relative paths from route files** — always import through an alias.

---

## Coding Standards

### Svelte 5 Runes (mandatory)

Use Svelte 5 rune syntax exclusively. Legacy `export let`, `$:` reactive statements, and `writable` stores for component-local state are not permitted in new code.

```svelte
<script lang="ts">
	// Props
	let { user, onSubmit }: Props = $props();

	// State
	let value = $state("");

	// Derived
	let length = $derived(value.length);

	// Effects — only for synchronizing with external systems
	$effect(() => {
		document.title = value;
	});
</script>
```

Use `onMount` for DOM/lifecycle work. Reach for `$effect` only when reacting to state changes that must synchronize with an external system. Cross-component global state lives in closure-based rune stores in `src/lib/stores/*.svelte.ts` — not Svelte `writable()` stores.

### TypeScript

- Strict mode is enforced. No `any`. No type assertions (`as T`) without justification.
- Use `import type { ... }` for type-only imports.
- Define all component prop types explicitly.
- Use `cn()` from `#lib/utils.js` for conditional or merged class names.

### Tailwind CSS v4

Configuration is CSS-first, living entirely in `src/app.css` via `@import "tailwindcss"` and `@theme`. **There is no `tailwind.config.js` — do not create one.**

- Reference CSS variables for colors; never hardcode raw hex/rgb/oklch values in class attributes.
- The design is dark-only — there is no light mode.

### Vendored & Generated Code — Do Not Hand-Edit

- Files under `src/lib/components/ui/` are auto-generated by the shadcn-svelte CLI. Never modify them by hand — add or update them via `bunx shadcn-svelte@latest add <component>` and wrap them elsewhere if customization is needed.
- If the project vendors a shared design system under `src/lib/ds/`, treat it as read-only — it is a mirror refreshed from upstream, and local edits are overwritten on the next sync.

### Formatting

Formatting is owned entirely by Prettier (with the Svelte and Tailwind plugins). Do not hand-format or fight the formatter — run it before committing:

```bash
bun run format
```

The CI-equivalent check is `bun run lint`.

### Comments

Default to zero comments in shipped code. The only acceptable comment is one that explains a non-obvious _why_ — a hidden constraint, a subtle invariant, or a workaround for a specific upstream bug. Never describe _what_ the code does; that belongs in the names and structure of the code itself. Never remove load-bearing directives (`@ts-*`, `eslint-disable*`, `svelte-ignore`, license headers).

---

## Git Workflow

This project uses **git worktrees** for parallel development. **Never create branches** (`git checkout -b` or `git branch`) — this is a hard requirement of the workspace workflow. All commits go directly to `main`.

### Why Worktrees Instead of Branches

- Multiple contributors (or AI agents) can work on separate features simultaneously without stashing or checkout conflicts.
- Git history stays linear and readable.
- No branch-management overhead.

### Working with Worktrees

```bash
# Start work on a new feature (run from the project root)
git worktree add ../<project>-<feature-name>
cd ../<project>-<feature-name>

# List all active worktrees
git worktree list

# Remove a worktree when the work is merged
git worktree remove ../<project>-<feature-name>

# Clean up stale references
git worktree prune
```

Each worktree shares the same `.git` directory, so commits from any worktree are immediately visible to all others.

---

## Commit Message Conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>: <short description>

[optional body — explains why, not what]
```

### Types

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or capability                  |
| `fix`      | Bug fix                                    |
| `refactor` | Code restructuring with no behavior change |
| `style`    | Visual or UI-only changes                  |
| `chore`    | Tooling, config, dependencies              |
| `docs`     | Documentation changes                      |
| `perf`     | Performance improvements                   |
| `test`     | Adding or updating tests                   |

### Rules

- Subject line: 50–70 characters, imperative mood ("add", "fix", "remove" — not "added", "fixes"), lowercase, no trailing period.
- Body: optional; explain _why_, not _what_.
- One logical change per commit (atomic).
- Never commit `.env`, `.dev.vars`, or any file containing secrets.
- The build must pass at every commit — no broken intermediate states.
- Never reference an AI agent in commit messages (no AI `Co-Authored-By` trailers).

---

## Reporting Issues and Feature Requests

### Before Opening an Issue

1. Search existing issues to avoid duplicates.
2. Confirm the problem reproduces on the latest commit of `main`.

### Bug Reports

A useful bug report includes:

- **Environment** — OS, browser, Bun version, Wrangler version (never paste secrets).
- **Steps to reproduce** — minimal, numbered, and precise.
- **Expected behavior** — what should have happened.
- **Actual behavior** — what happened instead.
- **Evidence** — error messages, console output, or screenshots where relevant.

### Feature Requests

A useful feature request includes:

- **Problem statement** — what are you trying to accomplish?
- **Proposed solution** — how would it work?
- **Alternatives considered** — what else did you evaluate?
- **Scope** — does it fit the tool's focused purpose, or is it a larger architectural change?

Changes that touch the auth flow, security headers, or Cloudflare bindings warrant extra scrutiny — flag them explicitly.

---

## Pull Request Workflow

Because the project commits directly to `main` via worktrees, "pull requests" are collaborative review requests opened against `main`.

### Before Opening a PR

Run the full validation suite and confirm everything passes:

```bash
bun run format   # Auto-format all files
bun run lint     # ESLint + Prettier check
bun run check    # svelte-check TypeScript validation
bun run build    # Confirm the production build succeeds
```

No PR should be opened with failing lint, type, or build errors.

### PR Checklist

- [ ] `bun run check` passes (no TypeScript or Svelte type errors)
- [ ] `bun run lint` passes (no errors or warnings)
- [ ] `bun run format` has been run and the changes are committed
- [ ] `bun run build` succeeds
- [ ] No `.env`, `.dev.vars`, or secret values are committed
- [ ] No `tmp_screenshots/` or `.playwright-cli/` artifacts are committed
- [ ] No `any` types or suppressed TypeScript errors introduced
- [ ] No legacy Svelte patterns (`export let`, `$:`) introduced in component files
- [ ] No relative imports from route files (use path aliases)
- [ ] No hand-edits to auto-generated files under `src/lib/components/ui/`
- [ ] A database migration is generated and tested locally if the schema changed
- [ ] Commit messages follow Conventional Commits and each commit builds independently

### PR Description

Include:

- **What changed** — a brief summary of the modification.
- **Why** — motivation or issue reference.
- **How to test** — steps to verify the change manually.
- **Screenshots** — before/after for any UI change.

### Review Expectations

- Reviews focus on correctness, security, scope, and fit with the existing architecture — not style preferences that Prettier already handles.
- Expect extra scrutiny on auth-related changes, security headers, and new D1 queries.
- Address review comments with follow-up commits, not force-pushes. Resolve threads explicitly.

---

## Testing and Validation

There is currently no automated test suite configured. Validation is done through the type checker, linter, build, and manual testing.

### Required Validation Steps

```bash
bun run check   # svelte-check — TypeScript and Svelte-specific issues
bun run lint    # ESLint + Prettier
bun run build   # Confirms the production build succeeds
```

Run all three before every commit. Never commit a build that fails any of them. For UI changes, verify visually (screenshot or Playwright) and check both desktop and mobile breakpoints.

### Adding Tests

When tests are added, use [Vitest](https://vitest.dev/) — it integrates with the existing Vite setup. Add `vitest` to `devDependencies` and a `test` script to `package.json`, and co-locate test files with their source using the `.test.ts` (or `.spec.ts`) suffix. Prioritize pure functions and the core data pipeline — they give the most coverage per test.

---

## Database Migrations

Persistence uses Cloudflare D1 (SQLite) through Drizzle ORM. **Never edit existing files in `migrations/`** — Drizzle tracks state against them, and modifying them causes schema drift.

### Migration Workflow

```bash
# 1. Edit the schema (src/lib/server/schema.ts)
# 2. Generate a new migration SQL file
bun run db:generate

# 3. Review the generated SQL in migrations/ — verify it does exactly what you intended

# 4. Apply locally and verify the app works
bun run db:migrate:local
bun run dev

# 5. Commit the schema change and migration file together
# 6. Apply to production after merge
bun run db:migrate
```

### Schema Rules

- All column names use `snake_case` — required by the Better Auth Drizzle adapter. Deviations cause silent auth failures.
- Index names should be descriptive and prefixed with the table name.
- Always pair a schema change with a generated migration; never use `db:push` against production.

---

## Documentation Standards

- **`CLAUDE.md`** at the project root is the authoritative architectural reference for AI coding assistants. Keep it accurate and up to date when making structural changes.
- **`CONTRIBUTING.md`** (this file) covers workflow and contributor process.
- **Inline comments** are reserved for non-obvious constraints — never for describing what the code does.

---

## Code of Conduct

This project adopts the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). By participating, you agree to uphold these standards. Report instances of unacceptable behavior to the project maintainer at **beyourahi@gmail.com**.
