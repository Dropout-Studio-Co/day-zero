/**
 * Per-tool Zod arg schemas — the runtime validation boundary for everything the
 * model emits. `executor.ts` (client) and the chat server route both safeParse
 * against these before executing or persisting a tool call.
 * INVARIANT: MUST stay server-safe — no DOM, store, or browser-only imports —
 * so the Worker chat route can share this module. Keep the keys in lockstep with
 * the executors in ./tools.ts and the JSON-schema mirror in ./tools-catalog.ts.
 */

import { z } from "zod";

/** Accepts any string that parses to a valid date and normalizes it to an ISO-8601 UTC string. */
const isoDate = z
	.string()
	.min(1)
	.max(40)
	.refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid date" })
	.transform((v) => new Date(v).toISOString());

/** Source of truth for tool arg validation; keyed by tool name. Update-patch schemas `.refine` to reject empty patches. */
export const argSchemas = {
	createCountdown: z.object({
		title: z.string().min(1).max(200),
		targetAt: isoDate,
		hasTime: z.boolean().optional()
	}),
	updateCountdown: z
		.object({
			id: z.string().min(1),
			title: z.string().min(1).max(200).optional(),
			targetAt: isoDate.optional(),
			hasTime: z.boolean().optional()
		})
		.refine((v) => v.title !== undefined || v.targetAt !== undefined || v.hasTime !== undefined, {
			message: "Empty patch"
		}),
	deleteCountdown: z.object({ id: z.string().min(1) }),
	setShareCountdown: z.object({
		id: z.string().min(1),
		enabled: z.boolean()
	})
} as const;

export type ArgsOf<K extends keyof typeof argSchemas> = z.infer<(typeof argSchemas)[K]>;

export const isKnownToolName = (name: string): name is keyof typeof argSchemas =>
	Object.hasOwn(argSchemas, name);
