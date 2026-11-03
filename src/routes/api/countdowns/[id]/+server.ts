/** Single-countdown endpoints: partial update, delete. All userId-scoped. */
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireApiContext, parseJson, ok } from "#lib/server/api.js";
import { updateCountdownSchema } from "#lib/server/validation.js";
import { update, remove } from "#lib/server/repositories/countdowns.js";

export const PATCH: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const patch = await parseJson(event, updateCountdownSchema);
	const updated = await update(db, userId, event.params.id, patch);
	if (!updated) throw error(404, "Countdown not found");
	return ok();
};

export const DELETE: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	await remove(db, userId, event.params.id);
	return ok();
};
