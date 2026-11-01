import { describe, expect, it } from "vitest";
import type { Countdown } from "$lib/types";
import { applyOrder, orderByPosition, partitionCountdowns } from "./partition";

const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

const make = (id: string, targetAt: string): Countdown => ({
	id,
	title: id,
	targetAt,
	hasTime: true,
	shareToken: null,
	position: 0,
	createdAt: "2026-01-01T00:00:00.000Z"
});

const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const DAY = 86_400_000;

describe("partitionCountdowns", () => {
	it("returns empty lists and no hero for an empty board", () => {
		expect(partitionCountdowns([], NOW)).toEqual({ upcoming: [], past: [], hero: null });
	});

	it("splits at now with a target exactly at now counted as past", () => {
		const board = [make("future", iso(60_000)), make("now", iso(0)), make("past", iso(-60_000))];
		const { upcoming, past } = partitionCountdowns(board, NOW);
		expect([upcoming.map((c) => c.id), past.map((c) => c.id)]).toEqual([
			["future"],
			["now", "past"]
		]);
	});

	it("orders upcoming soonest first and past most recent first", () => {
		const board = [
			make("later", iso(3 * DAY)),
			make("sooner", iso(3_600_000)),
			make("old", iso(-7 * DAY)),
			make("recent", iso(-3_600_000))
		];
		const { upcoming, past } = partitionCountdowns(board, NOW);
		expect([upcoming.map((c) => c.id), past.map((c) => c.id)]).toEqual([
			["sooner", "later"],
			["recent", "old"]
		]);
	});

	it("promotes the soonest upcoming countdown to hero and never a past one", () => {
		const board = [make("later", iso(DAY)), make("sooner", iso(1_000)), make("past", iso(-1))];
		expect([
			partitionCountdowns(board, NOW).hero?.id,
			partitionCountdowns([make("past", iso(-1))], NOW).hero
		]).toEqual(["sooner", null]);
	});

	it("keeps ties stable and excludes rows with an unparseable target", () => {
		const board = [make("a", iso(5_000)), make("broken", "not-a-date"), make("b", iso(5_000))];
		const { upcoming, past } = partitionCountdowns(board, NOW);
		expect([upcoming.map((c) => c.id), past]).toEqual([["a", "b"], []]);
	});

	it("does not mutate the caller's array order", () => {
		const board = [make("late", iso(10_000)), make("early", iso(1_000))];
		partitionCountdowns(board, NOW);
		expect(board.map((c) => c.id)).toEqual(["late", "early"]);
	});
});

describe("applyOrder", () => {
	const board = [make("a", iso(1)), make("b", iso(2)), make("c", iso(3))];
	const ids = (orderedIds: string[]) => applyOrder(board, orderedIds).map((c) => c.id);

	it("reorders to the given ids and appends unlisted survivors", () => {
		expect(ids(["c", "a"])).toEqual(["c", "a", "b"]);
	});

	it("ignores unknown and repeated ids so no row is duplicated or dropped", () => {
		expect(ids(["b", "b", "ghost"])).toEqual(["b", "a", "c"]);
	});

	it("returns the same order for an empty list and a new array", () => {
		const next = applyOrder(board, []);
		expect([next.map((c) => c.id), next === board, board.map((c) => c.id)]).toEqual([
			["a", "b", "c"],
			false,
			["a", "b", "c"]
		]);
	});
});

describe("orderByPosition", () => {
	it("sorts ascending, keeps ties stable, and does not mutate the input", () => {
		const items = [
			{ id: "b", position: 1 },
			{ id: "a", position: 0 },
			{ id: "c", position: 1 }
		];
		expect([orderByPosition(items).map((i) => i.id), items.map((i) => i.id)]).toEqual([
			["a", "b", "c"],
			["b", "a", "c"]
		]);
	});
});
