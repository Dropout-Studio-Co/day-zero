import { describe, expect, it } from "vitest";
import { argSchemas, isKnownToolName } from "./schemas";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
	schema.safeParse(value).success;

describe("createCountdown args", () => {
	it("normalizes any parseable date to an ISO-8601 UTC instant", () => {
		expect([
			argSchemas.createCountdown.parse({ title: "Launch", targetAt: "2026-09-11" }).targetAt,
			argSchemas.createCountdown.parse({ title: "Launch", targetAt: "2026-09-11T21:30:00Z" })
				.targetAt
		]).toEqual(["2026-09-11T00:00:00.000Z", "2026-09-11T21:30:00.000Z"]);
	});

	it("rejects an empty title and an unparseable date", () => {
		expect([
			ok(argSchemas.createCountdown, { title: "", targetAt: "2026-09-11" }),
			ok(argSchemas.createCountdown, { title: "x", targetAt: "tomorrow-ish" })
		]).toEqual([false, false]);
	});

	it("bounds the title at 200 chars and the raw date at 40", () => {
		expect([
			ok(argSchemas.createCountdown, { title: "a".repeat(200), targetAt: "2026-09-11" }),
			ok(argSchemas.createCountdown, { title: "a".repeat(201), targetAt: "2026-09-11" }),
			ok(argSchemas.createCountdown, { title: "x", targetAt: `2026-09-11${" ".repeat(40)}` })
		]).toEqual([true, false, false]);
	});
});

describe("updateCountdown args", () => {
	it("rejects an empty patch that only carries the id", () => {
		expect(ok(argSchemas.updateCountdown, { id: "abc" })).toBe(false);
	});

	it("accepts a real field and normalizes its date", () => {
		expect(argSchemas.updateCountdown.parse({ id: "abc", targetAt: "2026-09-11" })).toEqual({
			id: "abc",
			targetAt: "2026-09-11T00:00:00.000Z"
		});
	});
});

describe("tool argument boundaries", () => {
	it("requires a non-empty id for delete and a boolean share flag", () => {
		expect([
			ok(argSchemas.deleteCountdown, { id: "" }),
			ok(argSchemas.deleteCountdown, { id: "abc" }),
			ok(argSchemas.setShareCountdown, { id: "abc", enabled: true }),
			ok(argSchemas.setShareCountdown, { id: "abc", enabled: "yes" })
		]).toEqual([false, true, true, false]);
	});

	it("recognizes only the catalogued tool names, never inherited object keys", () => {
		expect(
			["createCountdown", "restoreCountdown", "toString", "constructor"].map(isKnownToolName)
		).toEqual([true, false, false, false]);
	});
});
