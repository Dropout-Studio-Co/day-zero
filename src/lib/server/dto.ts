/**
 * Pure row → domain mappers (no I/O). Translate Drizzle row shapes into the
 * client-facing domain types in $lib/types, serializing Date columns to ISO
 * strings (Date does not survive the load → client wire boundary).
 */
import type { Countdown, PublicCountdown } from "#lib/types.js";
import type { schema } from "./db";
import type { InferSelectModel } from "drizzle-orm";

type CountdownRow = InferSelectModel<typeof schema.countdowns>;

export interface AppState {
	countdowns: Countdown[];
}

export const toCountdown = (row: CountdownRow): Countdown => ({
	id: row.id,
	title: row.title,
	targetAt: row.targetAt.toISOString(),
	hasTime: row.hasTime,
	shareToken: row.shareToken,
	position: row.position,
	createdAt: row.createdAt.toISOString()
});

/** Safe public projection for a shared countdown — never leaks ids or owner. */
export const toPublicCountdown = (row: CountdownRow): PublicCountdown => ({
	title: row.title,
	targetAt: row.targetAt.toISOString(),
	hasTime: row.hasTime
});
