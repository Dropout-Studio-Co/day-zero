<!--
	Mobile-only (<lg) full-height bottom sheet hosting the bare AiSidebar. Implements a manual
	focus trap (Tab/Shift+Tab cycling, Escape to close) and restores focus to the FAB on close.
-->
<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import { tick } from "svelte";
	import { ai } from "$lib/stores/ai.svelte";
	import { X } from "@lucide/svelte";
	import AiSidebar from "./AiSidebar.svelte";

	let panel = $state<HTMLDivElement | null>(null);
	let wasOpen = false;

	const close = () => ai.setMobileOpen(false);

	const focusable = () =>
		panel
			? Array.from(
					panel.querySelectorAll<HTMLElement>(
						'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
					)
				).filter(el => el.offsetParent !== null)
			: [];

	const onKeydown = (event: KeyboardEvent) => {
		if (!ai.mobileOpen) return;
		if (event.key === "Escape") {
			close();
			return;
		}
		if (event.key !== "Tab") return;
		const items = focusable();
		const first = items[0];
		const last = items.at(-1);
		if (!first || !last) return;
		const active = document.activeElement;
		const outside = !panel?.contains(active);
		if (event.shiftKey && (active === first || outside)) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && (active === last || outside)) {
			event.preventDefault();
			first.focus();
		}
	};

	// Move focus into the sheet on open; restore it to the FAB on close (wasOpen avoids stealing focus on mount).
	$effect(() => {
		if (ai.mobileOpen) {
			wasOpen = true;
			void tick().then(() => focusable()[0]?.focus());
		} else if (wasOpen) {
			wasOpen = false;
			void tick().then(() => document.querySelector<HTMLElement>('[aria-label="Open AI chat"]')?.focus());
		}
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if ai.mobileOpen}
	<div class="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="AI chat">
		<button
			type="button"
			class="bg-scrim absolute inset-0 cursor-default touch-manipulation backdrop-blur-[var(--glass-blur-soft)]"
			aria-label="Close chat"
			onclick={close}
			transition:fade={{ duration: 200 }}
		></button>
		<div
			bind:this={panel}
			class="bg-chat-bg absolute inset-x-0 bottom-0 flex h-[100dvh] flex-col"
			transition:fly={{ y: 420, duration: 260, opacity: 1 }}
		>
			<button
				type="button"
				onclick={close}
				class="text-chat-icon-muted hover:text-chat-text-primary hover:bg-chat-surface-hover absolute top-3 right-3 z-10 inline-flex size-9 touch-manipulation items-center justify-center rounded-lg transition-colors"
				aria-label="Close chat"
			>
				<X class="size-5" aria-hidden="true" />
			</button>
			<AiSidebar bare />
		</div>
	</div>
{/if}
