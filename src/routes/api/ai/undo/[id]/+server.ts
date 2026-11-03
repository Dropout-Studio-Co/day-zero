import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireApiContext } from "#lib/server/api.js";
import { getActionById, markUndone, markUndoFailed } from "#lib/server/repositories/ai-actions.js";
import { applyInverse, UndoInvalidatedError } from "#lib/server/ai-undo.js";

/**
 * POST /api/ai/undo/[id] — reverses a previously applied AI action server-side by
 * running its stored inverse, then marks the action undone and returns the resulting
 * board effect (countdowns to inject/remove) so the client reflects it without reload.
 *
 * SIDE EFFECTS: mutates countdowns via applyInverse; flips action status.
 * ERROR MODES: 400 missing id; 404 action not found; 409 if not in "applied"
 * state, or if the inverse can no longer apply (UndoInvalidatedError) — failure is
 * also persisted via markUndoFailed.
 */
export const POST: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const id = event.params.id;
	if (!id) throw error(400, "Missing id");

	const action = await getActionById(db, userId, id);
	if (!action) throw error(404, "Action not found");
	if (action.status !== "applied") {
		throw error(409, `Cannot undo action with status ${action.status}`);
	}

	try {
		const effect = await applyInverse(db, userId, action.inverse);
		await markUndone(db, userId, id);
		return Response.json({ id, status: "undone", effect });
	} catch (err) {
		const message =
			err instanceof UndoInvalidatedError
				? err.message
				: err instanceof Error
					? err.message
					: "Undo failed";
		await markUndoFailed(db, userId, id, message);
		throw error(409, message);
	}
};
