import type { HandleClientError } from "@sveltejs/kit/hooks";

/**
 * Client-side error hook. Generates a UUID correlation id, logs the error to the browser
 * console under that id, and returns it with the error's safe message to the +error page.
 * INVARIANT: unknown throws are replaced with a generic string so internals never leak to
 * the UI; app and framework errors keep their own messages and statuses. The returned
 * errorId mirrors the same id logged, so users can quote it for support correlation.
 * @see hooks.server.ts handleError
 */
export const handleError: HandleClientError = async ({ kind, error }) => {
	const errorId = crypto.randomUUID();
	const message =
		kind === "unknown"
			? "An unexpected error occurred"
			: ((error as { message?: string }).message ?? "An unexpected error occurred");

	console.error(`[${errorId}] Client error:`, { kind, message, error });

	return { message, errorId };
};
