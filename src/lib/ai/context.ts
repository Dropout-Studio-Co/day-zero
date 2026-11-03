/**
 * Serializes the user's current countdowns into a compact, human-readable summary
 * injected as CURRENT STATE in the prompt. Unlike the invoice sibling, ids are NOT
 * tokenized — the model sees and references real countdown ids directly (simpler,
 * and the markdown/error sanitizers strip any UUID that leaks into reply text).
 * @see ./prompts.ts buildUserTurn (embeds summaryText), src/routes/api/ai/chat/+server.ts.
 */

import type { AppState } from "#lib/server/dto.js";
import type { Countdown } from "#lib/types.js";

export interface ContextPayload {
	summaryText: string;
	count: number;
}

/** Compact relative-distance label from now → target, for the model's reference. */
const relativeLabel = (targetMs: number, nowMs: number): string => {
	const diff = targetMs - nowMs;
	const past = diff < 0;
	const absDays = Math.floor(Math.abs(diff) / 86_400_000);
	if (absDays >= 1) return past ? `${absDays}d ago` : `in ${absDays}d`;
	const absHours = Math.floor(Math.abs(diff) / 3_600_000);
	if (absHours >= 1) return past ? `${absHours}h ago` : `in ${absHours}h`;
	return past ? "reached" : "soon";
};

const projectCountdown = (c: Countdown, nowMs: number): string => {
	const targetMs = Date.parse(c.targetAt);
	const rel = Number.isNaN(targetMs) ? "" : ` (${relativeLabel(targetMs, nowMs)})`;
	const flags = [c.shareToken ? "shared" : null].filter(Boolean).join(", ");
	return `  id=${c.id} "${c.title || "(untitled)"}" target=${c.targetAt}${c.hasTime ? " (timed)" : ""}${rel}${flags ? ` [${flags}]` : ""}`;
};

const renderSummary = (countdowns: Countdown[]): string => {
	if (countdowns.length === 0) return "Countdowns: none yet.";
	const nowMs = Date.now();
	const lines = [`Countdowns (${countdowns.length}):`];
	for (const c of countdowns) lines.push(projectCountdown(c, nowMs));
	return lines.join("\n");
};

/** Builds the per-turn context payload from the loaded AppState. */
export const projectAppState = (appState: AppState): ContextPayload => ({
	summaryText: renderSummary(appState.countdowns),
	count: appState.countdowns.length
});
