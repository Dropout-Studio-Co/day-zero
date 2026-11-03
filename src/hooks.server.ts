import type { Handle, HandleServerError } from "@sveltejs/kit/hooks";

/**
 * SvelteKit server hooks. Owns request-scoped auth resolution and response hardening.
 * - `handle`: per-request — instantiates Better Auth, resolves session into event.locals
 *   (user/session/currentUser), delegates Better Auth's own routes, and stamps security
 *   headers (CSP etc.) on EVERY response.
 * - `handleError`: server error → UUID-correlated log + sanitized App.Error.
 * Graceful degradation: if D1 (event.env.DB) is absent, auth is silently disabled
 * and every request is treated as unauthenticated (locals nulled).
 */
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/env";
import { drizzle } from "drizzle-orm/d1";
import { createAuth } from "#lib/server/auth.js";
import { users } from "#lib/server/schema.js";
import { getCurrentUser } from "#lib/hooks/index.js";
import { env } from "cloudflare:workers";

// Google One Tap loads the GSI script + renders a FedCM iframe from accounts.google.com,
// so script-src/style-src/frame-src must allow it. Passkey/WebAuthn needs no CSP change.
const CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com/gsi/style",
	"font-src https://fonts.gstatic.com",
	"img-src 'self' data: https://lh3.googleusercontent.com",
	"connect-src 'self' https://accounts.google.com/gsi/",
	"frame-src https://accounts.google.com/gsi/",
	"frame-ancestors 'none'"
].join("; ");

const SECURITY_HEADERS = {
	"Content-Security-Policy": CSP,
	"X-Content-Type-Options": "nosniff",
	"X-Frame-Options": "DENY",
	"Referrer-Policy": "strict-origin-when-cross-origin",
	// `identity-credentials-get` is required for the modern FedCM-based Google One Tap prompt.
	"Permissions-Policy":
		'camera=(), microphone=(), geolocation=(), identity-credentials-get=(self "https://accounts.google.com")'
} as const;

/**
 * Sets SECURITY_HEADERS on the response. Some responses (e.g. from svelteKitHandler) carry
 * immutable headers; setting then throws, so the catch path clones the response into a fresh
 * mutable Headers and reapplies. Returns a response that always carries the security headers.
 */
const applySecurityHeaders = (response: Response): Response => {
	try {
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
			response.headers.set(key, value);
		}
		return response;
	} catch {
		const newResponse = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers: new Headers(response.headers)
		});
		for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
			newResponse.headers.set(key, value);
		}
		return newResponse;
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	// Skip auth wiring during prerender/build: platform bindings are unavailable.
	if (building) {
		return resolve(event);
	}

	const db = env.DB;

	if (!db) {
		console.warn("D1 database not available - auth disabled");
		event.locals.user = null;
		event.locals.session = null;
		event.locals.currentUser = null;
		return resolve(event);
	}

	// AI_COPILOT_ENABLED kill switch — enforced server-side (not just in the UI) for
	// every /api/ai/* handler at one chokepoint, so the copilot truly stops when off.
	if (event.url.pathname.startsWith("/api/ai/") && env.AI_COPILOT_ENABLED === "false") {
		return new Response(JSON.stringify({ code: "ai_disabled", error: "AI Copilot is disabled" }), {
			status: 503,
			headers: { "content-type": "application/json" }
		});
	}

	// Synthesizes event.locals to bypass Google OAuth for local dev / Wrangler preview only.
	// DOUBLE-GATED (defense in depth):
	//   (1) E2E_BYPASS_AUTH=true — lives in .dev.vars (gitignored); MUST NOT appear in
	//       wrangler.jsonc/secrets. Cloudflare never uploads .dev.vars, so it can't reach prod.
	//   (2) request host is localhost/127.0.0.1 — so even if the flag ever leaked into a deployed
	//       env, the bypass stays inert on the prod domain (day-zero.dropoutstudio.co).
	// NOT query-param-gated — the removed ?__dev_bypass=1 must not return (a param is attacker-controlled;
	// a bound env var + the request host are not). Covers Vite dev (5173) and Wrangler preview (8787).
	// Synthesizes BOTH user+session so /api/* routes (which gate via requireApiContext) also pass.
	// The user row is upserted (onConflictDoNothing) so FK-bound app data has a real owner.
	// MUST NEVER be enabled in production — it grants full unauthenticated access.
	const isLocalDev = event.url.hostname === "localhost" || event.url.hostname === "127.0.0.1";
	if (isLocalDev && env.E2E_BYPASS_AUTH === "true") {
		const now = new Date();
		const userId = "e2e-test-user";
		const dz = drizzle(db);
		await dz
			.insert(users)
			.values({
				id: userId,
				email: "e2e@test.local",
				emailVerified: true,
				name: "E2E Test User",
				image: null,
				createdAt: now,
				updatedAt: now
			})
			.onConflictDoNothing();
		event.locals.user = {
			id: userId,
			email: "e2e@test.local",
			emailVerified: true,
			name: "E2E Test User",
			image: null,
			createdAt: now,
			updatedAt: now
		} as App.Locals["user"];
		event.locals.session = {
			id: "e2e-test-session",
			userId,
			token: "e2e-test-token",
			expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
			ipAddress: null,
			userAgent: null,
			createdAt: now,
			updatedAt: now
		} as App.Locals["session"];
		event.locals.currentUser = getCurrentUser(event.locals.user);
		return applySecurityHeaders(await resolve(event));
	}

	const authEnv = {
		BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "",
		BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? "http://localhost:5173",
		GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
		GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? ""
	};

	const auth = createAuth(db, authEnv);

	// A getSession failure must not 500 the whole app — treat as unauthenticated instead.
	try {
		const session = await auth.api.getSession({
			headers: event.request.headers
		});

		if (session) {
			event.locals.session = session.session;
			event.locals.user = session.user;
			event.locals.currentUser = getCurrentUser(session.user);
		} else {
			event.locals.session = null;
			event.locals.user = null;
			event.locals.currentUser = null;
		}
	} catch {
		event.locals.session = null;
		event.locals.user = null;
		event.locals.currentUser = null;
	}

	// Better Auth owns its endpoint routes; svelteKitHandler dispatches them, else resolves normally.
	const response = await svelteKitHandler({ event, resolve, auth, building });
	return applySecurityHeaders(response);
};

/**
 * Server error hook. SvelteKit 3 routes every error here — app errors from `error(...)`,
 * framework errors (404s and the like), remote-function validation errors, and unknown
 * throws — discriminated by `kind`. Logs the error with a UUID plus request
 * method/path/stack and returns that UUID with a message that never leaks internals for
 * unknown errors; app and framework errors keep their own safe messages (and statuses).
 */
export const handleError: HandleServerError = async ({ kind, error, event }) => {
	const errorId = crypto.randomUUID();
	const message =
		kind === "unknown"
			? "An unexpected error occurred"
			: ((error as { message?: string }).message ?? "An unexpected error occurred");

	console.error(`[${errorId}] Unhandled error:`, {
		kind,
		message,
		url: event.url.pathname,
		method: event.request.method,
		error:
			error instanceof Error
				? { name: error.name, message: error.message, stack: error.stack }
				: error
	});

	return { message, errorId };
};
