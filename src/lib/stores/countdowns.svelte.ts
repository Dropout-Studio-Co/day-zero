/**
 * Countdown board store, synced to D1. Singleton built by a factory closure
 * (Svelte 5 `$state` is declaration-scoped, so reactive fields live inside the
 * factory and are exposed via getters).
 *
 * Persistence: mutations update local `$state` immutably and persist via the API
 * — text edits (title) through keyed debounceSync, structural changes
 * (targetAt/hasTime/order/share) immediately via sync(). hydrate() runs
 * exactly ONCE in +page.svelte under untrack(); do not add a second hydrate path.
 *
 * Derived partitions read `clock.now`, so the board re-partitions itself the
 * instant a countdown crosses zero (upcoming → past). `ai*` methods mutate local
 * state only and exist so the AI copilot can reflect its API writes on the board.
 */
import type { Countdown, CountdownInput, CountdownPatch } from "#lib/types.js";
import { api, debounceSync, sync } from "#lib/api/client.js";
import { applyOrder, orderByPosition, partitionCountdowns } from "#lib/countdown/partition.js";
import { readLocal, writeLocal, clearLocal } from "#lib/persistence/local.js";
import { clock } from "./clock.svelte";

// Versioned localStorage key holding the logged-out user's board.
const GUEST_KEY = "day-zero:guest:v1";

const TEXT_DEBOUNCE_MS = 400;
const TEXT_KEYS = new Set<keyof CountdownPatch>(["title"]);

const isTextOnlyPatch = (patch: CountdownPatch): boolean => {
	const keys = Object.keys(patch);
	return keys.length > 0 && keys.every((k) => TEXT_KEYS.has(k as keyof CountdownPatch));
};

const applyPatch = (c: Countdown, patch: CountdownPatch): Countdown => ({
	...c,
	...(patch.title !== undefined ? { title: patch.title } : {}),
	...(patch.targetAt !== undefined ? { targetAt: patch.targetAt } : {}),
	...(patch.hasTime !== undefined ? { hasTime: patch.hasTime } : {})
});

const createCountdownsStore = () => {
	let countdowns = $state<Countdown[]>([]);
	// Set once at hydration. Authed → mutations persist to D1 (cross-device).
	// Guest → mutations persist to localStorage on this device only, and creates
	// mint their own ids/positions client-side (no server round-trip).
	let authed = false;

	const saveLocal = () => writeLocal(GUEST_KEY, countdowns);

	const hydrate = (initial: { countdowns: Countdown[] }, opts?: { authed?: boolean }) => {
		countdowns = initial.countdowns;
		authed = opts?.authed ?? false;
	};

	// Browser-only: re-seed the guest board from localStorage after mount (SSR
	// can't read it). Called from +page.svelte's onMount when there's no session.
	// Additive over the empty server state — does not re-run server hydration, so
	// the single-untrack-site invariant for authed data stays intact.
	const loadGuest = () => {
		const guest = readLocal<Countdown[]>(GUEST_KEY);
		if (guest && guest.length > 0) countdowns = guest;
	};

	// Browser-only: on first authed load, recreate any guest countdowns in the
	// account (append), reflect them on the board, then drop the guest key.
	// Idempotent across retries: only the items that actually FAILED are kept in
	// localStorage, so re-running recreates just those — never duplicates a success.
	const migrateGuestToServer = async () => {
		const guest = readLocal<Countdown[]>(GUEST_KEY);
		if (!guest || guest.length === 0) {
			clearLocal(GUEST_KEY);
			return;
		}
		const ordered = orderByPosition(guest);
		const created: Countdown[] = [];
		const failed: Countdown[] = [];
		for (const g of ordered) {
			const c = await sync(() =>
				api.post<Countdown>("/api/countdowns", {
					title: g.title,
					targetAt: g.targetAt,
					hasTime: g.hasTime
				})
			);
			if (!c) {
				failed.push(g);
				continue;
			}
			created.push(c);
		}
		if (created.length > 0) countdowns = [...countdowns, ...created];
		if (failed.length === 0) clearLocal(GUEST_KEY);
		else writeLocal(GUEST_KEY, failed);
	};

	const add = async (input: CountdownInput): Promise<Countdown | null> => {
		if (authed) {
			const created = await sync(() => api.post<Countdown>("/api/countdowns", input));
			if (!created) return null;
			countdowns = [...countdowns, created];
			return created;
		}
		// Guest: build the entity locally (server would assign these when authed).
		const maxPos = countdowns.reduce((m, c) => Math.max(m, c.position), -1);
		const created: Countdown = {
			id: crypto.randomUUID(),
			title: input.title,
			targetAt: input.targetAt,
			hasTime: input.hasTime ?? false,
			shareToken: null,
			position: maxPos + 1,
			createdAt: new Date().toISOString()
		};
		countdowns = [...countdowns, created];
		saveLocal();
		return created;
	};

	const update = (id: string, patch: CountdownPatch) => {
		countdowns = countdowns.map((c) => (c.id === id ? applyPatch(c, patch) : c));
		if (!authed) {
			saveLocal();
			return;
		}
		const send = () => api.patch<void>(`/api/countdowns/${id}`, patch);
		if (isTextOnlyPatch(patch)) {
			debounceSync(`cd:${id}`, TEXT_DEBOUNCE_MS, send);
		} else {
			void sync(send);
		}
	};

	const remove = (id: string) => {
		countdowns = countdowns.filter((c) => c.id !== id);
		if (!authed) {
			saveLocal();
			return;
		}
		void sync(() => api.delete<void>(`/api/countdowns/${id}`));
	};

	// Reorders local state to match orderedIds (appending any unlisted survivors),
	// then persists the new order via the PUT /api/countdowns endpoint.
	const reorder = (orderedIds: string[]) => {
		countdowns = applyOrder(countdowns, orderedIds);
		if (!authed) {
			saveLocal();
			return;
		}
		void sync(() => api.put<void>("/api/countdowns", { orderedIds }));
	};

	// Returns the share token (or null when disabled). On enable failure the local
	// state is left unchanged; disable is applied optimistically. Sharing requires
	// a server-minted token, so it is a login-only perk — a no-op for guests (the
	// share UI is hidden when logged out).
	const setShare = async (id: string, enabled: boolean): Promise<string | null> => {
		if (!authed) return null;
		if (enabled) {
			const res = await sync(() =>
				api.post<{ shareToken: string; url: string }>(`/api/countdowns/${id}/share`)
			);
			if (!res) return null;
			countdowns = countdowns.map((c) => (c.id === id ? { ...c, shareToken: res.shareToken } : c));
			return res.shareToken;
		}
		countdowns = countdowns.map((c) => (c.id === id ? { ...c, shareToken: null } : c));
		void sync(() => api.delete<void>(`/api/countdowns/${id}/share`));
		return null;
	};

	const getById = (id: string): Countdown | undefined => countdowns.find((c) => c.id === id);

	// ── AI copilot local mutators (state only; the copilot persists via the API) ──
	const aiInject = (c: Countdown) => {
		const exists = countdowns.some((x) => x.id === c.id);
		countdowns = exists ? countdowns.map((x) => (x.id === c.id ? c : x)) : [...countdowns, c];
	};
	const aiRemove = (id: string) => {
		countdowns = countdowns.filter((c) => c.id !== id);
	};

	const active = $derived(countdowns);
	const partition = $derived.by(() => partitionCountdowns(active, clock.now));
	const upcoming = $derived(partition.upcoming);
	const past = $derived(partition.past);
	const hero = $derived(partition.hero);

	return {
		get all() {
			return countdowns;
		},
		get active() {
			return active;
		},
		get upcoming() {
			return upcoming;
		},
		get past() {
			return past;
		},
		get hero() {
			return hero;
		},
		hydrate,
		loadGuest,
		migrateGuestToServer,
		add,
		update,
		remove,
		reorder,
		setShare,
		getById,
		aiInject,
		aiRemove
	};
};

export const countdowns = createCountdownsStore();
