import { fail, redirect } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import type { Actions, PageServerLoad } from "./$types";
import { getDatabase } from "#lib/server/db.js";
import { userSettings } from "#lib/server/schema.js";
import { deriveTokenKey, encryptToken, decryptToken, maskToken } from "#lib/server/crypto.js";
import { listChatModels, DEFAULT_MODEL, type CfModel } from "#lib/server/ai/run-rest.js";
import { describeCloudflareError } from "#lib/server/ai/errors.js";
import { env } from "cloudflare:workers";

/**
 * Settings page server module. Connects the user's own Cloudflare account so the
 * Copilot runs (and bills) on it (BYO).
 *
 *   load → decrypts the stored token and returns ONLY maskToken(plain) (the raw
 *          secret never leaves the server) + accountId, model, and the cached
 *          model list for the picker. Redirects to /login when signed out.
 *   save → when a new token is supplied, validates it by listing the account's
 *          models (proves token + account + Workers AI permission), caches that
 *          list, then encrypts + upserts. Empty token preserves the existing blob.
 */
export const load: PageServerLoad = async ({ locals, request }) => {
	if (!locals.user) {
		redirect(303, "/login");
	}

	// OS hint for the biometric label — SSR picks the right name (Face ID / Touch ID / …)
	// before the client confirms real availability via UVPAA, avoiding a wrong-name flash.
	const platformHint =
		request.headers.get("sec-ch-ua-platform")?.replace(/^"|"$/g, "") ||
		request.headers.get("user-agent") ||
		"";

	const empty = {
		connected: false,
		accountId: "",
		maskedToken: "",
		model: DEFAULT_MODEL,
		models: [] as CfModel[],
		platformHint
	};

	if (!env.DB) {
		return empty;
	}

	const db = getDatabase(env.DB);
	const rows = await db
		.select()
		.from(userSettings)
		.where(eq(userSettings.userId, locals.user.id))
		.limit(1);
	const row = rows[0];

	let maskedToken = "";
	if (row?.cloudflareTokenEncrypted && env.TOKEN_ENCRYPTION_KEY) {
		try {
			const key = await deriveTokenKey(env.TOKEN_ENCRYPTION_KEY);
			const blob =
				row.cloudflareTokenEncrypted instanceof Uint8Array
					? row.cloudflareTokenEncrypted
					: new Uint8Array(row.cloudflareTokenEncrypted as ArrayBuffer);
			maskedToken = maskToken(await decryptToken(blob, key));
		} catch {
			maskedToken = "(decrypt error)";
		}
	}

	const accountId = row?.cloudflareAccountId ?? "";
	const model = row?.cloudflareModel ?? DEFAULT_MODEL;
	const connected = Boolean(row?.cloudflareTokenEncrypted && accountId);

	// Model list comes from the KV cache (written on save / by /api/cf/models). The
	// client can hit /api/cf/models?refresh=1 to refresh on demand.
	let models: CfModel[] = [];
	if (accountId && env.AI_QUOTA_KV) {
		try {
			const cached = await env.AI_QUOTA_KV.get<{ models?: CfModel[] }>(
				`cf-models:${accountId}`,
				"json"
			);
			if (cached && Array.isArray(cached.models)) {
				models = cached.models;
			}
		} catch {
			// ignore cache read errors — the dropdown falls back to the default option
		}
	}

	return { connected, accountId, maskedToken, model, models, platformHint };
};

export const actions: Actions = {
	save: async ({ request, locals }) => {
		if (!locals.user || !env.DB) {
			return fail(503, { error: "Service unavailable." });
		}

		const data = await request.formData();
		const token = (data.get("cloudflareToken") ?? "").toString().trim();
		const accountId = (data.get("cloudflareAccountId") ?? "").toString().trim();
		const model = (data.get("cloudflareModel") ?? "").toString().trim() || DEFAULT_MODEL;

		const db = getDatabase(env.DB);

		const existing = await db
			.select({
				userId: userSettings.userId,
				cloudflareAccountId: userSettings.cloudflareAccountId,
				cloudflareTokenEncrypted: userSettings.cloudflareTokenEncrypted
			})
			.from(userSettings)
			.where(eq(userSettings.userId, locals.user.id))
			.limit(1);
		const row = existing[0];

		// When a new token is provided, validate it by listing the account's models
		// (proves token + account + Workers AI permission), cache that list, then
		// encrypt the token. Empty token preserves the existing blob.
		let tokenBlob: Uint8Array | null = null;
		const tokenProvided = token.length > 0;
		if (tokenProvided && !accountId) {
			return fail(400, { error: "Enter your Cloudflare Account ID alongside the API token." });
		}
		if (tokenProvided && accountId) {
			if (!env.TOKEN_ENCRYPTION_KEY) {
				return fail(500, { error: "Encryption key not configured." });
			}
			try {
				const models = await listChatModels({ accountId, apiToken: token });
				await env.AI_QUOTA_KV?.put(
					`cf-models:${accountId}`,
					JSON.stringify({ models, cachedAt: Date.now() }),
					{ expirationTtl: 86400 }
				);
			} catch (e) {
				return fail(400, { error: describeCloudflareError(e) });
			}
			const key = await deriveTokenKey(env.TOKEN_ENCRYPTION_KEY);
			tokenBlob = await encryptToken(token, key);
		} else if (
			!tokenProvided &&
			accountId &&
			row?.cloudflareAccountId &&
			accountId !== row.cloudflareAccountId &&
			row.cloudflareTokenEncrypted
		) {
			// Account ID changed but no new token supplied: re-validate the STORED token
			// against the NEW account before persisting. A scoped token that doesn't work
			// on the new account is caught here instead of leaving the badge falsely "connected".
			if (!env.TOKEN_ENCRYPTION_KEY) {
				return fail(500, { error: "Encryption key not configured." });
			}
			try {
				const key = await deriveTokenKey(env.TOKEN_ENCRYPTION_KEY);
				const blob =
					row.cloudflareTokenEncrypted instanceof Uint8Array
						? row.cloudflareTokenEncrypted
						: new Uint8Array(row.cloudflareTokenEncrypted as ArrayBuffer);
				const decrypted = await decryptToken(blob, key);
				const models = await listChatModels({ accountId, apiToken: decrypted });
				await env.AI_QUOTA_KV?.put(
					`cf-models:${accountId}`,
					JSON.stringify({ models, cachedAt: Date.now() }),
					{ expirationTtl: 86400 }
				);
			} catch (e) {
				return fail(400, { error: describeCloudflareError(e) });
			}
		}

		const updateData: {
			cloudflareAccountId: string | null;
			cloudflareModel: string;
			cloudflareTokenEncrypted?: Uint8Array;
		} = {
			cloudflareAccountId: accountId || null,
			cloudflareModel: model
		};
		if (tokenBlob) {
			updateData.cloudflareTokenEncrypted = tokenBlob;
		}

		if (existing.length === 0) {
			await db.insert(userSettings).values({ userId: locals.user.id, ...updateData });
		} else {
			await db.update(userSettings).set(updateData).where(eq(userSettings.userId, locals.user.id));
		}

		return { success: true };
	},

	reset: async ({ locals }) => {
		if (!locals.user || !env.DB) {
			return fail(503, { error: "Service unavailable." });
		}
		const db = getDatabase(env.DB);
		await db.delete(userSettings).where(eq(userSettings.userId, locals.user.id));
		return { success: true, reset: true };
	}
};
