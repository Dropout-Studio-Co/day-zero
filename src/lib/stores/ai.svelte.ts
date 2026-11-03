/**
 * The `ai` Copilot store — factory function + $state closure exported as a
 * singleton (Svelte 5 $state reactivity is scoped to its declaration, hence the
 * factory). Holds conversations, messages, streaming status, the Tier-B
 * confirmation queue, undo history, and mobile/rail UI state.
 * INVARIANT: hydrate() is called ONCE in +page.svelte via untrack — do not add a
 * second hydrate path.
 * @see $lib/ai/chat-client.ts (primary mutator).
 */

import { api, sync } from "#lib/api/client.js";
import type { ConfirmationDiffRow, ParsedToolCall, SafetyTier } from "#lib/ai/types.js";

export type AiMessageRole = "user" | "assistant" | "tool" | "system";

export interface AiToolCall {
	id: string;
	name: string;
	args: unknown;
	status: "pending" | "pending_confirmation" | "applied" | "rejected" | "failed";
	actionId: string | null;
	error: string | null;
	undone: boolean;
}

export interface AiMessage {
	id: string;
	role: AiMessageRole;
	content: string;
	toolCalls: AiToolCall[];
	createdAt: string;
	streaming: boolean;
}

export interface AiConversation {
	id: string;
	title: string;
	updatedAt: string;
}

export interface AiHistoryAction {
	id: string;
	conversationId: string | null;
	messageId: string | null;
	toolName: string;
	inputs: unknown;
	inverse: unknown;
	safetyTier: SafetyTier;
	requiredConfirmation: boolean;
	applied: boolean;
	status: "applied" | "rejected" | "failed" | "undone" | "undo_failed";
	error: string | null;
	createdAt: string;
	undoneAt: string | null;
}

export interface PendingConfirmation {
	toolCallId: string;
	toolName: string;
	args: unknown;
	tier: SafetyTier;
	humanLabel: string;
	diff: ConfirmationDiffRow[];
	inverseSummary: string;
	resolve: (approved: boolean) => void;
}

export interface AiHydrationPayload {
	enabled: boolean;
	activeConversation: AiConversation | null;
	conversations: AiConversation[];
	messages: AiMessage[];
	recentActions: AiHistoryAction[];
}

const createAiStore = () => {
	let enabled = $state(true);
	let activeConversationId = $state<string | null>(null);
	let conversations = $state<AiConversation[]>([]);
	let messages = $state<AiMessage[]>([]);
	let pendingConfirmations = $state<PendingConfirmation[]>([]);
	let railOpen = $state(false);
	let historyActions = $state<AiHistoryAction[]>([]);
	let showUndone = $state(false);
	let streaming = $state(false);
	let inputBusy = $state(false);
	let error = $state<string | null>(null);
	// Set when the chat endpoint returns 412 (no Cloudflare account connected). The UI
	// shows a "Connect your Cloudflare account in Settings →" CTA instead of an error.
	let connectRequired = $state(false);
	let mobileOpen = $state(false);
	let desktopOpen = $state(false);
	let inputFocusNonce = $state(0);

	// Active conversation is hoisted to the front of the list so it sorts first in the picker.
	const hydrate = (payload: AiHydrationPayload) => {
		enabled = payload.enabled;
		activeConversationId = payload.activeConversation?.id ?? null;
		conversations = payload.activeConversation
			? [
					payload.activeConversation,
					...payload.conversations.filter((c) => c.id !== payload.activeConversation?.id)
				]
			: payload.conversations;
		messages = payload.messages;
		historyActions = payload.recentActions;
	};

	const setEnabled = (v: boolean) => {
		enabled = v;
	};

	const setMobileOpen = (open: boolean) => {
		mobileOpen = open;
	};

	// Desktop rail visibility (lg+). Separate from `railOpen` (the in-rail history
	// sub-panel) and `mobileOpen` (the <lg sheet). Default closed; not persisted.
	const openDesktop = () => {
		desktopOpen = true;
	};

	const closeDesktop = () => {
		desktopOpen = false;
	};

	const toggleDesktop = () => {
		desktopOpen = !desktopOpen;
	};

	const requestInputFocus = () => {
		inputFocusNonce++;
	};

	const toggleRail = () => {
		railOpen = !railOpen;
	};

	const closeRail = () => {
		railOpen = false;
	};

	const setShowUndone = (v: boolean) => {
		showUndone = v;
	};

	const setError = (msg: string | null) => {
		error = msg;
	};

	const setConnectRequired = (v: boolean) => {
		connectRequired = v;
	};

	// Streaming and input-busy are tied together: an in-flight turn locks the composer.
	const setStreaming = (v: boolean) => {
		streaming = v;
		inputBusy = v;
	};

	const appendUserMessage = (id: string, content: string) => {
		messages = [
			...messages,
			{
				id,
				role: "user",
				content,
				toolCalls: [],
				createdAt: new Date().toISOString(),
				streaming: false
			}
		];
	};

	const startAssistantMessage = (id: string) => {
		messages = [
			...messages,
			{
				id,
				role: "assistant",
				content: "",
				toolCalls: [],
				createdAt: new Date().toISOString(),
				streaming: true
			}
		];
	};

	const appendAssistantDelta = (id: string, delta: string) => {
		messages = messages.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m));
	};

	const finalizeAssistantMessage = (id: string) => {
		messages = messages.map((m) => (m.id === id ? { ...m, streaming: false } : m));
	};

	const attachToolCall = (messageId: string, call: ParsedToolCall) => {
		messages = messages.map((m) =>
			m.id === messageId
				? {
						...m,
						toolCalls: [
							...m.toolCalls,
							{
								id: call.id,
								name: call.name,
								args: call.args,
								status: "pending",
								actionId: null,
								error: null,
								undone: false
							}
						]
					}
				: m
		);
	};

	const updateToolCall = (messageId: string, toolCallId: string, patch: Partial<AiToolCall>) => {
		messages = messages.map((m) =>
			m.id === messageId
				? {
						...m,
						toolCalls: m.toolCalls.map((tc) => (tc.id === toolCallId ? { ...tc, ...patch } : tc))
					}
				: m
		);
	};

	const enqueueConfirmation = (req: PendingConfirmation) => {
		pendingConfirmations = [...pendingConfirmations, req];
	};

	const dequeueConfirmation = (toolCallId: string) => {
		pendingConfirmations = pendingConfirmations.filter((c) => c.toolCallId !== toolCallId);
	};

	const setActiveConversation = (id: string | null) => {
		activeConversationId = id;
	};

	const upsertConversation = (conv: AiConversation) => {
		const exists = conversations.some((c) => c.id === conv.id);
		conversations = exists
			? conversations.map((c) => (c.id === conv.id ? conv : c))
			: [conv, ...conversations];
	};

	const replaceConversations = (list: AiConversation[]) => {
		conversations = list;
	};

	const removeConversation = (id: string) => {
		conversations = conversations.filter((c) => c.id !== id);
		if (activeConversationId === id) {
			activeConversationId = conversations[0]?.id ?? null;
			messages = [];
		}
	};

	const replaceMessages = (list: AiMessage[]) => {
		messages = list;
	};

	const dropMessage = (id: string) => {
		messages = messages.filter((m) => m.id !== id);
	};

	const clearMessages = () => {
		messages = [];
	};

	const pushHistoryAction = (action: AiHistoryAction) => {
		historyActions = [action, ...historyActions].slice(0, 200);
	};

	const replaceHistoryActions = (list: AiHistoryAction[]) => {
		historyActions = list;
	};

	// Marks the history row undone AND flips the matching message tool-call badge (joined by actionId).
	const markHistoryActionUndone = (id: string) => {
		historyActions = historyActions.map((a) =>
			a.id === id ? { ...a, status: "undone", undoneAt: new Date().toISOString() } : a
		);
		messages = messages.map((m) => ({
			...m,
			toolCalls: m.toolCalls.map((tc) => (tc.actionId === id ? { ...tc, undone: true } : tc))
		}));
	};

	const markHistoryActionUndoFailed = (id: string, error: string) => {
		historyActions = historyActions.map((a) =>
			a.id === id ? { ...a, status: "undo_failed", error } : a
		);
	};

	const removeHistoryAction = (id: string) => {
		historyActions = historyActions.filter((a) => a.id !== id);
	};

	const reloadActions = async () => {
		const list = await sync(() => api.get<AiHistoryAction[]>("/api/ai/actions?limit=50"));
		if (list) historyActions = list;
	};

	const reloadConversations = async () => {
		const list = await sync(() => api.get<AiConversation[]>("/api/ai/conversations"));
		if (list) conversations = list;
	};

	const visibleHistoryActions = $derived(
		showUndone
			? historyActions
			: historyActions.filter((a) => a.status !== "undone" && a.status !== "undo_failed")
	);

	return {
		get enabled() {
			return enabled;
		},
		get activeConversationId() {
			return activeConversationId;
		},
		get conversations() {
			return conversations;
		},
		get messages() {
			return messages;
		},
		get pendingConfirmations() {
			return pendingConfirmations;
		},
		get railOpen() {
			return railOpen;
		},
		get historyActions() {
			return historyActions;
		},
		get visibleHistoryActions() {
			return visibleHistoryActions;
		},
		get showUndone() {
			return showUndone;
		},
		get streaming() {
			return streaming;
		},
		get inputBusy() {
			return inputBusy;
		},
		get error() {
			return error;
		},
		get connectRequired() {
			return connectRequired;
		},
		get mobileOpen() {
			return mobileOpen;
		},
		get desktopOpen() {
			return desktopOpen;
		},
		get inputFocusNonce() {
			return inputFocusNonce;
		},
		hydrate,
		setEnabled,
		setMobileOpen,
		openDesktop,
		closeDesktop,
		toggleDesktop,
		requestInputFocus,
		toggleRail,
		closeRail,
		setShowUndone,
		setError,
		setConnectRequired,
		setStreaming,
		appendUserMessage,
		startAssistantMessage,
		appendAssistantDelta,
		finalizeAssistantMessage,
		attachToolCall,
		updateToolCall,
		enqueueConfirmation,
		dequeueConfirmation,
		setActiveConversation,
		upsertConversation,
		replaceConversations,
		removeConversation,
		replaceMessages,
		dropMessage,
		clearMessages,
		pushHistoryAction,
		replaceHistoryActions,
		markHistoryActionUndone,
		markHistoryActionUndoFailed,
		removeHistoryAction,
		reloadActions,
		reloadConversations
	};
};

export const ai = createAiStore();
