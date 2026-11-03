/** Collection endpoints for countdowns: list, create, reorder. All userId-scoped. */
import type { RequestHandler } from "./$types";
import { requireApiContext, parseJson, ok } from "#lib/server/api.js";
import { createCountdownSchema, reorderSchema } from "#lib/server/validation.js";
import { listByUser, create, reorder } from "#lib/server/repositories/countdowns.js";

export const GET: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	return ok(await listByUser(db, userId));
};

export const POST: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const body = await parseJson(event, createCountdownSchema);
	return ok(await create(db, userId, body));
};

export const PUT: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const { orderedIds } = await parseJson(event, reorderSchema);
	await reorder(db, userId, orderedIds);
	return ok();
};
