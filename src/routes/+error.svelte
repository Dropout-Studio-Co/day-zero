<!--
	SvelteKit error boundary page. Rendered for any uncaught load/render error or
	thrown `error(status, ...)`. Shows `page.status` and `page.error.message`
	(set by `handleError` in src/hooks.{server,client}.ts) with a link home.
-->
<script lang="ts">
	import { page } from "$app/state";
	import { resolve } from "$app/paths";
	import { Card, CardContent, CardHeader, CardTitle } from "#lib/components/ui/card/index.js";
	import { ArrowLeft, TriangleAlert } from "@lucide/svelte";
</script>

<main
	id="main"
	tabindex="-1"
	class="bg-background text-foreground flex min-h-dvh items-center justify-center px-4 outline-none"
>
	<Card class="w-full max-w-md">
		<CardHeader class="items-center text-center">
			<div class="bg-destructive/10 text-destructive flex size-10 items-center justify-center rounded-lg">
				<TriangleAlert size={18} aria-hidden="true" />
			</div>
			<CardTitle class="text-base font-semibold text-balance">{page.status}</CardTitle>
		</CardHeader>
		<CardContent class="space-y-5 text-center">
			<p class="text-muted-foreground text-sm text-pretty">
				{page.error?.message ?? "Something went wrong."}
			</p>
			<a
				href={resolve("/")}
				class="border-border hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-9 touch-manipulation items-center justify-center gap-2 rounded-xl border bg-transparent px-4 text-sm font-medium whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-3 active:translate-y-px active:scale-[0.97]"
			>
				<ArrowLeft size={14} aria-hidden="true" />
				Back to the board
			</a>
		</CardContent>
	</Card>
</main>
