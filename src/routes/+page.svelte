<!--
	Home — the board. The whole point of Day Zero: every goal as a live countdown,
	all visible at once. The soonest upcoming goal is promoted to a hero; the rest
	fill a responsive grid; reached goals collapse into a quieter section below.
	Differentiation is typographic (size/weight/position), never color.

	Seeds the countdowns store from server data ONCE inside untrack() — the single
	hydration site (do not add another).
-->
<script lang="ts">
	import { untrack, onMount } from "svelte";
	import { page } from "$app/state";
	import { countdowns } from "#lib/stores/countdowns.svelte.js";
	import { ai } from "#lib/stores/ai.svelte.js";
	import { cn } from "#lib/utils.js";
	import { reveal } from "#lib/motion/index.js";
	import { Cta } from "#lib/ds/index.js";
	import Heading from "#lib/components/ui/heading/heading.svelte";
	import Navbar from "$src/components/Navbar.svelte";
	import User from "$src/components/User.svelte";
	import SignInButton from "$src/components/SignInButton.svelte";
	import CountdownHero from "$src/components/CountdownHero.svelte";
	import CountdownCard from "$src/components/CountdownCard.svelte";
	import EmptyState from "$src/components/EmptyState.svelte";
	import CountdownComposerDialog from "$src/components/CountdownComposerDialog.svelte";
	import ShareDialog from "$src/components/ShareDialog.svelte";
	import type { Countdown, CountdownInput } from "#lib/types.js";
	import type { PageData } from "./$types";

	let { data }: { data: PageData } = $props();

	// INVARIANT: the ONLY server-data hydration site. Seeds from server data
	// without registering it as a reactive dependency of this render. For guests
	// the server board is empty; the real local board loads in onMount below
	// (localStorage is browser-only). `authed` routes writes to D1 vs local.
	untrack(() => {
		countdowns.hydrate({ countdowns: data.appState.countdowns }, { authed: !!data.user });
		ai.hydrate(data.ai);
	});

	// Browser-only persistence bridge: authed → import any prior guest board into
	// the account once; guest → re-seed the board from localStorage.
	onMount(() => {
		if (data.user) void countdowns.migrateGuestToServer();
		else countdowns.loadGuest();
	});

	// Sharing mints a server token, so it is a signed-in perk; hide the share
	// control for guests.
	const canShare = $derived(!!data.user);

	let composerOpen = $state(false);
	let editing = $state<Countdown | null>(null);
	let shareOpen = $state(false);
	let shareId = $state<string | null>(null);

	const openNew = () => {
		editing = null;
		composerOpen = true;
	};
	const openEdit = (c: Countdown) => {
		editing = c;
		composerOpen = true;
	};
	const openShare = (id: string) => {
		shareId = id;
		shareOpen = true;
	};
	const onSave = async (input: CountdownInput, id: string | null) => {
		if (id) countdowns.update(id, input);
		else await countdowns.add(input);
	};

	const isEmpty = $derived(countdowns.active.length === 0);
	const gridItems = $derived(countdowns.upcoming.slice(1)); // hero is upcoming[0]

	// Slide the board left when the copilot rail opens — same shift the profile row (Navbar) uses.
	const copilotOpen = $derived(ai.desktopOpen);
</script>

<Navbar>
	{#if page.data.user && page.data.currentUser}
		<User user={page.data.user} currentUser={page.data.currentUser} />
	{:else}
		<SignInButton />
	{/if}
</Navbar>

<main
	id="main"
	tabindex="-1"
	class={cn(
		"flex w-full grow flex-col px-[var(--content-x)] pt-10 pb-16 outline-none sm:pt-12 sm:pb-20",
		"transition-[padding] duration-300 ease-[var(--ease)] motion-reduce:transition-none",
		copilotOpen
			? "lg:pr-[calc(var(--copilot-rail-width)+1.5rem)] xl:pr-[calc(var(--copilot-rail-width-xl)+1.5rem)]"
			: "lg:pr-[var(--content-x)]"
	)}
>
	<div class="m-auto flex w-full flex-col gap-12 sm:gap-20">
		<div class="flex flex-col items-center gap-8" use:reveal>
			<Heading />
			{#if !isEmpty}
				<Cta variant="primary" arrow={false} dot onclick={openNew} class="touch-manipulation">new countdown</Cta
				>
			{/if}
		</div>

		{#if isEmpty}
			<EmptyState onNew={openNew} />
		{:else}
			{#if countdowns.hero}
				<section use:reveal={{ distance: "sm" }}>
					<CountdownHero countdown={countdowns.hero} onEdit={openEdit} onShare={openShare} {canShare} />
				</section>
			{/if}

			{#if gridItems.length}
				<section class="space-y-6" use:reveal={{ distance: "sm", onScroll: true }}>
					<div class="flex items-center gap-3">
						<span class="text-ink-muted text-micro tracking-[0.24em] uppercase">Upcoming</span>
						<span class="bg-hair h-px grow" aria-hidden="true"></span>
						<span class="text-ink-muted text-micro tabular-nums">{gridItems.length}</span>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each gridItems as c (c.id)}
							<CountdownCard countdown={c} onEdit={openEdit} onShare={openShare} {canShare} />
						{/each}
					</div>
				</section>
			{/if}

			{#if countdowns.past.length}
				<section class="space-y-6" use:reveal={{ distance: "sm", onScroll: true }}>
					<div class="flex items-center gap-3">
						<span class="text-ink-muted text-micro tracking-[0.24em] uppercase">Reached</span>
						<span class="bg-hair h-px grow" aria-hidden="true"></span>
						<span class="text-ink-muted text-micro tabular-nums">{countdowns.past.length}</span>
					</div>
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{#each countdowns.past as c (c.id)}
							<CountdownCard countdown={c} onEdit={openEdit} onShare={openShare} {canShare} />
						{/each}
					</div>
				</section>
			{/if}
		{/if}
	</div>
</main>

<CountdownComposerDialog bind:open={composerOpen} {editing} {onSave} />
<ShareDialog bind:open={shareOpen} id={shareId} />
