import type { RequestHandler } from "./$types";
import { error } from "@sveltejs/kit";
import { getDatabase } from "#lib/server/db.js";
import { loadCloudflareConfig, resolveCloudflareCreds } from "#lib/server/ai/cloudflare-config.js";
import { listChatModels, type CfModel } from "#lib/server/ai/run-rest.js";
import { describeCloudflareError } from "#lib/server/ai/errors.js";
import { env } from "cloudflare:workers";

/**
 * GET /api/cf/models — the function-calling chat models on the user's connected
 * Cloudflare account, for the settings model picker. Cached per account (24h) in
 * AI_QUOTA_KV when present; `?refresh=1` forces a live re-fetch. Never returns the
 * owner's models — always the authenticated user's own account.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const userId = locals.user?.id;
	if (!userId || !env.DB) throw error(503, "platform unavailable");

	const db = getDatabase(env.DB);
	const cfg = await loadCloudflareConfig(db, userId);
	if (!cfg.accountId) {
		return Response.json({ models: [] as CfModel[], connected: false });
	}

	const kv = env.AI_QUOTA_KV;
	const cacheKey = `cf-models:${cfg.accountId}`;
	const refresh = url.searchParams.get("refresh") === "1";

	if (!refresh && kv) {
		const cached = await kv.get<{ models?: CfModel[] }>(cacheKey, "json");
		if (cached && Array.isArray(cached.models)) {
			return Response.json({ models: cached.models, connected: true, cached: true });
		}
	}

	const key = env.TOKEN_ENCRYPTION_KEY;
	if (!key) {
		return Response.json({
			models: [] as CfModel[],
			connected: true,
			error: "encryption key not configured"
		});
	}

	const resolved = await resolveCloudflareCreds(key, cfg).catch(() => null);
	if (!resolved) {
		return Response.json({ models: [] as CfModel[], connected: false });
	}

	try {
		const models = await listChatModels(resolved.creds);
		await kv?.put(cacheKey, JSON.stringify({ models, cachedAt: Date.now() }), {
			expirationTtl: 86400
		});
		return Response.json({ models, connected: true, cached: false });
	} catch (e) {
		return Response.json({
			models: [] as CfModel[],
			connected: true,
			error: describeCloudflareError(e)
		});
	}
};
