import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireApiContext, ok } from "#lib/server/api.js";
import { getConversation } from "#lib/server/repositories/ai-conversations.js";
import { listMessages } from "#lib/server/repositories/ai-messages.js";

// GET /api/ai/messages?conversationId=… — lists up to 500 messages for a conversation.
// Ownership enforced: 404 if the conversation is not the user's. 400 if conversationId missing.
export const GET: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const conversationId = event.url.searchParams.get("conversationId");
	if (!conversationId) throw error(400, "Missing conversationId");

	const conversation = await getConversation(db, userId, conversationId);
	if (!conversation) throw error(404, "Conversation not found");

	const rows = await listMessages(db, conversationId, 500);
	return ok(
		rows.map((r) => ({
			id: r.id,
			role: r.role,
			content: r.content,
			toolCalls: r.toolCalls,
			toolResults: r.toolResults,
			createdAt: r.createdAt.toISOString()
		}))
	);
};
