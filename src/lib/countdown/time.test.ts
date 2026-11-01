import { describe, expect, it } from "vitest";
import { buildTargetIso, from24Hour, parseTargetIso, to24Hour } from "./time";

describe("12-hour conversion", () => {
	it("maps both 12s and every boundary hour to a 0-23 hour", () => {
		expect([
			to24Hour(12, "AM"),
			to24Hour(1, "AM"),
			to24Hour(11, "AM"),
			to24Hour(12, "PM"),
			to24Hour(1, "PM"),
			to24Hour(11, "PM")
		]).toEqual([0, 1, 11, 12, 13, 23]);
	});

	it("maps hours back to a 12-hour clock, reading midnight and noon as 12", () => {
		expect([0, 11, 12, 23].map(from24Hour)).toEqual([
			{ hour12: "12", meridiem: "AM" },
			{ hour12: "11", meridiem: "AM" },
			{ hour12: "12", meridiem: "PM" },
			{ hour12: "11", meridiem: "PM" }
		]);
	});
});

describe("buildTargetIso", () => {
	it("anchors a date-only goal to UTC midnight", () => {
		expect(
			buildTargetIso({
				year: 2026,
				month: 9,
				day: 11,
				hour12: 9,
				minute: 0,
				meridiem: "AM",
				hasTime: false
			})
		).toBe("2026-09-11T00:00:00.000Z");
	});

	it("builds a timed goal as the matching local instant", () => {
		const iso = buildTargetIso({
			year: 2026,
			month: 9,
			day: 11,
			hour12: 9,
			minute: 30,
			meridiem: "PM",
			hasTime: true
		})!;
		const d = new Date(iso);
		expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()]).toEqual([
			2026, 9, 11, 21, 30
		]);
	});

	it("returns null when the parts cannot form a date", () => {
		expect(
			buildTargetIso({
				year: 2026,
				month: 9,
				day: Number.NaN,
				hour12: 9,
				minute: 0,
				meridiem: "AM",
				hasTime: false
			})
		).toBeNull();
	});
});

describe("parseTargetIso", () => {
	it("recovers a date-only goal's calendar day and clock in UTC", () => {
		expect(parseTargetIso("2026-09-11T00:00:00.000Z", false)).toEqual({
			year: 2026,
			month: 9,
			day: 11,
			hour12: "12",
			minute: "00",
			meridiem: "AM"
		});
	});

	it("round-trips a timed goal through build and parse", () => {
		const iso = buildTargetIso({
			year: 2026,
			month: 2,
			day: 3,
			hour12: 12,
			minute: 5,
			meridiem: "AM",
			hasTime: true
		})!;
		expect(parseTargetIso(iso, true)).toMatchObject({
			year: 2026,
			month: 2,
			day: 3,
			hour12: "12",
			minute: "05",
			meridiem: "AM"
		});
	});

	it("returns null for an unparseable instant", () => {
		expect(parseTargetIso("nope", true)).toBeNull();
	});
});
