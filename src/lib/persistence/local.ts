/**
 * Browser-only localStorage persistence for LOGGED-OUT (guest) users.
 *
 * With no session the app can't write to D1, so the board mirrors its countdowns
 * here instead — guest work survives a refresh on the same device. Signing in
 * upgrades to server storage + cross-device sync + sharing (see the store's
 * `migrateGuestToServer`). All three helpers are SSR-safe: they no-op on the
 * server (where `localStorage` doesn't exist) and swallow quota/parse errors so a
 * corrupt or full store never breaks the page.
 *
 * Writes are synchronous (not debounced) — localStorage is local and cheap;
 * callers that need throttling already debounce upstream.
 */
import { browser } from "$app/env";

export const readLocal = <T>(key: string): T | null => {
	if (!browser) return null;
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
};

export const writeLocal = <T>(key: string, value: T): void => {
	if (!browser) return;
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch (err) {
		console.error("[local]", key, err);
	}
};

export const clearLocal = (key: string): void => {
	if (!browser) return;
	try {
		localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
};
