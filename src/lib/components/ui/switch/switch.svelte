<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80 border-foreground/10 data-[state=checked]:border-foreground/15 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 peer group/switch relative inline-flex shrink-0 items-center rounded-full border transition-all outline-none after:absolute after:-inset-x-2 after:-inset-y-3 focus-visible:ring-3 aria-invalid:ring-3 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-11 data-[size=sm]:h-[18px] data-[size=sm]:w-[34px]",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.35),0_0_0_0.5px_rgb(0_0_0/0.18)] ring-0 transition-transform group-data-[size=default]/switch:size-5 group-data-[size=sm]/switch:size-3.5 group-data-[size=default]/switch:data-[state=checked]:translate-x-[22px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[18px] group-data-[size=default]/switch:data-[state=unchecked]:translate-x-0 group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:translate-x-[calc(-100%)]"
	/>
</SwitchPrimitive.Root>
