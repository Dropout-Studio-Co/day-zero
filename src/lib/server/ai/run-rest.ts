/**
 * Per-user Cloudflare Workers AI over the REST API.
 *
 * The Copilot chat turn and the model catalog run on the END USER's own Cloudflare
 * account (billed to them), NOT the owner's bound `env.AI`. Both calls authenticate
 * with the user's account-scoped API token (least-privilege: Account → Workers AI).
 *
 *   runChatViaRest  → POST /accounts/{id}/ai/run/{model}      (one chat turn)
 *   listChatModels  → GET  /accounts/{id}/ai/models/search    (function-calling chat models)
 *
 * The REST envelope wraps the model output in `{ success, result, errors }`; we
 * unwrap `result` so the existing chat parser (which expects the inner shape the
 * binding returns directly) keeps working unchanged.
 */

const CF_API = "https://api.cloudflare.com/client/v4";

/** Default chat model — the function-calling Kimi K2. New users start here. */
export const DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

export interface CloudflareCreds {
	accountId: string;
	apiToken: string;
}

/** Chat input — identical contract to the old binding call (OpenAI-style messages + tools). */
export interface ChatRestInput {
	messages: Array<{ role: string; content: string }>;
	tools?: unknown[];
	max_tokens?: number;
	temperature?: number;
}

/** Inner model output the consumer expects (matches what the binding returns directly). */
export interface ChatRestResult {
	response?: string | null;
	tool_calls?: unknown[] | null;
	usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/** A model surfaced in the picker. `id` is the run path (e.g. "@cf/meta/llama-3.3-70b-instruct-fp8-fast"). */
export interface CfModel {
	id: string;
	label: string;
	task: string;
	description: string;
	deprecated: boolean;
	beta: boolean;
}

export type CfErrorKind = "auth" | "rate_limit" | "model_unavailable" | "transport";

/** Typed Workers AI REST failure. `kind` drives the consumer's error mapping. */
export class CfInferenceError extends Error {
	public readonly status: number;
	public readonly kind: CfErrorKind;
	constructor(status: number, kind: CfErrorKind, message: string) {
		super(message);
		this.name = "CfInferenceError";
		this.status = status;
		this.kind = kind;
	}
}

function kindForStatus(status: number): CfErrorKind {
	if (status === 401 || status === 403) return "auth";
	if (status === 429) return "rate_limit";
	if (status === 404) return "model_unavailable";
	return "transport";
}

/**
 * Raw model envelope BEFORE normalization. Newer Workers AI models (kimi-k2.x,
 * gpt-oss) return ONLY the OpenAI `choices` shape; older ones (llama, mistral)
 * also expose the native top-level `response`/`tool_calls`.
 */
interface RawChatEnvelope {
	response?: string;
	tool_calls?: Array<{ name?: string; arguments?: unknown }>;
	choices?: Array<{
		message?: {
			content?: string | null;
			tool_calls?: Array<{
				name?: string;
				arguments?: unknown;
				function?: { name?: string; arguments?: unknown };
			}>;
		};
	}>;
	usage?: ChatRestResult["usage"];
}

/**
 * Collapses either response envelope into the native `{ response, tool_calls, usage }`
 * the chat parser (`#lib/ai/client.ts`) reads. Prefers the native top-level fields
 * (llama/mistral); otherwise lifts them from `choices[0].message` (kimi & other
 * OpenAI-only models), mapping OpenAI `tool_calls[].function` -> `{ name, arguments }`.
 * Without this, kimi turns (choices-only) would surface no text and no tool calls.
 */
function normalizeChatResult(raw: RawChatEnvelope): ChatRestResult {
	const message = raw.choices?.[0]?.message;
	const response =
		typeof raw.response === "string"
			? raw.response
			: typeof message?.content === "string"
				? message.content
				: "";
	const nativeCalls = Array.isArray(raw.tool_calls) ? raw.tool_calls : undefined;
	const openaiCalls =
		message && Array.isArray(message.tool_calls)
			? message.tool_calls.map((tc) => ({
					name: tc.function?.name ?? tc.name ?? "",
					arguments: tc.function?.arguments ?? tc.arguments ?? {}
				}))
			: undefined;
	const normalized: ChatRestResult = { response, tool_calls: nativeCalls ?? openaiCalls ?? [] };
	if (raw.usage !== undefined) normalized.usage = raw.usage;
	return normalized;
}

/**
 * Runs one chat turn through the user's chosen model on the user's account.
 * Returns the unwrapped model output (shape `{ response?, tool_calls?, usage? }`).
 * Throws `CfInferenceError` on any non-2xx so the consumer can map it.
 */
export async function runChatViaRest(
	creds: CloudflareCreds,
	model: string,
	input: ChatRestInput
): Promise<ChatRestResult> {
	let res: Response;
	try {
		res = await fetch(`${CF_API}/accounts/${creds.accountId}/ai/run/${model}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${creds.apiToken}`,
				"Content-Type": "application/json"
			},
			body: JSON.stringify(input)
		});
	} catch (e) {
		throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
	}

	if (!res.ok) {
		throw new CfInferenceError(
			res.status,
			kindForStatus(res.status),
			`Workers AI REST ${res.status}`
		);
	}

	// Native Workers AI REST wraps the output: { success, result, errors }.
	// The binding returns `result` directly, so unwrap + normalize to keep the chat parser working.
	const json = (await res.json()) as { result?: RawChatEnvelope };
	const raw =
		json && typeof json === "object" && "result" in json
			? (json.result ?? ({} as RawChatEnvelope))
			: (json as RawChatEnvelope);
	return normalizeChatResult(raw);
}

// ── Model catalog ────────────────────────────────────────────────────────────

/** Raw `/ai/models/search` entry (only the fields we read; shape is defensive). */
interface RawModel {
	id?: string;
	name?: string;
	description?: string;
	task?: { name?: string } | null;
	tags?: string[];
	properties?: Array<{ property_id?: string; value?: unknown }>;
}

/**
 * Known function-calling chat model ids (from the Workers AI catalog). Used as an
 * extra inclusion signal so we always surface these even if the API's task/property
 * tagging differs — the dynamic predicate below still adds any other text-generation
 * model the account exposes. DEFAULT_MODEL is included.
 */
const KNOWN_CHAT_IDS = new Set([
	"@cf/moonshotai/kimi-k2.7-code",
	"@cf/meta/llama-3.3-70b-instruct-fp8-fast",
	"@cf/meta/llama-3.1-70b-instruct",
	"@cf/meta/llama-3.1-8b-instruct",
	"@cf/meta/llama-4-scout-17b-16e-instruct",
	"@cf/mistralai/mistral-small-3.1-24b-instruct",
	"@cf/qwen/qwen2.5-coder-32b-instruct",
	"@cf/qwen/qwq-32b",
	"@hf/nousresearch/hermes-2-pro-mistral-7b",
	"@cf/google/gemma-3-12b-it"
]);

/** True when a model generates text (suitable for the function-calling chat Copilot). */
function isChatModel(m: RawModel): boolean {
	const id = m.name ?? m.id ?? "";
	if (KNOWN_CHAT_IDS.has(id)) return true;

	const task = (m.task?.name ?? "").toLowerCase();
	return task === "text generation";
}

function hasFlag(m: RawModel, flag: string): boolean {
	if ((m.tags ?? []).some((t) => t.toLowerCase() === flag)) return true;
	return (m.properties ?? []).some(
		(p) =>
			`${p.property_id ?? ""}`.toLowerCase() === flag &&
			String(p.value ?? "").toLowerCase() !== "false"
	);
}

function toCfModel(m: RawModel): CfModel {
	const id = m.name ?? m.id ?? "";
	return {
		id,
		label: id.replace(/^@cf\//, "").replace(/^@hf\//, ""),
		task: m.task?.name ?? "",
		description: m.description ?? "",
		deprecated: hasFlag(m, "deprecated"),
		beta: hasFlag(m, "beta")
	};
}

/**
 * Lists the account's SUITABLE (text-generation / function-calling) models for the
 * picker. Always includes the default model (even if the live catalog momentarily
 * omits it). Throws `CfInferenceError` on auth/transport failure (callers treat that
 * as "token invalid").
 */
export async function listChatModels(creds: CloudflareCreds): Promise<CfModel[]> {
	let res: Response;
	try {
		res = await fetch(`${CF_API}/accounts/${creds.accountId}/ai/models/search?per_page=200`, {
			headers: { Authorization: `Bearer ${creds.apiToken}` }
		});
	} catch (e) {
		throw new CfInferenceError(0, "transport", e instanceof Error ? e.message : "network error");
	}
	if (!res.ok) {
		throw new CfInferenceError(
			res.status,
			kindForStatus(res.status),
			`models/search ${res.status}`
		);
	}

	const json = (await res.json()) as { result?: RawModel[] };
	const chat = (json.result ?? []).filter(isChatModel).map(toCfModel);

	// Guarantee the default is present and first; de-dup by id.
	const byId = new Map<string, CfModel>();
	for (const m of chat) byId.set(m.id, m);
	if (!byId.has(DEFAULT_MODEL)) {
		byId.set(DEFAULT_MODEL, {
			id: DEFAULT_MODEL,
			label: "moonshotai/kimi-k2.7-code",
			task: "Text Generation",
			description: "Default Copilot model (function-calling).",
			deprecated: false,
			beta: false
		});
	}

	return [...byId.values()].sort((a, b) => {
		if (a.id === DEFAULT_MODEL) return -1;
		if (b.id === DEFAULT_MODEL) return 1;
		if (a.deprecated !== b.deprecated) return a.deprecated ? 1 : -1;
		return a.id.localeCompare(b.id);
	});
}
