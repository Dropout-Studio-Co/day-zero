<!--
	DS-native month calendar — the date picker at the heart of the composer.

	Built on the bits-ui Calendar primitive (the same engine shadcn-svelte's
	calendar wraps) but styled entirely from DS tokens so it carries the Dropout
	identity instead of a generic shadcn look: mono uppercase chrome, the ink
	ramp for hierarchy, and the ONE signal accent reserved for the selected day
	(filled pill, matching the DS `pillSelected` language). Replaces the native
	`<input type="date">`, whose popover can't be themed.

	`value` is an @internationalized/date DateValue (bindable). The composer maps
	it to/from an absolute UTC ISO instant on save.
-->
<script lang="ts">
	import { Calendar as CalendarPrimitive } from "bits-ui";
	import ChevronLeftIcon from "@lucide/svelte/icons/chevron-left";
	import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
	import { cn } from "#lib/ds/index.js";
	import type { DateValue } from "@internationalized/date";

	let {
		value = $bindable<DateValue | undefined>(undefined),
		placeholder = $bindable<DateValue | undefined>(undefined),
		minValue,
		class: className = ""
	}: {
		value?: DateValue;
		placeholder?: DateValue;
		minValue?: DateValue;
		class?: string;
	} = $props();

	// Ghost icon button shared by the prev/next month controls.
	const navBtn =
		"inline-flex size-8 pointer-coarse:size-11 items-center justify-center rounded-sm text-ink-muted transition-colors duration-200 ease-[var(--ease)] hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal disabled:pointer-events-none disabled:opacity-30 touch-manipulation";

	// One day cell. Hierarchy lives entirely in the ink ramp + the lone signal
	// accent: selected = filled signal pill; today = hairline ring; the rest is
	// quiet until hovered. Selectors read off bits-ui's data-* day attributes.
	const dayCell = cn(
		"relative flex aspect-square w-full max-w-(--cell) items-center justify-center rounded-sm  text-label text-foreground tabular-nums leading-none transition-colors duration-200 ease-[var(--ease)] select-none touch-manipulation",
		"not-data-selected:hover:bg-white/[0.06]",
		"[&[data-today]:not([data-selected])]:border [&[data-today]:not([data-selected])]:border-hair",
		"data-selected:bg-signal data-selected:font-semibold data-selected:text-background",
		"[&[data-outside-month]:not([data-selected])]:text-ink-muted [&[data-outside-month]:not([data-selected])]:opacity-40",
		"data-disabled:pointer-events-none data-disabled:opacity-25",
		"data-unavailable:text-ink-muted data-unavailable:line-through",
		"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
	);
</script>

<CalendarPrimitive.Root
	type="single"
	bind:value
	bind:placeholder
	{minValue}
	weekdayFormat="short"
	fixedWeeks
	locale="en-US"
	class={cn("border-hair rounded-sm border bg-white/[0.025] p-3 [--cell:2.5rem]", className)}
>
	{#snippet children({ months, weekdays })}
		{#each months as month (month.value)}
			<!-- Month chrome: prev · "Month Year" · next -->
			<div class="mb-1 flex items-center justify-between gap-2">
				<CalendarPrimitive.PrevButton class={navBtn} aria-label="Previous month">
					<ChevronLeftIcon class="size-4" />
				</CalendarPrimitive.PrevButton>
				<CalendarPrimitive.Heading class=" text-caption text-foreground tracking-[0.16em] uppercase" />
				<CalendarPrimitive.NextButton class={navBtn} aria-label="Next month">
					<ChevronRightIcon class="size-4" />
				</CalendarPrimitive.NextButton>
			</div>

			<CalendarPrimitive.Grid class="w-full border-collapse">
				<CalendarPrimitive.GridHead>
					<CalendarPrimitive.GridRow class="flex w-full">
						{#each weekdays as weekday (weekday)}
							<CalendarPrimitive.HeadCell
								class="text-micro text-ink-muted flex flex-1 items-center  justify-center pb-1 tracking-[0.14em] uppercase"
							>
								{weekday.slice(0, 2)}
							</CalendarPrimitive.HeadCell>
						{/each}
					</CalendarPrimitive.GridRow>
				</CalendarPrimitive.GridHead>
				<CalendarPrimitive.GridBody>
					{#each month.weeks as weekDates (weekDates)}
						<CalendarPrimitive.GridRow class="mt-0.5 flex w-full">
							{#each weekDates as date (date)}
								<CalendarPrimitive.Cell
									{date}
									month={month.value}
									class="relative flex min-w-0 flex-1 items-center justify-center p-0"
								>
									<CalendarPrimitive.Day class={dayCell} />
								</CalendarPrimitive.Cell>
							{/each}
						</CalendarPrimitive.GridRow>
					{/each}
				</CalendarPrimitive.GridBody>
			</CalendarPrimitive.Grid>
		{/each}
	{/snippet}
</CalendarPrimitive.Root>
