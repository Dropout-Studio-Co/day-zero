import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireApiContext, parseJson, ok } from "#lib/server/api.js";
import {
	createConversation,
	listConversations
} from "#lib/server/repositories/ai-conversations.js";
import { titleFromMessage } from "#lib/ai/prompts.js";

// AI conversations collection. GET lists the user's 50 most recent conversations;
// POST creates one (optional title, else derived from a placeholder). Auth + D1 via requireApiContext.
export const GET: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const rows = await listConversations(db, userId, 50);
	return ok(
		rows.map((r) => ({
			id: r.id,
			title: r.title,
			createdAt: r.createdAt.toISOString(),
			updatedAt: r.updatedAt.toISOString()
		}))
	);
};

export const POST: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const body = await parseJson(
		event,
		z.object({ title: z.string().min(1).max(120).optional() }).default({})
	);
	const title = body.title ?? titleFromMessage("New conversation");
	const row = await createConversation(db, userId, title);
	return ok({
		id: row.id,
		title: row.title,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString()
	});
};
