/**
 * Orchestrates a single tool call end-to-end on the client: validate args →
 * resolve safety tier → gate Tier-B calls behind confirmation → run the executor →
 * record the action (with inverse) for undo → emit result frames via ctx.onResult.
 *
 * Tier model (see ./tools-catalog.ts):
 * - Tier A (create/update) auto-applies.
 * - Tier B (delete/share) forces a confirmation dialog before running.
 * Rejected/failed calls are still recorded (with a noop inverse) for history.
 * @see ./tools.ts (executors), ./inverse.ts (inverse builders), $lib/stores/ai.svelte.ts.
 */

import { api } from "#lib/api/client.js";
import { countdowns } from "#lib/stores/countdowns.svelte.js";
import { executors } from "./tools";
import { argSchemas, isKnownToolName, type ArgsOf } from "./schemas";
import { TIER_MAP } from "./tools-catalog";
import { toolLabel } from "./tool-labels";
import type {
	ConfirmationDiffRow,
	Frame,
	InverseRecord,
	ParsedToolCall,
	SafetyTier
} from "./types";

export type { ConfirmationDiffRow } from "./types";

export interface ExecutionContext {
	conversationId: string | null;
	messageId: string | null;
	requestConfirmation: (req: ConfirmationRequest) => Promise<boolean>;
	onResult: (result: ExecutionFrame) => void;
}

export interface ConfirmationRequest {
	toolCallId: string;
	toolName: string;
	args: unknown;
	tier: SafetyTier;
	humanLabel: string;
	diff: ConfirmationDiffRow[];
	inverseSummary: string;
}

export type ExecutionFrame = Frame & { t: "tool_result" };

export interface ExecutionOutcome {
	toolCallId: string;
	toolName: string;
	status: "applied" | "rejected" | "failed";
	actionId: string | null;
	error: string | null;
}

const displayValue = (value: unknown): string => {
	if (value === undefined || value === null || value === "") return "—";
	if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
	if (typeof value === "boolean") return value ? "yes" : "no";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
};

const humanLabelFor = (toolName: string, args: unknown): string => {
	const a = (args ?? {}) as Record<string, unknown>;
	switch (toolName) {
		case "deleteCountdown": {
			const c = countdowns.getById(String(a.id));
			return `Delete countdown “${c?.title || a.id}”`;
		}
		case "setShareCountdown": {
			const c = countdowns.getById(String(a.id));
			return a.enabled
				? `Turn on public sharing for “${c?.title || a.id}”`
				: `Turn off public sharing for “${c?.title || a.id}”`;
		}
		default:
			return toolLabel(toolName);
	}
};

const buildConfirmationDetail = (
	toolName: string,
	args: unknown
): { diff: ConfirmationDiffRow[]; inverseSummary: string } => {
	const a = (args ?? {}) as Record<string, unknown>;
	const diff: ConfirmationDiffRow[] = [];
	switch (toolName) {
		case "deleteCountdown":
			return { diff, inverseSummary: "Undo recreates the deleted countdown." };
		case "setShareCountdown": {
			const c = countdowns.getById(String(a.id));
			diff.push({
				label: "sharing",
				current: displayValue(c?.shareToken ? "on" : "off"),
				proposed: displayValue(a.enabled ? "on" : "off")
			});
			return { diff, inverseSummary: "Undo restores the previous sharing state." };
		}
		default:
			return { diff, inverseSummary: "Undo reverts this change." };
	}
};

/** Persists the action (including inverse + status) to /api/ai/actions for the undo history; swallows failure and returns null. */
const recordAction = async (params: {
	conversationId: string | null;
	messageId: string | null;
	toolName: string;
	inputs: unknown;
	inverse: InverseRecord;
	safetyTier: SafetyTier;
	requiredConfirmation: boolean;
	applied: boolean;
	status: "applied" | "rejected" | "failed";
	error: string | null;
}): Promise<string | null> => {
	try {
		const created = await api.post<{ id: string }>("/api/ai/actions", {
			conversationId: params.conversationId,
			messageId: params.messageId,
			toolName: params.toolName,
			inputs: params.inputs,
			inverse: params.inverse,
			safetyTier: params.safetyTier,
			requiredConfirmation: params.requiredConfirmation,
			applied: params.applied,
			status: params.status,
			error: params.error
		});
		return created.id;
	} catch (err) {
		console.error("[ai-executor] failed to record action", err);
		return null;
	}
};

/**
 * Validates + runs one tool call, driving confirmation UI through `ctx` callbacks
 * and reporting progress via `ctx.onResult`. Never throws — every failure path
 * returns an ExecutionOutcome with status "failed". Unknown or schema-invalid
 * tools fail fast before any side effect.
 */
export const executeToolCall = async (
	call: ParsedToolCall,
	ctx: ExecutionContext
): Promise<ExecutionOutcome> => {
	if (!isKnownToolName(call.name)) {
		const error = `Unknown tool: ${call.name}`;
		ctx.onResult({ t: "tool_result", id: call.id, status: "failed", error });
		return { toolCallId: call.id, toolName: call.name, status: "failed", actionId: null, error };
	}

	const schema = argSchemas[call.name];
	const parsed = schema.safeParse(call.args ?? {});
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? "Invalid arguments";
		ctx.onResult({
			t: "tool_result",
			id: call.id,
			status: "failed",
			error: `Validation failed: ${message}`
		});
		return {
			toolCallId: call.id,
			toolName: call.name,
			status: "failed",
			actionId: null,
			error: message
		};
	}

	const args = parsed.data as ArgsOf<typeof call.name>;
	const tier: SafetyTier = TIER_MAP[call.name] ?? "A";
	const requiredConfirmation = tier === "B";

	if (requiredConfirmation) {
		ctx.onResult({ t: "tool_result", id: call.id, status: "pending_confirmation" });
		const detail = buildConfirmationDetail(call.name, args);
		const approved = await ctx.requestConfirmation({
			toolCallId: call.id,
			toolName: call.name,
			args,
			tier,
			humanLabel: humanLabelFor(call.name, args),
			diff: detail.diff,
			inverseSummary: detail.inverseSummary
		});
		if (!approved) {
			const actionId = await recordAction({
				conversationId: ctx.conversationId,
				messageId: ctx.messageId,
				toolName: call.name,
				inputs: args,
				inverse: { tool: "noop", args: {} },
				safetyTier: tier,
				requiredConfirmation,
				applied: false,
				status: "rejected",
				error: null
			});
			ctx.onResult({
				t: "tool_result",
				id: call.id,
				status: "rejected",
				actionId: actionId ?? undefined
			});
			return {
				toolCallId: call.id,
				toolName: call.name,
				status: "rejected",
				actionId,
				error: null
			};
		}
	}

	try {
		const executor = executors[call.name];
		const result = await executor(args as never);
		const actionId = await recordAction({
			conversationId: ctx.conversationId,
			messageId: ctx.messageId,
			toolName: call.name,
			inputs: args,
			inverse: result.inverse,
			safetyTier: tier,
			requiredConfirmation,
			applied: true,
			status: "applied",
			error: null
		});
		ctx.onResult({
			t: "tool_result",
			id: call.id,
			status: "applied",
			summary: result.summary,
			actionId: actionId ?? undefined
		});
		return { toolCallId: call.id, toolName: call.name, status: "applied", actionId, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : "Tool execution failed";
		const actionId = await recordAction({
			conversationId: ctx.conversationId,
			messageId: ctx.messageId,
			toolName: call.name,
			inputs: args,
			inverse: { tool: "noop", args: {} },
			safetyTier: tier,
			requiredConfirmation,
			applied: false,
			status: "failed",
			error: message
		});
		ctx.onResult({
			t: "tool_result",
			id: call.id,
			status: "failed",
			error: message,
			actionId: actionId ?? undefined
		});
		return { toolCallId: call.id, toolName: call.name, status: "failed", actionId, error: message };
	}
};
