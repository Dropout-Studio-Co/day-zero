/**
 * Pure board partitioning and ordering, extracted from the countdowns store so the
 * hero/upcoming/past rules and the reorder merge are unit-testable without runes.
 * `now` is passed in (never read here), keeping the derived board deterministic.
 */
import type { Countdown } from "#lib/types.js";

export interface BoardPartition {
	/** Future targets, soonest first (the grid). */
	upcoming: Countdown[];
	/** Reached targets, most recent first (the quiet section). */
	past: Countdown[];
	/** The soonest upcoming countdown, or null when nothing is upcoming. */
	hero: Countdown | null;
}

const targetMs = (c: Countdown): number => Date.parse(c.targetAt);

/**
 * Splits the board at `now`. A target exactly at `now` counts as past (it has
 * been reached). Rows whose `targetAt` does not parse are excluded from both
 * lists rather than being silently sorted to an arbitrary edge.
 */
export const partitionCountdowns = (all: Countdown[], now: number): BoardPartition => {
	const upcoming = all.filter((c) => targetMs(c) > now).sort((a, b) => targetMs(a) - targetMs(b));
	const past = all.filter((c) => targetMs(c) <= now).sort((a, b) => targetMs(b) - targetMs(a));
	return { upcoming, past, hero: upcoming[0] ?? null };
};

/**
 * Applies a drag order to the board: listed ids come first in the given order,
 * then every survivor not named in the list keeps its previous relative order.
 * Ids that are unknown or repeated are ignored, so a malformed list can never
 * duplicate a row or drop one.
 */
export const applyOrder = <T extends { id: string }>(all: T[], orderedIds: string[]): T[] => {
	const byId = new Map(all.map((item) => [item.id, item]));
	const seen = new Set<string>();
	const next: T[] = [];
	for (const id of orderedIds) {
		if (seen.has(id)) continue;
		const item = byId.get(id);
		if (!item) continue;
		seen.add(id);
		next.push(item);
	}
	for (const item of all) {
		if (!seen.has(item.id)) next.push(item);
	}
	return next;
};

/** Stable ascending sort by persisted position (guest migration replay order). */
export const orderByPosition = <T extends { position: number }>(all: T[]): T[] =>
	[...all].sort((a, b) => a.position - b.position);
