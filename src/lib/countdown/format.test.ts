import { describe, expect, it } from "vitest";
import { formatTargetDate, humanize, pad2, remaining } from "./format";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MINUTE = 60_000;
const SECOND = 1_000;
const NOW = Date.UTC(2026, 8, 1, 12, 0, 0);

const units = (ms: number) => remaining(NOW + ms, NOW, true).segments.map((s) => s.unit);

describe("remaining", () => {
	it("decomposes a multi-day distance and leads with days", () => {
		const r = remaining(NOW + DAY + HOUR + MINUTE + SECOND, NOW, true);
		expect({
			total: r.total,
			isPast: r.isPast,
			days: r.days,
			hours: r.hours,
			minutes: r.minutes,
			seconds: r.seconds
		}).toEqual({
			total: DAY + HOUR + MINUTE + SECOND,
			isPast: false,
			days: 1,
			hours: 1,
			minutes: 1,
			seconds: 1
		});
		expect(r.segments.map((s) => s.unit)).toEqual(["days", "hours", "minutes", "seconds"]);
	});

	it("drops the days segment below a full day and always ticks seconds", () => {
		expect(units(DAY - SECOND)).toEqual(["hours", "minutes", "seconds"]);
		const r = remaining(NOW + 5 * HOUR + 4 * MINUTE + 9 * SECOND, NOW, true);
		expect([r.days, r.hours, r.minutes, r.seconds]).toEqual([0, 5, 4, 9]);
	});

	it("treats the exact target instant as reached", () => {
		const r = remaining(NOW, NOW, true);
		expect({
			total: r.total,
			isPast: r.isPast,
			zeroed: r.segments.every((s) => s.value === 0)
		}).toEqual({
			total: 0,
			isPast: true,
			zeroed: true
		});
	});

	it("stays symmetric for past targets and reports them as past", () => {
		const r = remaining(NOW - 2 * DAY - 3 * HOUR, NOW, false);
		expect({ isPast: r.isPast, total: r.total, days: r.days, hours: r.hours }).toEqual({
			isPast: true,
			total: -(2 * DAY + 3 * HOUR),
			days: 2,
			hours: 3
		});
		expect(r.segments[0]).toEqual({ value: 2, label: "days", unit: "days" });
	});

	it("pluralizes singular units and keeps zero as a plural", () => {
		expect(remaining(NOW + HOUR, NOW, true).segments.map((s) => s.label)).toEqual([
			"hr",
			"mins",
			"secs"
		]);
		expect(remaining(NOW + 1, NOW, true).segments.map((s) => s.label)).toEqual([
			"hrs",
			"mins",
			"secs"
		]);
	});
});

describe("pad2 and humanize", () => {
	it("zero-pads to two digits without truncating longer values", () => {
		expect([pad2(0), pad2(5), pad2(59), pad2(100)]).toEqual(["00", "05", "59", "100"]);
	});

	it("summarizes future targets at each granularity", () => {
		expect([
			humanize(NOW + 3 * DAY, NOW, false),
			humanize(NOW + 12 * HOUR + 4 * MINUTE, NOW, true),
			humanize(NOW + 5 * MINUTE, NOW, true),
			humanize(NOW + 30 * SECOND, NOW, true)
		]).toEqual(["in 3 days", "in 12h 04m", "in 5m", "any moment now"]);
	});

	it("summarizes reached targets, including the boundary", () => {
		expect([
			humanize(NOW, NOW, true),
			humanize(NOW - 2 * DAY, NOW, false),
			humanize(NOW - DAY, NOW, false),
			humanize(NOW - 3 * HOUR, NOW, true)
		]).toEqual(["reached", "2 days ago", "1 day ago", "3h ago"]);
	});
});

describe("formatTargetDate", () => {
	it("renders a date-only goal on its stored UTC calendar day", () => {
		expect(formatTargetDate("2026-09-11T00:00:00.000Z", false)).toBe("Fri, Sep 11, 2026");
	});

	it("returns an empty string for an unparseable date", () => {
		expect([formatTargetDate("not-a-date", true), formatTargetDate("", false)]).toEqual(["", ""]);
	});
});
