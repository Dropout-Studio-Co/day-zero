/**
 * Single shared 1Hz ticker. Every countdown card derives its remaining time from
 * `clock.now` ($derived), so ONE interval drives the entire board — never one
 * interval per card. Svelte 5's fine-grained reactivity then updates only the
 * digits that actually changed.
 *
 * Seeded with Date.now() on both server and client; the client re-seeds on the
 * first tick. The momentary SSR/client value difference is patched by Svelte on
 * hydration (text content), which is expected for a live clock.
 */
import { browser } from "$app/env";

const createClock = () => {
	let now = $state(Date.now());

	if (browser) {
		setInterval(() => {
			now = Date.now();
		}, 1000);
	}

	return {
		get now() {
			return now;
		}
	};
};

export const clock = createClock();
