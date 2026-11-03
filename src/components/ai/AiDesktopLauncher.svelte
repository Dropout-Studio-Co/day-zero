<!--
	Desktop-only (lg+) floating launcher that opens the Copilot rail — the twin of AiMobileFab.
	Hidden while the rail is already open. Mobile (<lg) uses AiMobileFab + AiMobileSheet instead, so
	the two launchers never appear together.
-->
<script lang="ts">
	import { ai } from "#lib/stores/ai.svelte.js";
	import AiLauncherIcon from "./AiLauncherIcon.svelte";

	const hidden = $derived(ai.desktopOpen);
</script>

{#if !hidden}
	<div class="fixed right-5 bottom-5 z-40 hidden lg:block">
		<span class="chat-btn-ripple-ring" style="animation-delay: 0s" aria-hidden="true"></span>
		<span class="chat-btn-ripple-ring" style="animation-delay: 1.5s" aria-hidden="true"></span>
		<button
			type="button"
			onclick={() => ai.openDesktop()}
			class="group border-chat-border bg-chat-surface hover:border-chat-text-muted hover:bg-chat-surface-hover relative z-10 flex h-14 touch-manipulation items-center justify-center gap-2.5 rounded-full border border-solid pr-6 pl-5 shadow-[var(--chat-shadow)] transition-all duration-300 ease-out active:scale-95"
			aria-label="Open AI chat"
		>
			<AiLauncherIcon variant="grid" class="size-6" />
			<span class="text-chat-text-primary text-micro tracking-[0.18em] whitespace-nowrap uppercase">
				AI Assistant
			</span>
		</button>
	</div>
{/if}
