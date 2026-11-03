/**
 * Browser-side controller wiring the ai store to the chat/undo/conversation REST
 * endpoints. `sendMessage` is the main loop: POST the turn, stream frames into
 * the store, THEN run the collected tool calls through executeToolCall (the
 * executors mutate the countdowns store directly, so the board updates live).
 * Confirmation approvals are bridged to the UI via promises parked in the store's
 * pending queue (resolved by AiConfirmDialog). Undo reverses an action server-side
 * and reflects the resulting countdowns on the board via the store's aiInject/aiRemove.
 * @see ./executor.ts, $lib/stores/ai.svelte.ts, src/routes/api/ai/*.
 */

import { ai } from "#lib/stores/ai.svelte.js";
import { countdowns } from "#lib/stores/countdowns.svelte.js";
import type { Countdown } from "#lib/types.js";
import { executeToolCall, type ConfirmationRequest, type ExecutionFrame } from "./executor";
import { streamFrames } from "./streaming";
import { friendlyErrorMessage } from "./errors";
import { toolLabel } from "./tool-labels";
import type { Frame, ParsedToolCall } from "./types";

interface SendOptions {
	signal?: AbortSignal;
	onConversationCreated?: (id: string) => void;
}

interface RawAssistantMessage {
	id: string;
	role: "user" | "assistant" | "tool" | "system";
	content: string;
	toolCalls: Array<{ id: string; name: string; args: unknown }> | null;
	toolResults: Array<{ id: string; status: string; error?: string; actionId?: string }> | null;
	createdAt: string;
}

// Parks a promise in the store's confirmation queue; AiConfirmDialog resolves it on user choice.
const requestConfirmation = (req: ConfirmationRequest): Promise<boolean> =>
	new Promise((resolve) => {
		ai.enqueueConfirmation({
			toolCallId: req.toolCallId,
			toolName: req.toolName,
			args: req.args,
			tier: req.tier,
			humanLabel: req.humanLabel,
			diff: req.diff,
			inverseSummary: req.inverseSummary,
			resolve: (approved: boolean) => {
				ai.dequeueConfirmation(req.toolCallId);
				resolve(approved);
			}
		});
	});

/** Applies an undo's server-reported effect to the board using only aiInject/aiRemove. */
const applyUndoEffect = (effect: { inject?: Countdown[]; remove?: string[] }) => {
	for (const id of effect.remove ?? []) countdowns.aiRemove(id);
	for (const c of effect.inject ?? []) countdowns.aiInject(c);
};

/**
 * Drives one full chat turn. Tool calls are collected during the (buffered)
 * stream but executed only AFTER it ends (sequentially), so confirmations don't
 * race the reply text. Aborting via options.signal cancels the fetch; errors are
 * funneled to the store as friendly messages rather than thrown.
 */
export const sendMessage = async (message: string, options: SendOptions = {}): Promise<void> => {
	const conversationId = ai.activeConversationId;
	const userMessageId = crypto.randomUUID();
	ai.appendUserMessage(userMessageId, message);

	const assistantId = crypto.randomUUID();
	ai.startAssistantMessage(assistantId);
	ai.setError(null);
	ai.setConnectRequired(false);
	ai.setStreaming(true);

	const collectedToolCalls: ParsedToolCall[] = [];
	let assignedConversationId: string | null = conversationId;

	try {
		const response = await fetch("/api/ai/chat", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ conversationId, message }),
			signal: options.signal
		});

		if (!response.ok) {
			let payload: unknown = null;
			try {
				payload = await response.json();
			} catch {
				// Non-JSON error body (e.g. plain text or empty); fall back to status message below.
			}
			// 412 = no Cloudflare account connected. Surface a connect-CTA banner instead of
			// a generic error, and drop the empty assistant placeholder we optimistically added.
			if (response.status === 412) {
				ai.dropMessage(assistantId);
				ai.setConnectRequired(true);
				ai.setStreaming(false);
				return;
			}
			const raw =
				(payload as { message?: string } | null)?.message ?? `Request failed (${response.status})`;
			ai.finalizeAssistantMessage(assistantId);
			ai.setError(friendlyErrorMessage(raw));
			ai.setStreaming(false);
			return;
		}

		if (!response.body) {
			ai.setError(friendlyErrorMessage("Empty response"));
			ai.finalizeAssistantMessage(assistantId);
			ai.setStreaming(false);
			return;
		}

		for await (const frame of streamFrames(response.body)) {
			if (frame.t === "text") {
				ai.appendAssistantDelta(assistantId, frame.delta);
			} else if (frame.t === "tool_call") {
				collectedToolCalls.push({ id: frame.id, name: frame.name, args: frame.args });
				ai.attachToolCall(assistantId, { id: frame.id, name: frame.name, args: frame.args });
			} else if (frame.t === "end") {
				if (!assignedConversationId) {
					assignedConversationId = frame.conversationId;
					ai.setActiveConversation(assignedConversationId);
					options.onConversationCreated?.(assignedConversationId);
				}
			} else if (frame.t === "error") {
				ai.setError(friendlyErrorMessage(frame.message));
			}
		}
	} catch (err) {
		ai.setError(friendlyErrorMessage(err));
	}

	ai.finalizeAssistantMessage(assistantId);
	ai.setStreaming(false);

	if (collectedToolCalls.length === 0) return;

	const onResult = (frame: ExecutionFrame) => {
		ai.updateToolCall(assistantId, frame.id, {
			status: frame.status,
			actionId: frame.actionId ?? null,
			error: frame.error ? friendlyErrorMessage(frame.error) : null
		});
	};

	let needsReload = false;
	for (const call of collectedToolCalls) {
		const outcome = await executeToolCall(call, {
			conversationId: assignedConversationId,
			messageId: null,
			requestConfirmation,
			onResult
		});
		if (outcome.status === "applied") {
			needsReload = true;
			fireToast({
				type: "success",
				message: `${toolLabel(call.name)} — done`,
				actionId: outcome.actionId
			});
		} else if (outcome.status === "failed") {
			fireToast({ type: "error", message: friendlyErrorMessage(outcome.error ?? "Tool failed") });
		}
	}

	if (needsReload) {
		await ai.reloadActions();
	}
};

const fireToast = async (input: {
	type: "success" | "error" | "info";
	message: string;
	actionId?: string | null;
}) => {
	try {
		const { toast } = await import("svelte-sonner");
		if (input.type === "success") {
			toast.success(input.message, {
				duration: 10000,
				action: input.actionId
					? { label: "Undo", onClick: () => triggerUndo(input.actionId!) }
					: undefined
			});
		} else if (input.type === "error") {
			toast.error(input.message);
		} else {
			toast(input.message);
		}
	} catch {
		/* sonner not loaded yet */
	}
};

/** Reverses an applied action server-side via applyInverse; marks the store entry undone/failed and reflects the result on the board. Returns success. */
export const triggerUndo = async (actionId: string): Promise<boolean> => {
	try {
		const response = await fetch(`/api/ai/undo/${actionId}`, {
			method: "POST",
			headers: { "content-type": "application/json" }
		});
		if (!response.ok) {
			const text = await response.text();
			const friendly = friendlyErrorMessage(text || "Undo failed");
			ai.markHistoryActionUndoFailed(actionId, friendly);
			fireToast({ type: "error", message: friendly });
			return false;
		}
		const result = (await response.json()) as {
			effect?: { inject?: Countdown[]; remove?: string[] };
		};
		if (result.effect) applyUndoEffect(result.effect);
		ai.markHistoryActionUndone(actionId);
		fireToast({ type: "info", message: "Reverted" });
		return true;
	} catch (err) {
		const msg = friendlyErrorMessage(err);
		ai.markHistoryActionUndoFailed(actionId, msg);
		fireToast({ type: "error", message: msg });
		return false;
	}
};

export const deleteAction = async (actionId: string): Promise<void> => {
	try {
		await fetch(`/api/ai/actions/${actionId}`, { method: "DELETE" });
		ai.removeHistoryAction(actionId);
	} catch (err) {
		console.error("[ai] failed to delete action", err);
	}
};

export const createNewConversation = async (): Promise<void> => {
	try {
		const response = await fetch("/api/ai/conversations", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({})
		});
		if (!response.ok) {
			fireToast({ type: "error", message: "Could not start a new chat" });
			return;
		}
		const conv = (await response.json()) as { id: string; title: string; updatedAt: string };
		ai.upsertConversation(conv);
		ai.setActiveConversation(conv.id);
		ai.clearMessages();
		ai.setError(null);
		ai.requestInputFocus();
	} catch (err) {
		console.error("[ai] failed to create conversation", err);
		fireToast({ type: "error", message: "Could not start a new chat" });
	}
};

// Loads a conversation's persisted messages and reconstructs tool-call display state by
// joining stored toolCalls with their toolResults (status/actionId); defaults missing results to "applied".
export const switchConversation = async (id: string): Promise<void> => {
	if (ai.activeConversationId === id) return;
	ai.setActiveConversation(id);
	try {
		const response = await fetch(`/api/ai/messages?conversationId=${encodeURIComponent(id)}`);
		if (!response.ok) {
			fireToast({ type: "error", message: "Could not load that conversation" });
			return;
		}
		const raw = (await response.json()) as RawAssistantMessage[];
		ai.replaceMessages(
			raw.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				toolCalls: (m.toolCalls ?? []).map((tc) => {
					const result = m.toolResults?.find((r) => r.id === tc.id);
					return {
						id: tc.id,
						name: tc.name,
						args: tc.args,
						status: (result?.status as "applied" | "rejected" | "failed" | undefined) ?? "applied",
						actionId: result?.actionId ?? null,
						error: result?.error ?? null,
						undone: false
					};
				}),
				createdAt: m.createdAt,
				streaming: false
			}))
		);
	} catch (err) {
		console.error("[ai] failed to load messages", err);
		fireToast({ type: "error", message: "Could not load that conversation" });
	}
};

export const renameConversation = async (id: string, title: string): Promise<void> => {
	const trimmed = title.trim();
	if (!trimmed) return;
	try {
		const response = await fetch(`/api/ai/conversations/${id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ title: trimmed })
		});
		if (response.ok) {
			ai.upsertConversation({ id, title: trimmed, updatedAt: new Date().toISOString() });
		} else {
			fireToast({ type: "error", message: "Could not rename that conversation" });
		}
	} catch (err) {
		console.error("[ai] failed to rename", err);
		fireToast({ type: "error", message: "Could not rename that conversation" });
	}
};

export const deleteConversation = async (id: string): Promise<void> => {
	try {
		const response = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
		if (!response.ok) {
			fireToast({ type: "error", message: "Could not delete that conversation" });
			return;
		}
		ai.removeConversation(id);
		if (ai.activeConversationId === id) {
			ai.clearMessages();
		}
	} catch (err) {
		console.error("[ai] failed to delete conversation", err);
		fireToast({ type: "error", message: "Could not delete that conversation" });
	}
};

export const respondToConfirmation = (toolCallId: string, approved: boolean): void => {
	const req = ai.pendingConfirmations.find((c) => c.toolCallId === toolCallId);
	if (req) req.resolve(approved);
};

/** Bulk-resolves every queued confirmation (e.g. on dialog dismiss); iterates a copy since resolve mutates the queue. */
export const respondToAllConfirmations = (approved: boolean): void => {
	for (const req of [...ai.pendingConfirmations]) {
		req.resolve(approved);
	}
};

export type { Frame };
