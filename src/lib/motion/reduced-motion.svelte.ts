/**
 * Reactive singleton tracking `(prefers-reduced-motion: reduce)`. Exported as a
 * single instance (not a factory) so all motion code reads one shared `.current`
 * that updates live on the media-query `change` event. SSR-safe: defaults to
 * false off the browser. Every animation must gate on `prefersReducedMotion.current`.
 */
import { browser } from "$app/env";

const QUERY = "(prefers-reduced-motion: reduce)";

const createReducedMotion = () => {
	let reduced = $state(browser ? window.matchMedia(QUERY).matches : false);

	if (browser) {
		window.matchMedia(QUERY).addEventListener("change", (event) => {
			reduced = event.matches;
		});
	}

	return {
		get current() {
			return reduced;
		}
	};
};

export const prefersReducedMotion = createReducedMotion();
