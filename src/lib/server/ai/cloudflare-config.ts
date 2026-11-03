/**
 * Per-user Cloudflare credentials loader — the BYO-account layer for the Copilot.
 *
 * The user's API token is stored AES-GCM encrypted in `user_settings`.
 * `loadCloudflareConfig` reads the raw row; `resolveCloudflareCreds` decrypts the
 * token into usable creds + the resolved model id (selected, or the default).
 */

import { eq } from "drizzle-orm";
import type { Database } from "#lib/server/db.js";
import { userSettings } from "#lib/server/schema.js";
import { deriveTokenKey, decryptToken } from "#lib/server/crypto.js";
import { DEFAULT_MODEL, type CloudflareCreds } from "./run-rest";

export interface CloudflareConfig {
	tokenEncrypted: Uint8Array | null;
	accountId: string | null;
	model: string | null;
}

/** Thrown by the chat gate when the user hasn't connected a Cloudflare account. */
export class CloudflareNotConnectedError extends Error {
	constructor(message = "Cloudflare account not connected") {
		super(message);
		this.name = "CloudflareNotConnectedError";
	}
}

export async function loadCloudflareConfig(
	db: Database,
	userId: string
): Promise<CloudflareConfig> {
	const rows = await db
		.select({
			tok: userSettings.cloudflareTokenEncrypted,
			acct: userSettings.cloudflareAccountId,
			model: userSettings.cloudflareModel
		})
		.from(userSettings)
		.where(eq(userSettings.userId, userId))
		.limit(1);
	const s = rows[0];
	if (!s) return { tokenEncrypted: null, accountId: null, model: null };
	return {
		tokenEncrypted: s.tok ? new Uint8Array(s.tok as ArrayBuffer) : null,
		accountId: s.acct,
		model: s.model
	};
}

/** A connection is "complete" only with BOTH a token blob and an account id. */
export function isCloudflareConnected(cfg: CloudflareConfig): boolean {
	return Boolean(cfg.tokenEncrypted && cfg.accountId);
}

/**
 * Decrypts the token and returns usable creds + the resolved model id, or `null`
 * when the user hasn't connected an account. `encryptionKey` is
 * `env.TOKEN_ENCRYPTION_KEY`.
 */
export async function resolveCloudflareCreds(
	encryptionKey: string,
	cfg: CloudflareConfig
): Promise<{ creds: CloudflareCreds; model: string } | null> {
	if (!cfg.tokenEncrypted || !cfg.accountId) return null;
	const key = await deriveTokenKey(encryptionKey);
	const apiToken = await decryptToken(cfg.tokenEncrypted, key);
	return { creds: { accountId: cfg.accountId, apiToken }, model: cfg.model ?? DEFAULT_MODEL };
}
