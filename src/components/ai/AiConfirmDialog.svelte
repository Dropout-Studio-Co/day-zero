<!--
	Globally-mounted modal that gates Tier-B (destructive / share-mutating) tool calls awaiting
	confirmation. Single pending call shows a diff + undo summary; multiple show a batch list where
	each item can be individually rejected. Each resolved call calls back into the executor's promise.
-->
<script lang="ts">
	import { tick } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { ai } from "#lib/stores/ai.svelte.js";
	import { respondToConfirmation, respondToAllConfirmations } from "#lib/ai/chat-client.js";
	import { motionDuration } from "#lib/motion/index.js";
	import { ShieldCheck, Undo2 } from "@lucide/svelte";
	import { toolLabel } from "#lib/ai/tool-labels.js";
	import { Switch } from "#lib/components/ui/switch/index.js";

	const first = $derived(ai.pendingConfirmations[0] ?? null);
	const isBatch = $derived(ai.pendingConfirmations.length > 1);

	// In batch mode, `rejected` holds toolCallIds to skip; on Apply, each call resolves true unless rejected.
	const rejected = $state(new Set<string>());

	const onApplyAll = () => {
		for (const req of [...ai.pendingConfirmations]) {
			req.resolve(!rejected.has(req.toolCallId));
		}
		rejected.clear();
	};

	const onCancelAll = () => {
		respondToAllConfirmations(false);
		rejected.clear();
	};

	const onToggleReject = (id: string) => {
		if (rejected.has(id)) rejected.delete(id);
		else rejected.add(id);
	};

	const onConfirm = () => {
		if (first) respondToConfirmation(first.toolCallId, true);
	};

	const onReject = () => {
		if (first) respondToConfirmation(first.toolCallId, false);
	};

	const focusOnMount = (node: HTMLElement) => {
		tick().then(() => node.focus());
	};

	const onKeydown = (event: KeyboardEvent) => {
		if (!first || event.key !== "Escape") return;
		event.preventDefault();
		if (isBatch) onCancelAll();
		else onReject();
	};
</script>

<svelte:window onkeydown={onKeydown} />

{#if first}
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby="ai-confirm-title"
		class="bg-scrim fixed inset-0 z-[60] flex items-center justify-center p-4 backdrop-blur-[var(--glass-blur-soft)]"
		transition:fade={{ duration: motionDuration("fast") }}
	>
		<div
			class="border-chat-border bg-chat-bg flex max-h-[85vh] w-[min(30rem,calc(100vw-2rem))] flex-col rounded-2xl border border-solid shadow-[var(--chat-shadow)]"
			transition:scale={{ duration: motionDuration("base"), start: 0.95, easing: cubicOut }}
		>
			<div class="border-chat-border flex items-center gap-2 border-b border-solid px-5 py-4">
				<ShieldCheck class="text-chat-text-primary size-4 shrink-0" aria-hidden="true" />
				<h2 id="ai-confirm-title" class="text-chat-text-primary text-sm font-medium text-balance">
					{isBatch ? `Confirm ${ai.pendingConfirmations.length} operations` : "Confirm this change"}
				</h2>
			</div>

			<div class="chat-scrollbar flex-1 space-y-3 overflow-y-auto px-5 py-4">
				{#if isBatch}
					<p class="text-chat-text-secondary text-sm text-pretty">
						Review the proposed changes below. Toggle reject on any item to skip it.
					</p>
					<ul
						class="border-chat-border-subtle max-h-72 space-y-2 overflow-y-auto rounded-lg border border-solid p-2"
					>
						{#each ai.pendingConfirmations as req (req.toolCallId)}
							<li
								class="border-chat-border-subtle bg-chat-surface rounded-md border border-solid p-2 text-xs"
							>
								<div class="flex items-start gap-3">
									<div class="flex flex-1 flex-col gap-1">
										<span
											class={rejected.has(req.toolCallId)
												? "text-chat-text-muted line-through"
												: "text-chat-text-primary"}
										>
											{req.humanLabel}
										</span>
										<span class="text-chat-text-muted text-micro tracking-[0.12em] uppercase">
											{toolLabel(req.toolName)}
										</span>
										<span class="text-chat-text-muted text-micro text-pretty">
											{req.inverseSummary}
										</span>
									</div>
									<div class="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
										<Switch
											size="sm"
											checked={rejected.has(req.toolCallId)}
											onCheckedChange={() => onToggleReject(req.toolCallId)}
											aria-label="Reject {req.humanLabel}"
											class="touch-manipulation"
										/>
										<span
											class="text-chat-text-muted text-micro tracking-[0.12em] uppercase select-none"
											aria-hidden="true"
										>
											Reject
										</span>
									</div>
								</div>
							</li>
						{/each}
					</ul>
					<p class="text-chat-text-muted text-xs text-pretty">
						{ai.pendingConfirmations.length - rejected.size} will run; {rejected.size} will be rejected.
					</p>
				{:else}
					<p class="text-chat-text-secondary text-sm text-pretty">{first.humanLabel}.</p>

					{#if first.diff.length > 0}
						<div
							class="border-chat-border-subtle bg-chat-surface space-y-2.5 rounded-lg border border-solid p-3"
						>
							{#each first.diff as row, i (i)}
								<div class="space-y-1">
									<div class="text-chat-text-muted text-micro tracking-[0.12em] uppercase">
										{row.label}
									</div>
									<div class="flex items-start gap-2 text-xs">
										<span class="text-destructive shrink-0 select-none">−</span>
										<span class="text-chat-text-muted min-w-0 break-words line-through">
											{row.current}
										</span>
									</div>
									<div class="flex items-start gap-2 text-xs">
										<span class="text-chat-text-primary shrink-0 select-none">+</span>
										<span class="text-chat-text-primary min-w-0 font-medium break-words">
											{row.proposed}
										</span>
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<p class="text-chat-text-muted text-caption flex items-start gap-1.5 text-pretty">
						<Undo2 class="mt-px size-3 shrink-0" aria-hidden="true" />
						<span>{first.inverseSummary}</span>
					</p>
				{/if}
			</div>

			<div class="border-chat-border flex items-center justify-end gap-2 border-t border-solid px-5 py-4">
				<button
					type="button"
					onclick={isBatch ? onCancelAll : onReject}
					use:focusOnMount
					class="border-hair bg-chat-surface text-chat-text-primary hover:border-signal hover:bg-ink-2 focus-visible:ring-signal text-caption inline-flex h-9 cursor-pointer touch-manipulation items-center rounded-full border px-5 tracking-[0.12em] whitespace-nowrap uppercase transition-colors ease-[var(--ease)] focus:outline-none focus-visible:ring-2"
				>
					{isBatch ? "Reject all" : "Reject"}
				</button>
				<button
					type="button"
					onclick={isBatch ? onApplyAll : onConfirm}
					class="bg-signal text-background hover:bg-signal/90 focus-visible:ring-signal text-caption inline-flex h-9 cursor-pointer touch-manipulation items-center rounded-full px-5 font-medium tracking-[0.12em] whitespace-nowrap uppercase transition-colors ease-[var(--ease)] focus:outline-none focus-visible:ring-2"
				>
					{isBatch ? "Apply selected" : "Confirm"}
				</button>
			</div>
		</div>
	</div>
{/if}
