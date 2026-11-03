<!--
	Status chip for one tool call (working / applied / rejected / failed / awaiting confirmation),
	with inline Undo for applied+reversible actions.
-->
<script lang="ts">
	import type { AiToolCall } from "#lib/stores/ai.svelte.js";
	import { triggerUndo } from "#lib/ai/chat-client.js";
	import { toolLabel } from "#lib/ai/tool-labels.js";
	import { CheckCircle2, CircleX, Loader2, ShieldAlert, Undo2 } from "@lucide/svelte";
	import { cn } from "#lib/utils.js";

	let { call }: { call: AiToolCall } = $props();

	const statusLabel = $derived.by(() => {
		switch (call.status) {
			case "applied":
				return call.undone ? "Undone" : "Applied";
			case "rejected":
				return "Rejected";
			case "failed":
				return "Failed";
			case "pending_confirmation":
				return "Awaiting confirmation";
			default:
				return "Working…";
		}
	});

	const statusClasses = $derived.by(() => {
		if (call.undone) return "border-chat-border-subtle bg-chat-surface text-chat-text-muted";
		switch (call.status) {
			case "applied":
				return "border-signal/40 bg-signal/10 text-chat-text-primary";
			case "rejected":
				return "border-chat-border-subtle bg-chat-surface text-chat-text-muted";
			case "failed":
				return "border-destructive/40 bg-destructive/10 text-destructive";
			case "pending_confirmation":
				return "border-chat-border bg-chat-surface text-chat-text-secondary";
			default:
				return "border-chat-border-subtle bg-chat-surface text-chat-text-secondary";
		}
	});

	const canUndo = $derived(call.status === "applied" && !call.undone && !!call.actionId);
	let undoing = $state(false);

	const onUndo = async () => {
		if (!call.actionId || undoing) return;
		undoing = true;
		await triggerUndo(call.actionId);
		undoing = false;
	};
</script>

<div class="chat-message-enter flex w-full flex-col gap-1.5">
	<div
		class={cn(
			"flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-solid px-2.5 py-2 text-xs",
			statusClasses
		)}
	>
		<span class="flex size-4 shrink-0 items-center justify-center">
			{#if call.status === "pending" || call.status === "pending_confirmation"}
				<Loader2 class="size-3.5 animate-spin" aria-hidden="true" />
			{:else if call.status === "applied" && !call.undone}
				<CheckCircle2 class="size-3.5" aria-hidden="true" />
			{:else if call.status === "failed"}
				<CircleX class="size-3.5" aria-hidden="true" />
			{:else}
				<ShieldAlert class="size-3.5" aria-hidden="true" />
			{/if}
		</span>
		<span class="font-medium break-words">{toolLabel(call.name)}</span>
		<span class="text-chat-text-muted text-micro tracking-[0.12em] uppercase tabular-nums">
			· {statusLabel}
		</span>
		{#if canUndo}
			<button
				type="button"
				onclick={onUndo}
				disabled={undoing}
				class={cn(
					"text-chat-text-secondary hover:text-chat-text-primary hover:bg-ink-2 border-hair bg-chat-bg text-micro ml-auto inline-flex touch-manipulation items-center gap-1 rounded-full border px-2.5 py-1  tracking-[0.1em] whitespace-nowrap uppercase transition-colors ease-[var(--ease)] disabled:cursor-not-allowed disabled:opacity-50",
					undoing && "cursor-wait"
				)}
			>
				<Undo2 class="size-3" aria-hidden="true" />
				Undo
			</button>
		{/if}
		{#if call.error}
			<span class="w-full break-words">{call.error}</span>
		{/if}
	</div>
</div>
