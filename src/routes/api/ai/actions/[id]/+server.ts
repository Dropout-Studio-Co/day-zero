import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireApiContext, ok } from "#lib/server/api.js";
import { deleteAction } from "#lib/server/repositories/ai-actions.js";

// DELETE /api/ai/actions/[id] — removes a recorded action (user-scoped). 400 if id missing.
export const DELETE: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const id = event.params.id;
	if (!id) throw error(400, "Missing id");
	await deleteAction(db, userId, id);
	return ok();
};
