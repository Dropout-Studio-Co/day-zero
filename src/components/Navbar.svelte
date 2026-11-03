<!--
	Invisible top navbar: transparent (no background, border, blur, or shadow) and in normal document
	flow, so the main section starts cleanly BELOW it instead of under a floating overlay. Holds the
	profile/settings/logout trio (or the guest sign-in pill) at the right content edge. On lg+ the row
	shifts left when the AI copilot rail is open — the rail is a fixed overlay that reserves no layout
	space, so without this the trio would sit underneath it.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "#lib/utils.js";
	import { ai } from "#lib/stores/ai.svelte.js";

	let { children }: { children: Snippet } = $props();

	const copilotOpen = $derived(ai.desktopOpen);
</script>

<header
	class={cn(
		"flex w-full items-center justify-end px-[var(--content-x)] pt-4 sm:pt-6",
		"transition-[padding] duration-300 ease-[var(--ease)] motion-reduce:transition-none",
		copilotOpen
			? "lg:pr-[calc(var(--copilot-rail-width)+1.5rem)] xl:pr-[calc(var(--copilot-rail-width-xl)+1.5rem)]"
			: "lg:pr-[var(--content-x)]"
	)}
>
	{@render children()}
</header>
