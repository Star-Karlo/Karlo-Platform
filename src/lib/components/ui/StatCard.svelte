<script lang="ts">
	import { Info } from 'lucide-svelte';

	/** Insight KPI tile: min 170x100, 18px padding, 9px radius, label above value. */
	let {
		label,
		value,
		hint = '',
		accent = 'navy'
	}: {
		label: string;
		value: string | number;
		hint?: string;
		accent?: 'navy' | 'cyan' | 'success' | 'danger';
	} = $props();

	const ACCENT: Record<string, string> = {
		navy: 'text-navy',
		cyan: 'text-cyan',
		success: 'text-success',
		danger: 'text-danger'
	};
</script>

<div class="flex h-[100px] min-w-[170px] flex-col justify-between rounded-stat bg-surface p-[18px] shadow-card">
	<p class="flex items-center gap-1.5 text-sm font-medium text-navy-50">
		{label}
		{#if hint}
			<span title={hint} class="text-muted"><Info size={13} /></span>
		{/if}
	</p>
	<p class="text-xl font-semibold {ACCENT[accent]}">{value}</p>
</div>
