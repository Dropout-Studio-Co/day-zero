/**
 * The ONLY module permitted to import GSAP. getGsap() performs a browser-guarded
 * dynamic import() of gsap + ScrollTrigger, registers the plugin and sets
 * defaults exactly once, then memoizes the bundle (concurrent callers share the
 * one in-flight `loading` promise).
 *
 * INVARIANT: never write a top-level `import ... from "gsap"` anywhere — GSAP
 * touches window/document at module-eval time, which breaks SSR on Cloudflare
 * Workers. Returns null on the server.
 */
import { browser } from "$app/env";
import { DURATION, EASE } from "#lib/motion/tokens.js";

type GsapModule = (typeof import("gsap"))["gsap"];
type ScrollTriggerModule = (typeof import("gsap/ScrollTrigger"))["ScrollTrigger"];

export interface GsapBundle {
	gsap: GsapModule;
	ScrollTrigger: ScrollTriggerModule;
}

let bundle: GsapBundle | null = null;
let loading: Promise<GsapBundle> | null = null;

const load = async (): Promise<GsapBundle> => {
	const [{ gsap }, { ScrollTrigger }] = await Promise.all([
		import("gsap"),
		import("gsap/ScrollTrigger")
	]);

	gsap.registerPlugin(ScrollTrigger);
	gsap.defaults({ ease: EASE.standard, duration: DURATION.base });

	bundle = { gsap, ScrollTrigger };
	return bundle;
};

export const getGsap = async (): Promise<GsapBundle | null> => {
	if (!browser) return null;
	if (bundle) return bundle;
	if (!loading) loading = load();
	return loading;
};
