<!--
	Chat input: auto-growing textarea (capped at MAX_HEIGHT) and send. Enter sends, Shift+Enter
	inserts a newline. Exposes setValue() so AiWelcome suggestion cards can prefill the box.
-->
<script lang="ts">
	import { ai } from "#lib/stores/ai.svelte.js";
	import { cn } from "#lib/utils.js";
	import { ArrowUp } from "@lucide/svelte";
	import { tick } from "svelte";

	let {
		onSend,
		disabled = false
	}: {
		onSend: (text: string) => void;
		disabled?: boolean;
	} = $props();

	let value = $state("");
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	const MAX_HEIGHT = 200;

	const trimmed = $derived(value.trim());
	const charCount = $derived(trimmed.length);
	const canSubmit = $derived(charCount > 0 && !disabled);

	// Reset-then-set height so the textarea shrinks as well as grows with content.
	$effect(() => {
		if (!textareaEl) return;
		void value;
		textareaEl.style.height = "auto";
		textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, MAX_HEIGHT)}px`;
	});

	// Store bumps inputFocusNonce to programmatically refocus the composer (e.g. after a turn).
	$effect(() => {
		if (ai.inputFocusNonce === 0) return;
		tick().then(() => textareaEl?.focus());
	});

	const handleSubmit = () => {
		if (!canSubmit) return;
		onSend(trimmed);
		value = "";
		if (textareaEl) textareaEl.style.height = "auto";
	};

	export const setValue = (next: string) => {
		value = next;
		tick().then(() => {
			textareaEl?.focus();
			if (textareaEl) {
				textareaEl.selectionStart = textareaEl.selectionEnd = textareaEl.value.length;
			}
		});
	};

	const placeholder = $derived(disabled ? "generating response…" : "ask anything…");
</script>

<div class="px-3 pt-2 pb-3 md:px-4 md:pb-4">
	<div
		class="border-chat-border bg-chat-surface relative rounded-2xl border border-solid px-3 pt-2.5 pb-9 transition-colors duration-150 md:px-4 md:pt-3 md:pb-10"
	>
		<textarea
			bind:this={textareaEl}
			bind:value
			onkeydown={e => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					handleSubmit();
				}
			}}
			{placeholder}
			name="ai-prompt"
			aria-label="Type a request"
			rows={2}
			{disabled}
			class={cn(
				"text-chat-text-primary chat-scrollbar min-h-[3.25rem] w-full resize-none bg-transparent text-base leading-relaxed wrap-break-word transition-[height] duration-100 ease-out outline-none md:text-sm",
				disabled ? "placeholder:text-chat-text-secondary" : "placeholder:text-chat-text-muted"
			)}
			style="max-height: {MAX_HEIGHT}px;"></textarea>

		<div class="absolute right-3 bottom-2.5 flex items-center gap-2">
			<button
				type="button"
				onclick={handleSubmit}
				disabled={!canSubmit}
				aria-label={disabled ? "Generating response" : "Send message"}
				class={cn(
					"touch-manipulation rounded-full p-2 transition-all duration-200 ease-[var(--ease)]",
					disabled
						? "bg-chat-accent-muted/40 text-chat-text-muted cursor-not-allowed"
						: canSubmit
							? "bg-signal text-background hover:bg-signal/90"
							: "text-chat-text-muted cursor-not-allowed"
				)}
			>
				{#if disabled}
					<div class="flex h-4 w-4 items-center justify-center gap-[3px]" aria-hidden="true">
						<span
							class="chat-dot-pulse bg-chat-text-muted h-1 w-1 rounded-full"
							style="animation-delay: 0s;"
						></span>
						<span
							class="chat-dot-pulse bg-chat-text-muted h-1 w-1 rounded-full"
							style="animation-delay: 0.2s;"
						></span>
						<span
							class="chat-dot-pulse bg-chat-text-muted h-1 w-1 rounded-full"
							style="animation-delay: 0.4s;"
						></span>
					</div>
				{:else}
					<ArrowUp class="h-4 w-4" aria-hidden="true" />
				{/if}
			</button>
		</div>

		<span class="text-chat-text-muted/60 text-micro absolute bottom-2.5 left-4 tracking-[0.1em] uppercase">
			{#if disabled}
				generating…
			{:else}
				<span class="hidden md:inline">shift + enter for new line</span>
			{/if}
		</span>
	</div>
</div>
