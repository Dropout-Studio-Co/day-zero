/**
 * Toggle public sharing for a countdown. POST enables and returns the public URL;
 * DELETE disables. The token is minted/cleared in the repository (userId-scoped);
 * the public read happens unauthenticated at /s/[token].
 */
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireApiContext, ok } from "#lib/server/api.js";
import { setShare } from "#lib/server/repositories/countdowns.js";

export const POST: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const res = await setShare(db, userId, event.params.id, true);
	if (!res.ok || !res.token) throw error(404, "Countdown not found");
	return ok({ shareToken: res.token, url: `${event.url.origin}/s/${res.token}` });
};

export const DELETE: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const res = await setShare(db, userId, event.params.id, false);
	if (!res.ok) throw error(404, "Countdown not found");
	return ok();
};
