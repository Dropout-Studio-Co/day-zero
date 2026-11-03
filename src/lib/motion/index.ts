/**
 * Public surface of the motion system. Surface/component code imports ONLY from
 * `#lib/motion` — never from `gsap` or the internal modules directly — so the
 * SSR-safe lazy-load and reduced-motion contracts can never be bypassed.
 */
export { DURATION, DURATION_MS, EASE, STAGGER, DISTANCE } from "#lib/motion/tokens.js";
export type { DurationToken, EaseToken, StaggerToken, DistanceToken } from "#lib/motion/tokens.js";
export { getGsap } from "#lib/motion/gsap.js";
export type { GsapBundle } from "#lib/motion/gsap.js";
export { prefersReducedMotion } from "#lib/motion/reduced-motion.svelte.js";
export { reveal } from "#lib/motion/actions.js";
export type { RevealParams } from "#lib/motion/actions.js";
export { motionDuration } from "#lib/motion/helpers.js";
export { handleViewTransition, isNavigating } from "#lib/motion/view-transition.js";
