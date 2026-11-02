import { describe, expect, it } from "vitest";
import {
	createCountdownSchema,
	reorderSchema,
	shareSchema,
	updateCountdownSchema
} from "./validation";

const valid = { title: "Launch", targetAt: "2026-09-11T09:00:00.000Z" };
const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
	schema.safeParse(value).success;

describe("createCountdownSchema", () => {
	it("accepts a valid body and trims the title", () => {
		expect(createCountdownSchema.parse({ ...valid, title: "  Launch  " })).toEqual(valid);
	});

	it("rejects empty and whitespace-only titles", () => {
		expect([
			ok(createCountdownSchema, { ...valid, title: "" }),
			ok(createCountdownSchema, { ...valid, title: "   " })
		]).toEqual([false, false]);
	});

	it("bounds the title at 120 characters", () => {
		expect([
			ok(createCountdownSchema, { ...valid, title: "a".repeat(120) }),
			ok(createCountdownSchema, { ...valid, title: "a".repeat(121) })
		]).toEqual([true, false]);
	});

	it("rejects missing, empty, and unparseable target dates", () => {
		expect([
			ok(createCountdownSchema, { title: "x" }),
			ok(createCountdownSchema, { ...valid, targetAt: "" }),
			ok(createCountdownSchema, { ...valid, targetAt: "2026-13-45" })
		]).toEqual([false, false, false]);
	});

	it("keeps hasTime optional and rejects a non-boolean", () => {
		expect([
			ok(createCountdownSchema, valid),
			ok(createCountdownSchema, { ...valid, hasTime: true }),
			ok(createCountdownSchema, { ...valid, hasTime: "yes" })
		]).toEqual([true, true, false]);
	});
});

describe("updateCountdownSchema", () => {
	it("rejects an empty patch", () => {
		expect(ok(updateCountdownSchema, {})).toBe(false);
	});

	it("accepts a single-field patch and drops unknown keys", () => {
		expect(updateCountdownSchema.parse({ title: "Renamed", id: "spoofed" })).toEqual({
			title: "Renamed"
		});
	});

	it("accepts a date-only patch and rejects an invalid one", () => {
		expect([
			ok(updateCountdownSchema, { targetAt: "2026-09-11" }),
			ok(updateCountdownSchema, { targetAt: "not-a-date" })
		]).toEqual([true, false]);
	});
});

describe("reorderSchema", () => {
	it("accepts an empty list and up to 500 ids", () => {
		expect([
			ok(reorderSchema, { orderedIds: [] }),
			ok(reorderSchema, { orderedIds: Array.from({ length: 500 }, (_, i) => `id-${i}`) })
		]).toEqual([true, true]);
	});

	it("rejects more than 500 ids and non-string ids", () => {
		expect([
			ok(reorderSchema, { orderedIds: Array.from({ length: 501 }, (_, i) => `id-${i}`) }),
			ok(reorderSchema, { orderedIds: [1, 2] })
		]).toEqual([false, false]);
	});
});

describe("shareSchema", () => {
	it("requires a boolean enabled flag", () => {
		expect([
			ok(shareSchema, { enabled: true }),
			ok(shareSchema, { enabled: "true" }),
			ok(shareSchema, {})
		]).toEqual([true, false, false]);
	});
});
