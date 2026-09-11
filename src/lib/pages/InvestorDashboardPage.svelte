<script lang="ts">
	import { onMount } from 'svelte';
	import { BarChart3 } from 'lucide-svelte';
	import { dashboardStore, dashboardActions } from '$lib/stores/invoice_notification_dashboard';
	import { formatNumber } from '$lib/utils/format';
	import { PageHeader, Spinner, StatCard } from '$lib/components/ui';

	let { title = 'Dashboard' }: { title?: string } = $props();

	onMount(() => dashboardActions.getSummary());

	let summary = $derived($dashboardStore.summary ?? {});

	let stats = $derived([
		{ label: 'Total Order', value: formatNumber(summary.total ?? 0) },
		{ label: 'Completed', value: formatNumber(summary.completed ?? 0), accent: 'success' as const },
		{ label: 'In Transit', value: formatNumber(summary.inTransit ?? 0), accent: 'cyan' as const },
		{ label: 'Cancelled', value: formatNumber(summary.cancelled ?? 0), accent: 'danger' as const }
	]);
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={BarChart3} />

	{#if $dashboardStore.loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else}
		<div class="flex flex-wrap gap-gutter">
			{#each stats as stat}
				<div class="min-w-[170px] flex-1">
					<StatCard label={stat.label} value={stat.value} accent={stat.accent ?? 'navy'} />
				</div>
			{/each}
		</div>
	{/if}
</div>
