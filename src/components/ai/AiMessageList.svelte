<!--
	Scrolling message log. Auto-sticks to the bottom on new content unless the user has scrolled
	up (>24px from bottom). Wrapped in <svelte:boundary> so a render error degrades to an inline
	retry instead of crashing the whole rail.
-->
<script lang="ts">
	import type { AiMessage } from "#lib/stores/ai.svelte.js";
	import AiMessageComponent from "./AiMessage.svelte";
	import AiTypingIndicator from "./AiTypingIndicator.svelte";

	let {
		messages,
		isStreaming
	}: {
		messages: AiMessage[];
		isStreaming: boolean;
	} = $props();

	let scrollContainer = $state<HTMLDivElement | null>(null);
	let userScrolledUp = $state(false);

	const showTypingIndicator = $derived(
		isStreaming && messages.length > 0 && messages[messages.length - 1].role === "user"
	);

	const onScroll = () => {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
		userScrolledUp = distanceFromBottom > 24;
	};

	// Re-runs on count, streaming state, and last-message content (tracked) to follow new content.
	$effect(() => {
		const len = messages.length;
		const pending = showTypingIndicator;
		void messages.at(-1)?.content;
		if (!scrollContainer || (!len && !pending)) return;
		if (userScrolledUp) return;
		requestAnimationFrame(() => {
			if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
		});
	});
</script>

<div
	bind:this={scrollContainer}
	onscroll={onScroll}
	class="chat-scrollbar flex-1 overflow-y-auto px-4 py-4"
	aria-live="polite"
	aria-relevant="additions"
>
	<svelte:boundary>
		{#each messages as message (message.id)}
			<AiMessageComponent {message} />
		{/each}
		{#snippet failed(_error, reset)}
			<div class="chat-message-enter flex flex-col items-center gap-2 py-6 text-center" role="alert">
				<p class="text-destructive text-sm font-medium">The chat hit a display error.</p>
				<p class="text-chat-text-muted max-w-xs text-xs text-pretty">
					Something went wrong showing this conversation. Retry to reload it.
				</p>
				<button
					type="button"
					onclick={reset}
					class="border-hair bg-chat-surface text-chat-text-primary hover:border-signal hover:bg-ink-2 text-caption mt-1 touch-manipulation rounded-full border px-4 py-1.5 tracking-[0.12em] whitespace-nowrap uppercase transition-colors ease-[var(--ease)]"
				>
					Retry
				</button>
			</div>
		{/snippet}
	</svelte:boundary>
	{#if showTypingIndicator}
		<AiTypingIndicator />
	{/if}
</div>
