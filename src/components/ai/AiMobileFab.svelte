<!--
	Mobile-only (<lg) floating button that opens the Copilot sheet. Hidden while the sheet is
	already open.
-->
<script lang="ts">
	import { ai } from "#lib/stores/ai.svelte.js";
	import AiLauncherIcon from "./AiLauncherIcon.svelte";

	const hidden = $derived(ai.mobileOpen);
</script>

{#if !hidden}
	<div class="fixed right-5 bottom-5 z-40 lg:hidden">
		<span class="chat-btn-ripple-ring" style="animation-delay: 0s" aria-hidden="true"></span>
		<span class="chat-btn-ripple-ring" style="animation-delay: 1.5s" aria-hidden="true"></span>
		<button
			type="button"
			onclick={() => ai.setMobileOpen(true)}
			class="group border-chat-border bg-chat-surface hover:border-chat-text-muted hover:bg-chat-surface-hover relative z-10 flex size-14 touch-manipulation items-center justify-center rounded-full border border-solid shadow-[var(--chat-shadow)] transition-all duration-300 ease-out active:scale-95"
			aria-label="Open AI chat"
		>
			<AiLauncherIcon variant="grid" class="size-6" />
		</button>
	</div>
{/if}
