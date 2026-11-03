/**
 * Higher-level motion helper built on the motion tokens. Honors reduced-motion
 * by degrading to zero so Svelte transitions complete instantly.
 */
import { prefersReducedMotion } from "#lib/motion/reduced-motion.svelte.js";
import { DURATION_MS } from "#lib/motion/tokens.js";
import type { DurationToken } from "#lib/motion/tokens.js";

// Duration in ms for Svelte transitions; returns 0 under reduced-motion so the
// transition completes instantly rather than being skipped entirely.
export const motionDuration = (token: DurationToken = "base"): number =>
	prefersReducedMotion.current ? 0 : DURATION_MS[token];
