/**
 * Server-side driver for one chat turn against the user's OWN Cloudflare account
 * over the Workers AI REST API (BYO — billed to them, NOT the owner's bound
 * `env.AI`). It builds an OpenAI-style request (system + windowed history + user
 * turn + tool definitions), calls `runChatViaRest(creds, model, …)` once
 * (non-streaming), and yields the buffered result as `Frame`s so the SSE UI
 * upstream is unchanged. Runs on the Worker, not the browser.
 *
 * The model is the user's selected one (or DEFAULT_MODEL). The response is read as
 * `{ response: string, tool_calls?: [{ name, arguments }], usage?: {...} }`.
 */

import type { Frame, ParsedToolCall, ToolCatalogEntry } from "./types";
import {
	runChatViaRest,
	type ChatRestInput,
	type CloudflareCreds
} from "#lib/server/ai/run-rest.js";

/** Re-export the default model id so callers fall back to it consistently. */
export { DEFAULT_MODEL as MODEL } from "#lib/server/ai/run-rest.js";

export interface RunChatParams {
	creds: CloudflareCreds;
	model: string;
	systemContext: string;
	history: Array<{ role: "user" | "assistant" | "system"; content: string }>;
	userMessage: string;
	conversationId: string;
	tools: ToolCatalogEntry[];
	maxTokens?: number;
}

export interface RawChatResult {
	text: string;
	toolCalls: ParsedToolCall[];
	inputTokens: number;
	outputTokens: number;
}

interface AiToolCallRaw {
	id?: string;
	name?: string;
	arguments?: unknown;
	function?: { name?: string; arguments?: unknown };
}

interface AiRunResult {
	response?: string | null;
	tool_calls?: AiToolCallRaw[] | null;
	usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

const buildToolsPayload = (tools: ToolCatalogEntry[]) =>
	tools.map((t) => ({
		type: "function",
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters
		}
	}));

/** Tool-call arguments may arrive as an object or a JSON string; coerce to a plain object. */
const coerceArgs = (value: unknown): unknown => {
	if (typeof value === "string") {
		try {
			return JSON.parse(value);
		} catch {
			return {};
		}
	}
	return value ?? {};
};

const normalizeToolCall = (raw: AiToolCallRaw): ParsedToolCall | null => {
	const name = raw.name ?? raw.function?.name;
	if (!name || typeof name !== "string") return null;
	const argsSource = raw.function?.arguments ?? raw.arguments;
	return {
		id: raw.id && raw.id.length > 0 ? raw.id : crypto.randomUUID(),
		name,
		args: coerceArgs(argsSource)
	};
};

/**
 * Buffers one model turn and yields it as frames (text, then tool_call frames),
 * RETURNING the accumulated RawChatResult as the generator's return value
 * (consume via the for-await done value, not a yielded frame). Non-streaming
 * under the hood — a clean compile and coherent UX are prioritized over
 * token-streaming fidelity. A model-invocation failure surfaces as one `error`
 * frame, then the partial result is returned.
 */
export const runChatFrames = async function* (
	params: RunChatParams
): AsyncGenerator<Frame, RawChatResult> {
	const messages = [
		{ role: "system", content: params.systemContext },
		...params.history.map((m) => ({ role: m.role, content: m.content })),
		{ role: "user", content: params.userMessage }
	];

	const input: ChatRestInput = {
		messages,
		max_tokens: params.maxTokens ?? 1536,
		temperature: 0.2
	};
	if (params.tools.length > 0) {
		input.tools = buildToolsPayload(params.tools);
	}

	const result: RawChatResult = { text: "", toolCalls: [], inputTokens: 0, outputTokens: 0 };

	let raw: AiRunResult;
	try {
		// Inference on the USER's account (REST), not the bound env.AI.
		raw = (await runChatViaRest(params.creds, params.model, input)) as AiRunResult;
	} catch (err) {
		yield { t: "error", message: err instanceof Error ? err.message : "Model invocation failed" };
		return result;
	}

	if (typeof raw.response === "string") {
		result.text = raw.response;
	}
	if (raw.usage) {
		result.inputTokens = raw.usage.prompt_tokens ?? 0;
		result.outputTokens = raw.usage.completion_tokens ?? 0;
	}
	if (Array.isArray(raw.tool_calls)) {
		for (const tc of raw.tool_calls) {
			const call = normalizeToolCall(tc);
			if (call) result.toolCalls.push(call);
		}
	}

	if (result.text.length > 0) {
		yield { t: "text", delta: result.text };
	}
	for (const call of result.toolCalls) {
		yield { t: "tool_call", id: call.id, name: call.name, args: call.args };
	}

	return result;
};
