/**
 * `use:reveal` — entrance animation action. Fades/translates a node in once,
 * optionally scroll-triggered (`onScroll`). GSAP loads lazily and async, so the
 * node is set to opacity:0 synchronously up front to prevent a flash before the
 * tween starts; if motion is reduced, navigating, or GSAP fails to load, the
 * inline opacity is cleared and no animation runs. Tween + ScrollTrigger are
 * killed on destroy (and `cancelled` guards the in-flight async load).
 */
import type { Action } from "svelte/action";
import { getGsap } from "#lib/motion/gsap.js";
import { prefersReducedMotion } from "#lib/motion/reduced-motion.svelte.js";
import { DURATION, EASE, DISTANCE } from "#lib/motion/tokens.js";
import type { DurationToken, DistanceToken } from "#lib/motion/tokens.js";
import { isNavigating } from "#lib/motion/view-transition.js";

export interface RevealParams {
	onScroll?: boolean;
	distance?: DistanceToken;
	duration?: DurationToken;
	delay?: number;
}

export const reveal: Action<HTMLElement, RevealParams | undefined> = (node, params) => {
	let cleanup: (() => void) | undefined;
	let cancelled = false;

	if (prefersReducedMotion.current || isNavigating()) {
		return { destroy() {} };
	}

	node.style.opacity = "0";

	const run = async () => {
		const loaded = await getGsap();
		if (cancelled) return;
		if (!loaded) {
			node.style.opacity = "";
			return;
		}

		const distance = DISTANCE[params?.distance ?? "sm"];
		const duration = DURATION[params?.duration ?? "base"];
		const delay = params?.delay ?? 0;

		const vars: Record<string, unknown> = {
			opacity: 1,
			y: 0,
			duration,
			delay,
			ease: EASE.decelerate,
			clearProps: "opacity,transform"
		};
		if (params?.onScroll) {
			vars.scrollTrigger = { trigger: node, start: "top 85%", once: true };
		}

		const tween = loaded.gsap.fromTo(node, { opacity: 0, y: distance }, vars);
		cleanup = () => {
			tween.scrollTrigger?.kill();
			tween.kill();
		};
	};

	void run();

	return {
		destroy() {
			cancelled = true;
			cleanup?.();
		}
	};
};
