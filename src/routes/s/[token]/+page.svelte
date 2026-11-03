<!--
	Public read-only share view. Reuses the same CountdownDisplay as the board (one
	component, two contexts), full-bleed and centered. Dynamic OG/Twitter meta so the
	link previews with the title + remaining time. A secondary ↗ CTA invites the
	viewer to make their own. A "zen mode" control opens a distraction-free,
	full-screen view of just the date, title, and live countdown.
-->
<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";
	import { fade } from "svelte/transition";
	import { Maximize, Minimize } from "@lucide/svelte";
	import { clock } from "#lib/stores/clock.svelte.js";
	import { prefersReducedMotion } from "#lib/motion/index.js";
	import { Heading, Cta } from "#lib/ds/index.js";
	import { formatTargetDate, humanize } from "#lib/countdown/format.js";
	import CountdownDisplay from "$src/components/CountdownDisplay.svelte";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();
	const cd = $derived(data.countdown);

	const ogDescription = $derived(`${cd.title} — ${humanize(Date.parse(cd.targetAt), clock.now, cd.hasTime)}`);
	const ogTitle = $derived(`${cd.title} · Day Zero`);

	// Zen mode — a full-bleed, distraction-free view of just the date, title, and
	// live countdown. A native <dialog> in modal mode does the heavy lifting: it
	// renders in the top layer over the global footer, makes the rest of the page
	// inert, and handles Esc natively. The real Fullscreen API layers on true OS
	// immersion where granted, degrading silently to the modal alone (iOS Safari).
	let dialog = $state<HTMLDialogElement | null>(null);
	let zen = $state(false);

	const enterZen = async () => {
		dialog?.showModal();
		zen = true;
		try {
			await dialog?.requestFullscreen?.();
		} catch {
			// Element fullscreen denied/unsupported — the modal alone delivers zen.
		}
	};

	const exitZen = async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen?.();
		} catch {
			// no-op
		}
		dialog?.close();
	};

	// Native 'close' fires for both exitZen() and the Esc key — the single place we
	// flip the reactive flag back off.
	const onClose = () => (zen = false);

	// One Esc inside OS fullscreen exits fullscreen first; mirror that into the
	// dialog so a single keystroke leaves zen entirely.
	const syncFullscreen = () => {
		if (zen && !document.fullscreenElement) dialog?.close();
	};

	onMount(() => {
		document.addEventListener("fullscreenchange", syncFullscreen);
		return () => document.removeEventListener("fullscreenchange", syncFullscreen);
	});

	// Belt-and-braces scroll lock while the modal owns the screen.
	$effect(() => {
		if (!zen) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	});

	const zenFade = $derived(prefersReducedMotion.current ? { duration: 0 } : { duration: 320 });

	// One editorial pill for both the enter and exit affordances: hairline at rest,
	// signal border + foreground ink on hover.
	const controlClass =
		"group ease-[var(--ease)] text-ink-muted fixed top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-hair px-3.5 py-2  text-micro tracking-[0.2em] whitespace-nowrap uppercase transition-colors duration-300 hover:border-signal hover:text-foreground touch-manipulation sm:top-6 sm:right-6";
</script>

<svelte:head>
	<title>{ogTitle}</title>
	<meta name="description" content={ogDescription} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content={page.url.href} />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
</svelte:head>

<!--
	The date + title + countdown trio, rendered identically in the normal flow and
	the zen modal. Both CountdownDisplay instances read the one shared clock, so
	there's still a single ticking interval.
-->
{#snippet stack()}
	<div class="flex flex-col items-center gap-5 sm:gap-7">
		<div class="flex items-center gap-2.5">
			<span
				class="bg-signal size-[7px] shrink-0 rounded-full motion-safe:animate-[ctaPulse_2.8s_var(--ease)_infinite]"
				aria-hidden="true"
			></span>
			<p class="text-ink-muted text-micro tracking-[0.26em] uppercase">
				{formatTargetDate(cd.targetAt, cd.hasTime)}
			</p>
		</div>

		<Heading as="h1" size="title-lg" weight={600} class="max-w-2xl text-balance wrap-break-word lowercase">
			{cd.title}
		</Heading>

		<CountdownDisplay targetAt={cd.targetAt} hasTime={cd.hasTime} size="share" align="center" />
	</div>
{/snippet}

<main
	id="main"
	tabindex="-1"
	class="flex grow flex-col items-center justify-center gap-12 px-4 py-20 text-center outline-none sm:gap-16"
>
	{@render stack()}

	<div class="flex flex-col items-center gap-5">
		<Cta
			variant="secondary"
			href="/"
			class="border-signal bg-ink-2 hover:border-signal hover:bg-signal hover:text-background touch-manipulation hover:shadow-lg"
		>
			make your own
		</Cta>
		<p class="text-ink-muted text-micro tracking-[0.22em] uppercase">by dropout studio</p>
	</div>
</main>

{#if !zen}
	<button type="button" onclick={enterZen} aria-label="Enter zen mode — full-screen countdown" class={controlClass}>
		<Maximize class="size-3.5" aria-hidden="true" />
		<span>zen</span>
	</button>
{/if}

<dialog
	bind:this={dialog}
	onclose={onClose}
	aria-label="{cd.title} — zen mode"
	class="bg-background text-foreground backdrop:bg-background fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-none p-0"
>
	{#if zen}
		<div
			class="flex h-dvh w-full flex-col items-center justify-center gap-12 px-4 text-center sm:gap-16"
			transition:fade={zenFade}
		>
			{@render stack()}

			<button type="button" onclick={exitZen} aria-label="Exit zen mode" class={controlClass}>
				<Minimize class="size-3.5" aria-hidden="true" />
				<span>exit</span>
			</button>

			<p
				class="text-ink-muted/70 text-micro fixed bottom-6 left-1/2 -translate-x-1/2 tracking-[0.22em] uppercase"
			>
				esc to exit
			</p>
		</div>
	{/if}
</dialog>
