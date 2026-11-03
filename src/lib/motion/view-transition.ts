import type { OnNavigate } from "$app/navigation";

/**
 * Cross-route View Transitions, wired via `onNavigate` in +layout.svelte.
 * Falls back gracefully (just awaits navigation, no transition) when the View
 * Transition API is unavailable or motion is reduced.
 *
 * The module-level `navigating` flag (exposed via isNavigating) lets entrance
 * animations like `use:reveal` suppress themselves mid-navigation so they don't
 * double up with the page transition.
 */
import { prefersReducedMotion } from "#lib/motion/reduced-motion.svelte.js";

let navigating = false;

export const isNavigating = (): boolean => navigating;

export const handleViewTransition = (navigation: OnNavigate): Promise<void> | void => {
	navigating = true;

	const supported =
		typeof document !== "undefined" && typeof document.startViewTransition === "function";

	if (!supported || prefersReducedMotion.current) {
		void navigation.complete.finally(() => {
			navigating = false;
		});
		return;
	}

	return new Promise<void>((resolve) => {
		const transition = document.startViewTransition(async () => {
			// Resolve first to let SvelteKit swap the DOM, THEN hold the
			// transition's snapshot open until navigation finishes.
			resolve();
			await navigation.complete;
		});
		void transition.finished.finally(() => {
			navigating = false;
		});
	});
};
