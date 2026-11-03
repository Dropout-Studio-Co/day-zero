/// <reference types="@sveltejs/kit" />
/// <reference types="@cloudflare/workers-types" />

import type { CurrentUser } from "#lib/types.js";
import type { Auth } from "#lib/server/auth.js";

/**
 * SvelteKit App namespace augmentation.
 * - Locals: populated per-request by hooks.server.ts (null when unauthenticated/D1 absent).
 * - Cloudflare.Env: the Worker bindings, read through `env` from "cloudflare:workers"
 *   (SvelteKit 3 dropped the Cloudflare `platform` shim). Optional members
 *   (AI, AI_QUOTA_KV, AI_*, E2E_BYPASS_AUTH) degrade gracefully when unset; DB is required
 *   at runtime for auth, and AI is required for the Copilot chat turn. NO AI Gateway / RAG /
 *   VECTORIZE — the Copilot calls the Workers AI binding directly.
 * - PageData.aiEnabled: feature flag derived from AI_COPILOT_ENABLED in +layout.server.ts.
 * - Error.errorId: UUID correlation id surfaced by both handleError hooks.
 */
declare global {
	namespace App {
		interface Locals {
			user: Auth["$Infer"]["Session"]["user"] | null;
			session: Auth["$Infer"]["Session"]["session"] | null;
			currentUser: CurrentUser | null;
		}

		interface PageData {
			user: Locals["user"];
			currentUser: CurrentUser | null;
			aiEnabled?: boolean;
		}

		interface Error {
			message: string;
			errorId?: string;
		}
	}

	/**
	 * Worker bindings, read as `env` from "cloudflare:workers" by server code.
	 * Merged into the Cloudflare.Env interface declared by @cloudflare/workers-types, so the
	 * shape here is the single source of truth and `wrangler types` output is not required.
	 * Secrets (BETTER_AUTH_SECRET, GOOGLE_*, TOKEN_ENCRYPTION_KEY, E2E_BYPASS_AUTH) live in
	 * .dev.vars locally and `wrangler secret` in production, so they are declared here rather
	 * than in wrangler.jsonc.
	 */
	namespace Cloudflare {
		interface Env {
			DB: D1Database;
			BETTER_AUTH_SECRET: string;
			BETTER_AUTH_URL: string;
			GOOGLE_CLIENT_ID: string;
			GOOGLE_CLIENT_SECRET: string;
			AI?: Ai;
			AI_QUOTA_KV?: KVNamespace;
			AI_COPILOT_ENABLED?: string;
			AI_MONTHLY_CAP_USD?: string;
			TOKEN_ENCRYPTION_KEY?: string;
			E2E_BYPASS_AUTH?: string;
		}
	}
}

export {};
