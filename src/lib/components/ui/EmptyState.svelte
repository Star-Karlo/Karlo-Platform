<script lang="ts">
	import { Inbox } from 'lucide-svelte';

	let {
		message = 'No data available',
		hint = '',
		children
	}: { message?: string; hint?: string; children?: any } = $props();
</script>

<div class="flex flex-col items-center justify-center gap-2 py-10 text-center">
	<Inbox size={28} class="text-line-input" />
	<p class="text-sm text-muted">{message}</p>
	{#if hint}
		<p class="text-xs text-muted-dim">{hint}</p>
	{/if}
	{@render children?.()}
</div>
