<!--
	Composes the Copilot chat shell (header + body + composer). Body switches between history,
	the welcome empty-state, and the message list. `bare` drops the bordered card chrome for the
	mobile sheet. Status dot derives from store error/busy/streaming flags.
-->
<script lang="ts">
	import { ai } from "#lib/stores/ai.svelte.js";
	import { createNewConversation, sendMessage } from "#lib/ai/chat-client.js";
	import AiHeader from "./AiHeader.svelte";
	import AiWelcome from "./AiWelcome.svelte";
	import AiMessageList from "./AiMessageList.svelte";
	import AiComposer from "./AiComposer.svelte";
	import AiConversationsPanel from "./AiConversationsPanel.svelte";
	import { ArrowRight } from "@lucide/svelte";
	import { cn } from "#lib/utils.js";

	let {
		bare = false,
		onClose
	}: {
		bare?: boolean;
		onClose?: () => void;
	} = $props();

	let composerRef = $state<{ setValue: (text: string) => void } | null>(null);

	const historyOpen = $derived(ai.railOpen);
	const hasMessages = $derived(ai.messages.length > 0);

	const status = $derived<"online" | "connecting" | "error">(
		ai.error ? "error" : ai.inputBusy && !ai.streaming ? "connecting" : "online"
	);

	const onSend = async (text: string) => {
		if (!text.trim() || ai.inputBusy) return;
		await sendMessage(text);
	};

	const onNewChat = async () => {
		await createNewConversation();
		ai.closeRail();
	};

	const onToggleHistory = () => {
		ai.toggleRail();
	};

	const onSuggestionClick = (text: string) => {
		composerRef?.setValue(text);
	};
</script>

<section
	class={cn(
		"bg-chat-bg flex h-full min-h-[30rem] flex-col overflow-hidden",
		!bare && "border-chat-border rounded-2xl border border-solid shadow-[var(--chat-shadow)]"
	)}
	aria-label="AI chat"
>
	<AiHeader
		{onClose}
		onNewConversation={onNewChat}
		{onToggleHistory}
		{hasMessages}
		{historyOpen}
		historyCount={ai.conversations.length}
		{status}
		showCloseButton={!!onClose}
	/>

	{#if historyOpen}
		<div class="border-chat-border-subtle border-b border-solid px-3 py-3 md:px-4">
			<AiConversationsPanel />
		</div>
	{/if}

	{#if !hasMessages}
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<AiWelcome {onSuggestionClick} />
		</div>
	{:else}
		<AiMessageList messages={ai.messages} isStreaming={ai.inputBusy} />
	{/if}

	{#if ai.connectRequired}
		<div
			role="alert"
			class="border-chat-border-subtle mx-3 mb-1 flex flex-col gap-2 rounded-xl border border-solid px-3.5 py-3 md:mx-4"
		>
			<p class="text-chat-text-primary text-xs leading-relaxed text-pretty">
				Connect your Cloudflare account to use the copilot. It runs on your own Cloudflare account, so any usage
				is billed to you.
			</p>
			<a
				href="/settings"
				class="text-signal focus-visible:outline-signal text-caption inline-flex w-fit items-center gap-1 tracking-[0.08em] uppercase transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
			>
				Connect in Settings
				<ArrowRight size={12} aria-hidden="true" />
			</a>
		</div>
	{:else if ai.error}
		<div role="alert" class="text-destructive px-4 py-2 text-center text-xs text-pretty">
			{ai.error}
		</div>
	{/if}

	<AiComposer bind:this={composerRef} {onSend} disabled={ai.inputBusy} />
</section>
