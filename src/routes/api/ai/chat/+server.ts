import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireApiContext } from "#lib/server/api.js";
import { loadAppState } from "#lib/server/repositories/state.js";
import {
	createConversation,
	getConversation,
	touchUpdatedAt
} from "#lib/server/repositories/ai-conversations.js";
import {
	appendMessage,
	listMessages,
	type AiMessageRow,
	type AiMessageToolCall
} from "#lib/server/repositories/ai-messages.js";
import { checkAndIncrementQuota } from "#lib/server/ai-quota.js";
import { checkSpendCap, recordSpend } from "#lib/server/ai-spend.js";
import { logChatTurn } from "#lib/server/log.js";
import { projectAppState } from "#lib/ai/context.js";
import {
	buildSystemContext,
	buildUserTurn,
	titleFromMessage,
	PROMPT_VERSION,
	FEW_SHOTS
} from "#lib/ai/prompts.js";
import { runChatFrames, type RawChatResult } from "#lib/ai/client.js";
import { loadCloudflareConfig, resolveCloudflareCreds } from "#lib/server/ai/cloudflare-config.js";
import type { CloudflareCreds } from "#lib/server/ai/run-rest.js";
import { salvageTextToolCalls } from "#lib/ai/salvage.js";
import { sseStream } from "#lib/ai/streaming.js";
import { TOOLS_CATALOG } from "#lib/ai/tools-catalog.js";
import { toolLabel } from "#lib/ai/tool-labels.js";
import { argSchemas, isKnownToolName } from "#lib/ai/schemas.js";
import type { Frame, ParsedToolCall } from "#lib/ai/types.js";
import { env } from "cloudflare:workers";

const bodySchema = z.object({
	conversationId: z.string().nullable().optional(),
	message: z.string().min(1).max(8000)
});

// A tool-only assistant turn persists with empty content; convey what it did
// (from its tool calls) so the model doesn't re-fire the prior instruction.
const summarizeToolOnlyTurn = (m: AiMessageRow): string => {
	const labels = (m.toolCalls ?? []).map((c) => toolLabel(c.name)).filter(Boolean);
	return labels.length > 0 ? `[Performed: ${labels.join(", ")}]` : m.content;
};

const toHistory = (
	rows: AiMessageRow[]
): Array<{ role: "user" | "assistant" | "system"; content: string }> =>
	rows
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content.trim().length > 0 ? m.content : summarizeToolOnlyTurn(m)
		}));

interface ValidatedCall {
	call: ParsedToolCall;
	valid: boolean;
	error?: string;
}

// Gates each model-emitted tool call against the per-tool Zod arg schema.
// Unknown tool name or arg-schema failure → valid:false (triggers one retry turn).
// On success, call.args is replaced with the parsed/coerced data.
const validateToolCalls = (calls: ParsedToolCall[]): ValidatedCall[] =>
	calls.map((call) => {
		if (!isKnownToolName(call.name)) {
			return { call, valid: false, error: `Unknown tool "${call.name}"` };
		}
		const result = argSchemas[call.name].safeParse(call.args ?? {});
		if (!result.success) {
			return {
				call,
				valid: false,
				error: result.error.issues[0]?.message ?? "Invalid arguments"
			};
		}
		return { call: { ...call, args: result.data }, valid: true };
	});

const correctiveMessage = (invalid: ValidatedCall[]): string =>
	[
		"Your previous tool call(s) failed schema validation:",
		...invalid.map((v) => `- "${v.call.name}": ${v.error}`),
		"",
		"Re-issue ONLY the corrected tool call(s) listed above — do NOT repeat any other tool calls you already issued successfully. Argument names and types must exactly match each tool's argument schema (remember targetAt must be a full ISO-8601 timestamp). If you cannot produce a valid call, reply with a short plain-text explanation instead."
	].join("\n");

/** Retry prompt when the model should have acted on an instruction but called no tool. */
const ACTION_RETRY_MESSAGE =
	"Your previous reply did not call any tool, so nothing changed. The user gave an instruction to change their countdowns. Emit the correct tool call now through the tool interface. Do NOT ask the user to confirm in chat (the UI handles confirmation) and do NOT claim anything was done. Only if the request is genuinely out of scope or impossible, say so plainly in one short sentence.";

/**
 * The model intermittently narrates an action ("Done…", "Adding the countdown…")
 * WITHOUT calling a tool, so nothing runs. We detect the failure from the user's
 * intent (an imperative instruction) rather than the model's wording.
 */
const IMPERATIVE_RE =
	/\b(set|add|change|update|delete|remove|edit|fix|make|apply|append|insert|rename|clear|replace|move|undo|revert|create|correct|adjust|drop|fill|put|toggle|enable|disable|reorder|restore|share|unshare|schedule|track|countdown)\b/i;
// Read-only / interrogative lead words: a message opening with one of these is a
// question, not a command, even without a trailing "?". Excludes it from the
// imperative heuristic so informational asks don't trigger a wasteful retry.
const READONLY_LEAD_RE =
	/^(how|what|when|where|which|why|who|is|are|do|does|did|can|could|would|show|tell|list|remind|give)\b/i;
const looksImperative = (text: string): boolean => {
	const t = text.trim();
	if (READONLY_LEAD_RE.test(t)) return false;
	return t.length > 0 && !t.endsWith("?") && IMPERATIVE_RE.test(t);
};
/** A genuine refusal/clarification we must NOT suppress as a false action narration. */
const REFUSAL_RE =
	/\b(can'?t|cannot|can not|unable|won'?t|not able|out of scope|outside|only help|only assist|don'?t|do not|which|could you|do you want|no countdown)\b/i;
/** A completion claim ("Done — updated 5 rows"). Only blank a no-tool reply that actually claims an action. */
const AFFIRMATION_RE =
	/\b(done|updated?|set|added?|applied|appended|inserted|changed|removed|deleted|cleared|renamed|replaced|fixed|marked|created|adjusted|corrected|restored|reordered|shared|i'?ve|i have|i'?ll|all set|here you go)\b/i;

/**
 * POST /api/ai/chat — runs one Copilot turn and streams the result as SSE.
 *
 * CONTRACT:
 *  - body: { conversationId?, message } (see bodySchema). Auth + D1 via requireApiContext.
 *  - response: text/event-stream of Frames (text, tool_call, error, end).
 *  - SIDE EFFECTS: creates the conversation if absent; appends the user message
 *    then the assistant message to D1; records token spend; touches updatedAt;
 *    structured-logs the turn.
 *  - ERROR MODES: 401/503 (requireApiContext), 503 if AI binding missing, 400 on
 *    body parse failure, 429 on daily-quota or monthly-spend-cap (returned as JSON,
 *    NOT thrown). Model failures arrive as an SSE error frame, not an HTTP status.
 *
 * FLOW NOTES:
 *  - Workers AI is called DIRECTLY (no AI Gateway, no RAG). One model turn is
 *    buffered and emitted as frames.
 *  - On schema-invalid tool calls, issues exactly ONE corrective retry turn before
 *    persisting. salvageTextToolCalls recovers tool calls emitted as plain-text JSON.
 *  - FEW_SHOTS are prepended only for an empty (first-turn) conversation.
 */
export const POST: RequestHandler = async (event) => {
	const start = Date.now();
	const { db, userId } = requireApiContext(event);

	let parsed: z.infer<typeof bodySchema>;
	try {
		parsed = bodySchema.parse(await event.request.json());
	} catch (err) {
		throw error(400, err instanceof Error ? err.message : "Invalid request body");
	}

	// BYO gate: inference runs on the USER's own Cloudflare account (REST), billed to
	// them — NOT the owner's bound env.AI. Resolve their stored creds + model; if not
	// connected, 412 with a pointer to Settings so the UI shows the connect CTA.
	const encryptionKey = env.TOKEN_ENCRYPTION_KEY;
	const resolved = encryptionKey
		? await resolveCloudflareCreds(encryptionKey, await loadCloudflareConfig(db, userId)).catch(
				() => null
			)
		: null;
	if (!resolved) {
		return Response.json(
			{
				code: "cloudflare_not_connected",
				error: "Connect your Cloudflare account in Settings to use the copilot.",
				connect: "/settings"
			},
			{ status: 412 }
		);
	}
	const creds: CloudflareCreds = resolved.creds;
	const model = resolved.model;

	// Check the (read-only) monthly spend cap BEFORE incrementing the daily quota,
	// so a turn rejected by the cap does not burn a daily quota unit.
	const spend = await checkSpendCap(env.AI_QUOTA_KV, userId, env.AI_MONTHLY_CAP_USD);
	if (!spend.allowed) {
		return Response.json(
			{
				code: "spend_cap_reached",
				message: `Monthly AI spend cap reached ($${spend.spentUsd.toFixed(2)} of $${spend.capUsd.toFixed(2)}). Resets at the start of next month.`
			},
			{ status: 429 }
		);
	}

	const quota = await checkAndIncrementQuota(env.AI_QUOTA_KV, userId);
	if (!quota.allowed) {
		return Response.json(
			{
				code: "quota_exceeded",
				message: `Daily AI quota reached (${quota.count}/${quota.limit}). Resets at ${quota.resetsAt}.`,
				resetsAt: quota.resetsAt
			},
			{ status: 429 }
		);
	}

	const requestedId = parsed.conversationId ?? null;
	let conversation = requestedId ? await getConversation(db, userId, requestedId) : null;
	if (!conversation) {
		conversation = await createConversation(db, userId, titleFromMessage(parsed.message));
	}
	const activeConversationId = conversation.id;

	// Sliding window: forward only the most recent 12 turns to bound token cost.
	const history = toHistory(await listMessages(db, activeConversationId, 100)).slice(-12);

	await appendMessage(db, activeConversationId, {
		role: "user",
		content: parsed.message
	});

	const appState = await loadAppState(db, userId);
	const context = projectAppState(appState);
	const systemContext = buildSystemContext(TOOLS_CATALOG);
	const withFewShots = history.length === 0 ? [...FEW_SHOTS, ...history] : history;
	const userTurn = buildUserTurn({
		message: parsed.message,
		stateText: context.summaryText,
		dateText: new Date().toISOString().slice(0, 10)
	});
	const turnId = crypto.randomUUID();

	return sseStream(async (push) => {
		let assistantText = "";
		let inputTokens = 0;
		let outputTokens = 0;
		let errored: string | null = null;
		let retried = false;
		let finalCalls: ParsedToolCall[] = [];
		let successCount = 0;

		const consume = async (
			gen: AsyncGenerator<Frame, RawChatResult>,
			streamText: boolean
		): Promise<RawChatResult> => {
			let step = await gen.next();
			while (!step.done) {
				const frame = step.value;
				if (frame.t === "text" && streamText) {
					assistantText += frame.delta;
					push(frame);
				} else if (frame.t === "error") {
					errored = frame.message;
					push(frame);
				}
				step = await gen.next();
			}
			return step.value;
		};

		try {
			// Buffer the first turn (no live text stream) so we can inspect it for a
			// false action narration before anything reaches the user.
			const first = await consume(
				runChatFrames({
					creds,
					model,
					systemContext,
					history: withFewShots,
					userMessage: userTurn,
					conversationId: activeConversationId,
					tools: TOOLS_CATALOG
				}),
				false
			);
			inputTokens += first.inputTokens;
			outputTokens += first.outputTokens;

			let firstCalls = first.toolCalls;
			let firstText = first.text;
			// Recover tool calls the model emitted as plain-text JSON.
			if (firstCalls.length === 0 && !errored && firstText.trim().length > 0) {
				const salvaged = salvageTextToolCalls(firstText);
				if (salvaged.calls.length > 0) {
					firstCalls = salvaged.calls;
					firstText = salvaged.cleanedText;
				}
			}

			let validated = validateToolCalls(firstCalls);
			let replyText = firstText;
			const invalid = validated.filter((v) => !v.valid);
			// Turn-1 calls that already passed validation — preserved across a corrective
			// retry so a mixed valid+invalid turn doesn't silently drop the valid action.
			const firstValid = validated.filter((v) => v.valid);
			const userImperative = looksImperative(parsed.message);
			// Model failed to act: an imperative instruction produced no tool call,
			// and the reply isn't a clarifying question.
			const failedToAct =
				firstCalls.length === 0 && !errored && userImperative && !firstText.includes("?");

			// Exactly one corrective retry: malformed args OR an instruction that
			// produced no tool call (the model narrated instead of calling).
			if ((invalid.length > 0 || failedToAct) && !errored) {
				retried = true;
				console.log(
					JSON.stringify({
						event: "ai.validation_retry",
						turn_id: turnId,
						reason: invalid.length > 0 ? "invalid_args" : "no_tool_call",
						failed: invalid.map((v) => ({ tool: v.call.name, error: v.error }))
					})
				);
				const retryHistory = [
					...withFewShots,
					{ role: "user" as const, content: userTurn },
					{
						role: "assistant" as const,
						content: "[The assistant did not produce a valid tool call.]"
					}
				];
				const retry = await consume(
					runChatFrames({
						creds,
						model,
						systemContext,
						history: retryHistory,
						userMessage: invalid.length > 0 ? correctiveMessage(invalid) : ACTION_RETRY_MESSAGE,
						conversationId: activeConversationId,
						tools: TOOLS_CATALOG
					}),
					false
				);
				inputTokens += retry.inputTokens;
				outputTokens += retry.outputTokens;
				let retryCalls = retry.toolCalls;
				let retryText = retry.text;
				if (retryCalls.length === 0 && retry.text.trim().length > 0) {
					const salvaged = salvageTextToolCalls(retry.text);
					if (salvaged.calls.length > 0) {
						retryCalls = salvaged.calls;
						retryText = salvaged.cleanedText;
					}
				}
				const retryValidated = validateToolCalls(retryCalls);
				// On the invalid-args path keep the turn-1 valid calls (the corrective
				// prompt re-issues ONLY the failed call(s)). The failedToAct path had no
				// valid turn-1 calls, so it just takes the retry's calls.
				validated = invalid.length > 0 ? [...firstValid, ...retryValidated] : retryValidated;
				replyText = retryText;
			}

			// Only valid calls reach the client/D1.
			finalCalls = validated.filter((v) => v.valid).map((v) => v.call);
			successCount = finalCalls.length;

			// Never let an action narration stand when no tool ran; genuine refusals
			// and clarifying questions are preserved.
			let outText = replyText;
			if (
				successCount === 0 &&
				userImperative &&
				!outText.includes("?") &&
				!REFUSAL_RE.test(outText) &&
				AFFIRMATION_RE.test(outText)
			) {
				outText = "";
			}
			if (failedToAct && successCount === 0 && outText.trim().length === 0) {
				outText = "I couldn't apply that change — could you rephrase your request?";
			}
			assistantText = outText;

			if (outText.trim().length > 0) {
				push({ t: "text", delta: outText });
			}
			for (const call of finalCalls) {
				push({ t: "tool_call", id: call.id, name: call.name, args: call.args });
			}

			const toolCalls: AiMessageToolCall[] = finalCalls.map((c) => ({
				id: c.id,
				name: c.name,
				args: c.args
			}));
			await appendMessage(db, activeConversationId, {
				role: "assistant",
				content: assistantText,
				toolCalls: toolCalls.length > 0 ? toolCalls : null,
				toolResults: null,
				inputTokens,
				outputTokens
			});
			await touchUpdatedAt(db, activeConversationId);
			await recordSpend(env.AI_QUOTA_KV, userId, inputTokens, outputTokens);
		} catch (err) {
			errored = err instanceof Error ? err.message : "Stream failed";
			push({ t: "error", message: errored });
		}

		await logChatTurn({
			userId,
			conversationId: activeConversationId,
			turnId,
			inputTokens,
			outputTokens,
			toolCallCount: finalCalls.length,
			toolCallSuccessCount: successCount,
			latencyMs: Date.now() - start,
			promptVersion: PROMPT_VERSION,
			retried,
			error: errored ?? undefined
		});

		push({
			t: "end",
			turnId,
			conversationId: activeConversationId,
			inputTokens,
			outputTokens
		});
	});
};
