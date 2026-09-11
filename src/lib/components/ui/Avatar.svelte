<script lang="ts">
	import { getInitials } from '$lib/utils/format';

	let {
		name = '',
		src = '',
		size = 36
	}: { name?: string; src?: string; size?: number } = $props();
</script>

{#if src}
	<img
		{src}
		alt={name}
		class="shrink-0 rounded-full object-cover"
		style="width:{size}px;height:{size}px"
	/>
{:else}
	<span
		class="inline-flex shrink-0 items-center justify-center rounded-full bg-cyan-soft font-medium text-navy"
		style="width:{size}px;height:{size}px;font-size:{Math.round(size / 2.8)}px"
	>
		{getInitials(name)}
	</span>
{/if}
