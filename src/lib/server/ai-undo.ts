/**
 * Server-side reversal of an applied AI Copilot action ("undo").
 * Each executed tool stores an InverseRecord (a reverse tool call + optional snapshot);
 * applyInverse re-executes that reverse call against D1 and returns an UndoEffect the
 * client uses to reflect the change on the board (inject/remove countdowns).
 * INVARIANT: the inverse vocabulary here must stay in lockstep with $lib/ai/inverse.ts —
 * every tool that produces an inverse must have a matching case below, or undo breaks silently.
 * INVARIANT: snapshot-based restore inverses regenerate fresh row IDs (the original row is
 * gone), so a restored countdown is not identity-equal to the deleted original.
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./db";
import { countdowns } from "./schema";
import { toCountdown } from "./dto";
import type { Countdown } from "#lib/types.js";
import {
	update as updateCountdownRepo,
	remove as removeCountdownRepo,
	setShare as setShareRepo
} from "./repositories/countdowns";

/** What the undo changed, so the client can reflect it on the board (inject upserts, remove deletes). */
export interface UndoEffect {
	inject: Countdown[];
	remove: string[];
}

/** Thrown when an undo cannot proceed because the target row no longer exists or the
 * inverse is malformed. Callers map this to a user-facing "can't undo" state rather than a crash. */
export class UndoInvalidatedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UndoInvalidatedError";
	}
}

/** Allowlist of inverse tool names accepted by validateInverse/applyInverse. Persisted
 * action.inverse.tool is untrusted input; only these names may execute. */
export const KNOWN_INVERSE_TOOLS = new Set([
	"noop",
	"deleteCountdown",
	"updateCountdown",
	"restoreCountdown",
	"setShareCountdown"
]);

/** Restore-style inverses that recreate a deleted row and therefore REQUIRE a snapshot
 * payload; validateInverse rejects them if snapshot is absent. */
const SNAPSHOT_REQUIRED_INVERSES = new Set(["restoreCountdown"]);

/** Structural gate run on the persisted inverse before applyInverse. Verifies the tool is
 * allowlisted, args is a plain object, and snapshot is present for restore inverses.
 * Does NOT validate arg field shapes — applyInverse coerces those per-case. */
export const validateInverse = (inverse: unknown): boolean => {
	if (!inverse || typeof inverse !== "object" || Array.isArray(inverse)) return false;
	const record = inverse as Record<string, unknown>;
	if (typeof record.tool !== "string" || !KNOWN_INVERSE_TOOLS.has(record.tool)) return false;
	if (!record.args || typeof record.args !== "object" || Array.isArray(record.args)) return false;
	if (
		SNAPSHOT_REQUIRED_INVERSES.has(record.tool) &&
		(!record.snapshot || typeof record.snapshot !== "object")
	) {
		return false;
	}
	return true;
};

interface InverseShape {
	tool: string;
	args: unknown;
	snapshot?: unknown;
}

const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const asBool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);

const getOwned = async (db: Database, userId: string, id: string): Promise<Countdown | null> => {
	const row = await db
		.select()
		.from(countdowns)
		.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
		.get();
	return row ? toCountdown(row) : null;
};

/** Recreates a deleted countdown from its snapshot, reusing its original id when free. */
const insertCountdownFromSnapshot = async (
	db: Database,
	userId: string,
	snapshot: Record<string, unknown>
): Promise<Countdown> => {
	const wantedId = asString(snapshot.id);
	const taken = wantedId ? await getOwned(db, userId, wantedId) : null;
	const id = wantedId && !taken ? wantedId : crypto.randomUUID();
	const now = new Date();
	const targetRaw = asString(snapshot.targetAt);
	const targetAt = targetRaw && !Number.isNaN(Date.parse(targetRaw)) ? new Date(targetRaw) : now;
	await db
		.insert(countdowns)
		.values({
			id,
			userId,
			title: asString(snapshot.title) ?? "",
			targetAt,
			hasTime: asBool(snapshot.hasTime) ?? false,
			shareToken: asString(snapshot.shareToken) ?? null,
			position: typeof snapshot.position === "number" ? snapshot.position : 0,
			createdAt: now,
			updatedAt: now
		})
		.run();
	const inserted = await getOwned(db, userId, id);
	if (!inserted) throw new UndoInvalidatedError("Failed to restore countdown.");
	return inserted;
};

/**
 * Executes the reverse tool call recorded for an action. SIDE EFFECT: writes to D1.
 * INVARIANT: every case must exist for each inverse tool emitted by $lib/ai/inverse.ts.
 * @returns the UndoEffect (countdowns to inject/remove on the board).
 * @throws UndoInvalidatedError on missing target, bad args, or unknown tool.
 */
export const applyInverse = async (
	db: Database,
	userId: string,
	inverse: InverseShape
): Promise<UndoEffect> => {
	const args = (inverse.args as Record<string, unknown>) ?? {};

	switch (inverse.tool) {
		case "noop":
			return { inject: [], remove: [] };

		case "deleteCountdown": {
			const id = asString(args.id);
			if (!id) throw new UndoInvalidatedError("Missing id for deleteCountdown inverse");
			if (!(await getOwned(db, userId, id)))
				throw new UndoInvalidatedError("Countdown no longer exists.");
			await removeCountdownRepo(db, userId, id);
			return { inject: [], remove: [id] };
		}

		case "updateCountdown": {
			const id = asString(args.id);
			if (!id) throw new UndoInvalidatedError("Missing id");
			if (!(await getOwned(db, userId, id)))
				throw new UndoInvalidatedError("Countdown no longer exists.");
			const targetAt = asString(args.targetAt);
			const ok = await updateCountdownRepo(db, userId, id, {
				title: asString(args.title),
				targetAt: targetAt && !Number.isNaN(Date.parse(targetAt)) ? targetAt : undefined,
				hasTime: asBool(args.hasTime)
			});
			if (!ok) throw new UndoInvalidatedError("Countdown no longer exists.");
			const after = await getOwned(db, userId, id);
			return { inject: after ? [after] : [], remove: [] };
		}

		case "restoreCountdown": {
			const snapshot = (inverse.snapshot as Record<string, unknown> | undefined) ?? {};
			const restored = await insertCountdownFromSnapshot(db, userId, snapshot);
			return { inject: [restored], remove: [] };
		}

		case "setShareCountdown": {
			const id = asString(args.id);
			const enabled = asBool(args.enabled);
			if (!id || enabled === undefined) throw new UndoInvalidatedError("Bad args");
			const result = await setShareRepo(db, userId, id, enabled);
			if (!result.ok) throw new UndoInvalidatedError("Countdown no longer exists.");
			const after = await getOwned(db, userId, id);
			return { inject: after ? [after] : [], remove: [] };
		}

		default:
			throw new UndoInvalidatedError(`Unknown inverse tool: ${inverse.tool}`);
	}
};

export { sql };
