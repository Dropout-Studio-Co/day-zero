<!--
	A single countdown in the grid. Hairline surface, lowercase title, target-date
	eyebrow, the compact ticking display, and an at-rest action row (edit / share /
	delete) — visible without hover so it works on touch. Delete opens a confirmation
	dialog to prevent accidents. A past countdown dims and its display switches to the
	"reached" state automatically.
-->
<script lang="ts">
	import { clock } from "#lib/stores/clock.svelte.js";
	import { countdowns } from "#lib/stores/countdowns.svelte.js";
	import { remaining, formatTargetDate } from "#lib/countdown/format.js";
	import { cn } from "#lib/utils.js";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import CountdownDisplay from "./CountdownDisplay.svelte";
	import { Pencil, Share2, Trash2 } from "@lucide/svelte";
	import type { Countdown } from "#lib/types.js";

	let {
		countdown,
		onEdit,
		onShare,
		canShare = true
	}: {
		countdown: Countdown;
		onEdit: (c: Countdown) => void;
		onShare: (id: string) => void;
		/** Sharing needs a server token — hidden for logged-out (guest) boards. */
		canShare?: boolean;
	} = $props();

	const isPast = $derived(remaining(Date.parse(countdown.targetAt), clock.now, countdown.hasTime).isPast);

	let confirmOpen = $state(false);

	const confirmDelete = () => {
		confirmOpen = false;
		countdowns.remove(countdown.id);
	};

	const actionBtn =
		"text-ink-muted hover:text-foreground rounded-md p-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal touch-manipulation";
	const cancelBtn =
		"text-ink-muted hover:text-foreground rounded-full px-4 py-2  text-micro tracking-[0.14em] uppercase transition-colors touch-manipulation whitespace-nowrap";
	const deleteBtn =
		"bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-full px-4 py-2  text-micro tracking-[0.14em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive touch-manipulation whitespace-nowrap";
</script>

<div
	class={cn(
		"group border-hair relative flex flex-col gap-4 rounded-2xl border bg-white/[0.02] p-5 transition-[border-color,opacity] duration-[250ms] ease-[var(--ease)] hover:border-white/15",
		isPast && "opacity-65"
	)}
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="text-foreground text-lead truncate font-sans font-semibold lowercase" title={countdown.title}>
				{countdown.title}
			</h3>
			<p class="text-ink-muted text-micro mt-1 truncate tracking-[0.18em] uppercase">
				{formatTargetDate(countdown.targetAt, countdown.hasTime)}
			</p>
		</div>

		<div class="flex shrink-0 items-center gap-0.5">
			<button type="button" class={actionBtn} aria-label="Edit" onclick={() => onEdit(countdown)}>
				<Pencil size={15} aria-hidden="true" />
			</button>
			{#if canShare}
				<button
					type="button"
					class={cn(actionBtn, countdown.shareToken && "text-signal hover:text-signal")}
					aria-label={countdown.shareToken ? "Shared — manage link" : "Share"}
					onclick={() => onShare(countdown.id)}
				>
					<Share2 size={15} aria-hidden="true" />
				</button>
			{/if}
			<button type="button" class={actionBtn} aria-label="Delete" onclick={() => (confirmOpen = true)}>
				<Trash2 size={15} aria-hidden="true" />
			</button>
		</div>
	</div>

	<CountdownDisplay targetAt={countdown.targetAt} hasTime={countdown.hasTime} size="card" align="start" />
</div>

<Dialog.Root bind:open={confirmOpen}>
	<Dialog.Content class="gap-0 p-0 sm:max-w-sm" showCloseButton={false}>
		<Dialog.Header class="border-hair border-b px-5 py-4">
			<Dialog.Title>
				<span class="text-lead font-sans lowercase">delete countdown</span>
			</Dialog.Title>
			<Dialog.Description class="text-ink-muted text-caption text-pretty">
				Permanently delete “{countdown.title || "this countdown"}”? This can't be undone.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex items-center justify-end gap-2 px-5 py-4">
			<Dialog.Close class={cancelBtn}>Cancel</Dialog.Close>
			<button type="button" onclick={confirmDelete} class={deleteBtn}>Delete</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
