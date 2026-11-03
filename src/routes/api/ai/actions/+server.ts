import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireApiContext, parseJson, ok } from "#lib/server/api.js";
import { insertAction, listRecent } from "#lib/server/repositories/ai-actions.js";
import { validateInverse } from "#lib/server/ai-undo.js";
import { logToolExecution } from "#lib/server/log.js";

/**
 * AI action history collection.
 *   GET  — recent applied/rejected/failed tool actions for the user (limit, default 50, max 200).
 *   POST — records a client-executed tool action (with its inverse for undo) and
 *          structured-logs the execution. Auth + D1 via requireApiContext.
 * Timestamps serialized to ISO on the wire.
 */
const insertSchema = z.object({
	conversationId: z.string().nullable().optional(),
	messageId: z.string().nullable().optional(),
	toolName: z.string().min(1).max(120),
	inputs: z.unknown(),
	inverse: z.object({
		tool: z.string(),
		args: z.unknown(),
		snapshot: z.unknown().optional()
	}),
	safetyTier: z.enum(["A", "B"]),
	requiredConfirmation: z.boolean(),
	applied: z.boolean(),
	status: z.enum(["applied", "rejected", "failed"]),
	error: z.string().nullable().optional()
});

export const GET: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const limit = Math.min(parseInt(event.url.searchParams.get("limit") ?? "50", 10) || 50, 200);
	const rows = await listRecent(db, userId, limit);
	return ok(
		rows.map((r) => ({
			id: r.id,
			conversationId: r.conversationId,
			messageId: r.messageId,
			toolName: r.toolName,
			inputs: r.inputs,
			inverse: r.inverse,
			safetyTier: r.safetyTier,
			requiredConfirmation: r.requiredConfirmation,
			applied: r.applied,
			status: r.status,
			error: r.error,
			createdAt: r.createdAt.toISOString(),
			undoneAt: r.undoneAt?.toISOString() ?? null
		}))
	);
};

export const POST: RequestHandler = async (event) => {
	const { db, userId } = requireApiContext(event);
	const body = await parseJson(event, insertSchema);
	const row = await insertAction(db, {
		userId,
		conversationId: body.conversationId ?? null,
		messageId: body.messageId ?? null,
		toolName: body.toolName,
		inputs: body.inputs,
		inverse: body.inverse,
		safetyTier: body.safetyTier,
		requiredConfirmation: body.requiredConfirmation,
		applied: body.applied,
		status: body.status,
		error: body.error ?? null
	});
	await logToolExecution({
		userId,
		conversationId: body.conversationId ?? null,
		toolName: body.toolName,
		safetyTier: body.safetyTier,
		requiredConfirmation: body.requiredConfirmation,
		applied: body.applied,
		inverseValidated: validateInverse(body.inverse),
		error: body.error ?? undefined
	});
	return ok({ id: row.id, createdAt: row.createdAt.toISOString() });
};
