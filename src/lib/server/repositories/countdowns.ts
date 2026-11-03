/**
 * D1 persistence for countdowns. All mutations are userId-scoped via ownsCountdown
 * (or a userId predicate in the WHERE) — there is no separate authz layer. Ordering
 * is by an explicit `position` column with a createdAt tiebreak. The one cross-user
 * read is getByShareToken, used by the public /s/[token] route; it returns only the
 * safe public projection (never the owner or internal ids).
 */
import { and, asc, eq, max, sql } from "drizzle-orm";
import type { Database } from "../db";
import { countdowns } from "../schema";
import type { Countdown, CountdownInput, CountdownPatch, PublicCountdown } from "#lib/types.js";
import { toCountdown, toPublicCountdown } from "../dto";

const nextPosition = async (db: Database, userId: string): Promise<number> => {
	const result = await db
		.select({ value: max(countdowns.position) })
		.from(countdowns)
		.where(eq(countdowns.userId, userId))
		.get();
	const current = result?.value;
	return typeof current === "number" ? current + 1 : 0;
};

const ownsCountdown = async (db: Database, userId: string, id: string): Promise<boolean> => {
	const row = await db
		.select({ id: countdowns.id })
		.from(countdowns)
		.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
		.get();
	return !!row;
};

export const listByUser = async (db: Database, userId: string): Promise<Countdown[]> => {
	const rows = await db
		.select()
		.from(countdowns)
		.where(eq(countdowns.userId, userId))
		.orderBy(asc(countdowns.position), asc(countdowns.createdAt))
		.all();
	return rows.map(toCountdown);
};

export const create = async (
	db: Database,
	userId: string,
	input: CountdownInput
): Promise<Countdown> => {
	const id = crypto.randomUUID();
	const position = await nextPosition(db, userId);

	await db
		.insert(countdowns)
		.values({
			id,
			userId,
			title: input.title,
			targetAt: new Date(input.targetAt),
			hasTime: input.hasTime ?? false,
			position
		})
		.run();

	const inserted = await db.select().from(countdowns).where(eq(countdowns.id, id)).get();
	return toCountdown(inserted!);
};

/** Partial update: only defined patch keys are written (undefined = unchanged).
 * @returns false if the countdown is not owned by userId. */
export const update = async (
	db: Database,
	userId: string,
	id: string,
	patch: CountdownPatch
): Promise<boolean> => {
	if (!(await ownsCountdown(db, userId, id))) return false;

	const fields: Record<string, unknown> = { updatedAt: sql`(unixepoch())` };
	if (patch.title !== undefined) fields.title = patch.title;
	if (patch.targetAt !== undefined) fields.targetAt = new Date(patch.targetAt);
	if (patch.hasTime !== undefined) fields.hasTime = patch.hasTime;

	await db
		.update(countdowns)
		.set(fields)
		.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
		.run();
	return true;
};

export const remove = async (db: Database, userId: string, id: string): Promise<void> => {
	await db
		.delete(countdowns)
		.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
		.run();
};

/** Writes the given order as 0-based `position` for every owned id; foreign ids
 * are silently skipped. Ids omitted from the list keep their prior position. */
export const reorder = async (
	db: Database,
	userId: string,
	orderedIds: string[]
): Promise<void> => {
	if (orderedIds.length === 0) return;
	const owned = await db
		.select({ id: countdowns.id })
		.from(countdowns)
		.where(eq(countdowns.userId, userId))
		.all();
	const ownedSet = new Set(owned.map((r) => r.id));

	let pos = 0;
	for (const id of orderedIds) {
		if (!ownedSet.has(id)) continue;
		await db
			.update(countdowns)
			.set({ position: pos, updatedAt: sql`(unixepoch())` })
			.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
			.run();
		pos += 1;
	}
};

/**
 * Toggles public sharing. Enabling returns the existing token (so a live link is
 * never invalidated by re-enabling) or mints a fresh `crypto.randomUUID()` one.
 * Disabling clears it. @returns { ok: false } if not owned by userId.
 */
export const setShare = async (
	db: Database,
	userId: string,
	id: string,
	enabled: boolean
): Promise<{ ok: boolean; token: string | null }> => {
	const row = await db
		.select()
		.from(countdowns)
		.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
		.get();
	if (!row) return { ok: false, token: null };

	if (enabled) {
		const token = row.shareToken ?? crypto.randomUUID();
		if (!row.shareToken) {
			await db
				.update(countdowns)
				.set({ shareToken: token, updatedAt: sql`(unixepoch())` })
				.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
				.run();
		}
		return { ok: true, token };
	}

	if (row.shareToken) {
		await db
			.update(countdowns)
			.set({ shareToken: null, updatedAt: sql`(unixepoch())` })
			.where(and(eq(countdowns.id, id), eq(countdowns.userId, userId)))
			.run();
	}
	return { ok: true, token: null };
};

/** Public, owner-agnostic lookup by share token. @returns the safe public
 * projection or null. Used by the unauthenticated /s/[token] route. */
export const getByShareToken = async (
	db: Database,
	token: string
): Promise<PublicCountdown | null> => {
	const row = await db.select().from(countdowns).where(eq(countdowns.shareToken, token)).get();
	return row ? toPublicCountdown(row) : null;
};
