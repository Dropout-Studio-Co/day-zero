/**
 * Builders that produce the InverseRecord (reverse tool call + optional state
 * snapshot) stored with every executed tool so the action can be undone.
 * CRITICAL INVARIANT: every executor in ./tools.ts must call a matching builder
 * here, in lockstep — a missing/incorrect inverse breaks undo silently.
 * Some inverse `tool` names (restoreCountdown, noop) are SERVER-ONLY undo
 * operations resolved by applyInverse — they are NOT in the model-facing catalog
 * or client executors.
 * @see $lib/server/ai-undo.ts (applies these), ./executor.ts (records them).
 */

import type { Countdown } from "#lib/types.js";
import type { InverseRecord } from "./types";

export type { InverseRecord } from "./types";

export interface CountdownSnapshot {
	id: string;
	title: string;
	targetAt: string;
	hasTime: boolean;
	shareToken: string | null;
	position: number;
}

/** Snapshot of a countdown taken BEFORE mutation, for restore-on-undo. */
export const snapshotCountdown = (c: Countdown): CountdownSnapshot => ({
	id: c.id,
	title: c.title,
	targetAt: c.targetAt,
	hasTime: c.hasTime,
	shareToken: c.shareToken,
	position: c.position
});

/** Undo a create by deleting the new row. */
export const inverseForCreateCountdown = (newId: string): InverseRecord => ({
	tool: "deleteCountdown",
	args: { id: newId }
});

/** Undo an update by writing the captured pre-edit fields back. */
export const inverseForUpdateCountdown = (
	id: string,
	snapshot: CountdownSnapshot
): InverseRecord => ({
	tool: "updateCountdown",
	args: {
		id,
		title: snapshot.title,
		targetAt: snapshot.targetAt,
		hasTime: snapshot.hasTime
	},
	snapshot
});

/** Undo a delete by recreating the row from its snapshot (server-only inverse). */
export const inverseForDeleteCountdown = (snapshot: CountdownSnapshot): InverseRecord => ({
	tool: "restoreCountdown",
	args: {},
	snapshot
});

/** Undo a share toggle by replaying the previous enabled state. */
export const inverseForSetShareCountdown = (
	id: string,
	previousEnabled: boolean
): InverseRecord => ({
	tool: "setShareCountdown",
	args: { id, enabled: previousEnabled }
});
