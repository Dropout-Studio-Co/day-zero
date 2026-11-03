<!--
	Brand lockup — shown on the login screen and as the home hero. Matches the
	sibling tools (order-processor, invoice-generator): a domain emoji over a
	semibold wordmark and a short tagline, centered. Dark-only, monochrome.
-->
<script lang="ts">
	import { Heading, cn, helperBase } from "#lib/ds/index.js";
</script>

<div class="flex flex-col items-center gap-4 text-center sm:gap-6">
	<p class="text-4xl sm:text-5xl">⏳</p>

	<div class="flex flex-col items-center gap-1.5 sm:gap-2">
		<Heading as="h1" size="title-lg" weight={600} class="text-center text-balance">Day Zero</Heading>
		<p class={cn(helperBase, "text-center")}>Count down to what actually matters.</p>
	</div>
</div>
