<!--
	Empty-state shown before the first message: animated glyph, headline, and suggestion cards.
	Clicking a card prefills the composer (via onSuggestionClick) rather than sending immediately.
-->
<script lang="ts">
	import { CalendarPlus, Timer, Trophy, HelpCircle } from "@lucide/svelte";
	import { Heading } from "#lib/ds/index.js";

	let {
		onSuggestionClick
	}: {
		onSuggestionClick: (text: string) => void;
	} = $props();

	const headline = "say the goal. the countdown starts.";
	const subtext = "Describe a milestone in plain words — it lands on your board as a live countdown.";

	const suggestions = [
		{
			icon: CalendarPlus,
			title: "add a countdown",
			desc: "e.g. my exam on Aug 12",
			query: "Add a countdown to my exam on August 12"
		},
		{
			icon: Timer,
			title: "how long until…",
			desc: "ask the time remaining",
			query: "How long until my closest goal?"
		},
		{
			icon: Trophy,
			title: "which goal is closest?",
			desc: "find the next milestone",
			query: "Which goal is closest?"
		},
		{ icon: HelpCircle, title: "what can I do here?", desc: "see what's possible", query: "What can I do here?" }
	];
</script>

<div
	class="flex min-h-24 flex-1 flex-col items-center justify-center px-4 pb-4 md:min-h-0 md:justify-end md:px-6 md:pb-8"
>
	<div
		class="launcher-icon-row launcher-idle-row mb-5 md:mb-7"
		style="animation: chat-greeting-stagger 0.4s ease-out both; animation-delay: 0ms;"
		aria-hidden="true"
	>
		<div></div>
		<div></div>
		<div></div>
		<div></div>
	</div>
	<div class="text-center" style="animation: chat-greeting-stagger 0.4s ease-out both; animation-delay: 100ms;">
		<Heading as="h2" size="subtitle" weight={600} class="text-balance">{headline}</Heading>
	</div>
	<p
		class="text-chat-text-secondary mt-2.5 max-w-md text-center text-xs text-pretty md:mt-3 md:text-sm"
		style="animation: chat-greeting-stagger 0.4s ease-out both; animation-delay: 200ms;"
	>
		{subtext}
	</p>

	<div class="mt-5 flex w-full flex-col gap-2 md:mt-6 md:gap-2.5">
		{#each suggestions as suggestion, i (suggestion.query)}
			<button
				type="button"
				onclick={() => onSuggestionClick(suggestion.query)}
				class="border-chat-border-subtle bg-chat-surface hover:border-chat-border hover:bg-chat-surface-hover flex touch-manipulation items-center gap-3 rounded-xl border border-solid px-3.5 py-2.5 text-left transition-all duration-200 md:gap-3.5 md:px-4 md:py-3"
				style="animation: chat-greeting-stagger 0.4s ease-out both; animation-delay: {300 + i * 80}ms;"
			>
				<div
					class="bg-chat-accent-subtle flex h-8 w-8 shrink-0 items-center justify-center rounded-lg md:h-9 md:w-9"
				>
					<suggestion.icon class="text-chat-icon-muted h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden="true" />
				</div>
				<div class="min-w-0">
					<p class="text-chat-text-primary text-sm font-medium">{suggestion.title}</p>
					<p class="text-chat-text-muted text-xs">{suggestion.desc}</p>
				</div>
			</button>
		{/each}
	</div>
</div>
