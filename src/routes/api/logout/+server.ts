import { redirect } from "@sveltejs/kit";
import { createAuth } from "#lib/server/auth.js";
import type { RequestHandler } from "./$types";
import { env } from "cloudflare:workers";

// Authoritative logout. Better Auth names its session cookie `${prefix}.session_token`; because
// `session.cookieCache` is enabled it ALSO caches a signed session snapshot in a SEPARATE cookie
// `${prefix}.session_data`, and `advanced.useSecureCookies: true` gives both a `__Secure-` prefix in
// prod. getSession trusts the `session_data` snapshot WITHOUT a DB read until its maxAge (5 min), so
// if that cookie survives logout the user stays "logged in" — the exact "logout doesn't stick" bug.
// We therefore (1) best-effort delete the DB session so the token can't be replayed, and (2) expire
// EVERY cookie variant (token + data, secure + bare). Deleting a non-existent cookie is a no-op.
const clearSessionCookies = (cookies: Parameters<RequestHandler>[0]["cookies"]) => {
	// `__Secure-`-prefixed cookies are only accepted/cleared with the Secure attribute set.
	cookies.delete("__Secure-day-zero.session_token", { path: "/", secure: true });
	cookies.delete("day-zero.session_token", { path: "/" });
	cookies.delete("__Secure-day-zero.session_data", { path: "/", secure: true });
	cookies.delete("day-zero.session_data", { path: "/" });
};

// Kill the server-side session row (best-effort). The cookie clearing below is what guarantees the
// browser is logged out, so any failure here is swallowed — never 500 a logout.
const killDbSession = async (event: Parameters<RequestHandler>[0]) => {
	const db = env.DB;
	if (!db) return;
	try {
		const auth = createAuth(db, {
			BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? "",
			BETTER_AUTH_URL: env.BETTER_AUTH_URL ?? "http://localhost:5173",
			GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID ?? "",
			GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET ?? ""
		});
		await auth.api.signOut({ headers: event.request.headers });
	} catch {
		// best-effort — cookie clearing is the source of truth for logout
	}
};

// POST: fetch-based sign-out (returns JSON). GET: plain-anchor navigation (303 → /login).
export const POST: RequestHandler = async (event) => {
	await killDbSession(event);
	clearSessionCookies(event.cookies);
	return Response.json({ success: true });
};

export const GET: RequestHandler = async (event) => {
	await killDbSession(event);
	clearSessionCookies(event.cookies);
	redirect(303, "/login");
};
