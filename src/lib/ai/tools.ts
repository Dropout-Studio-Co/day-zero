/**
 * Client-side tool executors — the bodies that actually carry out each tool the
 * model emits. Each runs against the SAME countdowns store the manual board uses
 * (which persists to the REST API and reflects the change live), and returns
 * `{ inverse, summary }`: the inverse enables undo, the summary is surfaced as a toast.
 * INVARIANT: every executor must produce a correct InverseRecord (./inverse.ts)
 * in lockstep — undo breaks silently otherwise.
 * Args are pre-validated by ./schemas.ts; `ensureCountdown` throws "… not found"
 * (mapped to friendly copy by ./errors.ts) when state has drifted. Runs in the
 * browser only — do not import from a server route. @see ./executor.ts (caller).
 */

import { countdowns } from "#lib/stores/countdowns.svelte.js";
import type { Countdown } from "#lib/types.js";
import {
	inverseForCreateCountdown,
	inverseForDeleteCountdown,
	inverseForSetShareCountdown,
	inverseForUpdateCountdown,
	snapshotCountdown
} from "./inverse";
import type { InverseRecord } from "./types";
import { argSchemas, type ArgsOf } from "./schemas";

export interface ToolExecutionResult {
	inverse: InverseRecord;
	summary: string;
}

const ensureCountdown = (id: string): Countdown => {
	const c = countdowns.getById(id);
	if (!c) throw new Error(`Countdown ${id} not found in current state.`);
	return c;
};

export const executors: {
	[K in keyof typeof argSchemas]: (args: ArgsOf<K>) => Promise<ToolExecutionResult>;
} = {
	async createCountdown(args) {
		const created = await countdowns.add({
			title: args.title,
			targetAt: args.targetAt,
			hasTime: args.hasTime ?? false
		});
		if (!created) throw new Error("Failed to create countdown");
		return {
			inverse: inverseForCreateCountdown(created.id),
			summary: `Added countdown “${created.title || "untitled"}”.`
		};
	},

	async updateCountdown(args) {
		const before = snapshotCountdown(ensureCountdown(args.id));
		const patch: Parameters<typeof countdowns.update>[1] = {};
		if (args.title !== undefined) patch.title = args.title;
		if (args.targetAt !== undefined) patch.targetAt = args.targetAt;
		if (args.hasTime !== undefined) patch.hasTime = args.hasTime;
		countdowns.update(args.id, patch);
		return {
			inverse: inverseForUpdateCountdown(args.id, before),
			summary: `Updated “${before.title || "untitled"}”.`
		};
	},

	async deleteCountdown(args) {
		const before = snapshotCountdown(ensureCountdown(args.id));
		countdowns.remove(args.id);
		return {
			inverse: inverseForDeleteCountdown(before),
			summary: `Deleted “${before.title || "untitled"}”.`
		};
	},

	async setShareCountdown(args) {
		const before = ensureCountdown(args.id);
		const wasShared = before.shareToken !== null;
		const token = await countdowns.setShare(args.id, args.enabled);
		if (args.enabled && token === null) throw new Error("Failed to enable sharing");
		return {
			inverse: inverseForSetShareCountdown(args.id, wasShared),
			summary: args.enabled
				? `Sharing on for “${before.title || "untitled"}”.`
				: `Sharing off for “${before.title || "untitled"}”.`
		};
	}
};
