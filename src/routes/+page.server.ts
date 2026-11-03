import type { PageServerLoad } from "./$types";
import { getDatabase } from "#lib/server/db.js";
import { loadAppState } from "#lib/server/repositories/state.js";
import type { AppState } from "#lib/server/dto.js";
import {
	getMostRecentConversation,
	listConversations
} from "#lib/server/repositories/ai-conversations.js";
import { listMessages } from "#lib/server/repositories/ai-messages.js";
import { listRecent } from "#lib/server/repositories/ai-actions.js";
import type { AiHydrationPayload } from "#lib/stores/ai.svelte.js";
import { env } from "cloudflare:workers";

// Zero-state AI payload used when AI is disabled or D1/user is unavailable.
const emptyAi = (enabled: boolean): AiHydrationPayload => ({
	enabled,
	activeConversation: null,
	conversations: [],
	messages: [],
	recentActions: []
});

/**
 * Home page load. Auth is OPTIONAL: logged-out visitors get the full board (it
 * persists to localStorage client-side). Signing in unlocks server storage +
 * cross-device sync + shareable links + the AI Copilot. Server data is hydrated
 * ONLY for an authenticated session; anonymous visitors get empty shells and
 * re-seed from localStorage on mount. appState/ai also default to empty shells
 * when D1 is absent so the page still renders.
 *
 * The AI block is skipped entirely when aiEnabled is false. Conversation/message/
 * action timestamps are serialized to ISO strings here because the wire payload
 * must be JSON-safe (Date does not survive load → client).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const d1 = env.DB;
	const aiEnabled = env.AI_COPILOT_ENABLED !== "false";
	let appState: AppState = { countdowns: [] };
	let ai: AiHydrationPayload = emptyAi(aiEnabled);

	if (d1 && locals.user) {
		const db = getDatabase(d1);
		const userId = locals.user.id;
		appState = await loadAppState(db, userId);

		if (aiEnabled) {
			const [recentConv, conversations, recentActions] = await Promise.all([
				getMostRecentConversation(db, userId),
				listConversations(db, userId, 50),
				listRecent(db, userId, 50)
			]);
			const messages = recentConv ? await listMessages(db, recentConv.id, 200) : [];

			ai = {
				enabled: aiEnabled,
				activeConversation: recentConv
					? {
							id: recentConv.id,
							title: recentConv.title,
							updatedAt: recentConv.updatedAt.toISOString()
						}
					: null,
				conversations: conversations.map((c) => ({
					id: c.id,
					title: c.title,
					updatedAt: c.updatedAt.toISOString()
				})),
				messages: messages.map((m) => ({
					id: m.id,
					role: m.role,
					content: m.content,
					toolCalls: (m.toolCalls ?? []).map((tc) => ({
						id: tc.id,
						name: tc.name,
						args: tc.args,
						status: "applied" as const,
						actionId: null,
						error: null,
						undone: false
					})),
					createdAt: m.createdAt.toISOString(),
					streaming: false
				})),
				recentActions: recentActions.map((a) => ({
					id: a.id,
					conversationId: a.conversationId,
					messageId: a.messageId,
					toolName: a.toolName,
					inputs: a.inputs,
					inverse: a.inverse,
					safetyTier: a.safetyTier,
					requiredConfirmation: a.requiredConfirmation,
					applied: a.applied,
					status: a.status,
					error: a.error,
					createdAt: a.createdAt.toISOString(),
					undoneAt: a.undoneAt?.toISOString() ?? null
				}))
			};
		}
	}

	return {
		user: locals.user,
		currentUser: locals.currentUser,
		appState,
		ai
	};
};
