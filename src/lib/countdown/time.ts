/**
 * Pure 12-hour clock ↔ absolute-instant conversion for the countdown composer.
 * Lifted out of CountdownComposerDialog so the mapping that decides what instant
 * is actually saved can be unit-tested.
 *
 * Storage contract: timed goals are a real local instant; date-only goals are
 * anchored to UTC midnight so the picked calendar day is stable across SSR and
 * every viewer zone (see ./format.ts).
 */
export type Meridiem = "AM" | "PM";

export interface TargetParts {
	year: number;
	month: number;
	day: number;
	hour12: number;
	minute: number;
	meridiem: Meridiem;
	hasTime: boolean;
}

export interface DateParts {
	year: number;
	month: number;
	day: number;
	hour12: string;
	minute: string;
	meridiem: Meridiem;
}

/** 12-hour clock value + AM/PM → 0–23 hour. 12 AM is 0, 12 PM is 12. */
export const to24Hour = (hour12: number, meridiem: Meridiem): number =>
	meridiem === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;

/** 0–23 hour → 12-hour clock value + AM/PM. Midnight and noon both read "12". */
export const from24Hour = (hour24: number): { hour12: string; meridiem: Meridiem } => ({
	hour12: String(hour24 % 12 === 0 ? 12 : hour24 % 12),
	meridiem: hour24 < 12 ? "AM" : "PM"
});

/** Builds the ISO instant to save, or null when the parts do not form a valid date. */
export const buildTargetIso = (parts: TargetParts): string | null => {
	const { year, month, day, hour12, minute, hasTime, meridiem } = parts;
	const ts = hasTime
		? new Date(year, month - 1, day, to24Hour(hour12, meridiem), minute, 0, 0)
		: new Date(Date.UTC(year, month - 1, day));
	return Number.isNaN(ts.getTime()) ? null : ts.toISOString();
};

/**
 * Recovers the composer fields from a stored instant. Date-only goals were
 * anchored to UTC midnight, so every field is read in UTC; timed goals are local
 * instants, so every field is read locally. Mixing the two would seed a hidden,
 * zone-dependent time-of-day into a date-only edit.
 */
export const parseTargetIso = (iso: string, hasTime: boolean): DateParts | null => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const hour24 = hasTime ? d.getHours() : d.getUTCHours();
	const { hour12, meridiem } = from24Hour(hour24);
	return {
		year: hasTime ? d.getFullYear() : d.getUTCFullYear(),
		month: (hasTime ? d.getMonth() : d.getUTCMonth()) + 1,
		day: hasTime ? d.getDate() : d.getUTCDate(),
		hour12,
		minute: String(hasTime ? d.getMinutes() : d.getUTCMinutes()).padStart(2, "0"),
		meridiem
	};
};
