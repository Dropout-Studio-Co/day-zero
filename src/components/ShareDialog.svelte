<!--
	Share dialog. Looks the countdown up live from the store by id (so the share
	token appears the instant setShare resolves). Toggling the Switch mints/clears
	the public token via the API; when shared, the read-only /s/[token] URL is shown
	with a copy button. Restraint hierarchy: the toggle leads, the link is secondary.
-->
<script lang="ts">
	import { page } from "$app/state";
	import * as Dialog from "#lib/components/ui/dialog/index.js";
	import { Switch } from "#lib/components/ui/switch/index.js";
	import { cn, inputBase } from "#lib/ds/index.js";
	import { countdowns } from "#lib/stores/countdowns.svelte.js";
	import { Check, Copy } from "@lucide/svelte";

	let {
		open = $bindable(false),
		id = null
	}: {
		open?: boolean;
		id?: string | null;
	} = $props();

	const cd = $derived(id ? countdowns.getById(id) : undefined);
	const shared = $derived(!!cd?.shareToken);
	const url = $derived(cd?.shareToken ? `${page.url.origin}/s/${cd.shareToken}` : "");

	let busy = $state(false);
	let copied = $state(false);

	const toggle = async (enabled: boolean) => {
		if (!cd || busy) return;
		busy = true;
		try {
			await countdowns.setShare(cd.id, enabled);
		} finally {
			busy = false;
		}
	};

	const copy = async () => {
		if (!url) return;
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 1500);
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="gap-0 p-0 sm:max-w-md" showCloseButton={false}>
		<Dialog.Header class="border-hair border-b px-5 py-4">
			<Dialog.Title>
				<span class="text-lead font-sans lowercase">share countdown</span>
			</Dialog.Title>
			<Dialog.Description class="text-ink-muted text-caption text-pretty">
				Anyone with the link sees a read-only view — no sign-in, nothing else of yours.
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex flex-col gap-5 px-5 py-5">
			<label class="flex items-center justify-between gap-3">
				<span class="text-foreground text-micro tracking-[0.18em] uppercase">
					{shared ? "Sharing is on" : "Make it public"}
				</span>
				<Switch checked={shared} onCheckedChange={toggle} disabled={busy} />
			</label>

			{#if shared && url}
				<div class="flex items-center gap-2">
					<input readonly value={url} class={cn(inputBase, "flex-1 text-xs")} />
					<!-- size-[46px] + rounded-[11px] deliberately match the adjacent DS input surface (inputBase) -->
					<button
						type="button"
						onclick={copy}
						aria-label="Copy link"
						class="border-hair text-ink-muted hover:text-foreground flex size-[46px] shrink-0 touch-manipulation items-center justify-center rounded-[11px] border transition-colors hover:border-white/30"
					>
						{#if copied}
							<Check size={16} class="text-signal" />
						{:else}
							<Copy size={16} />
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
