<script lang="ts">
	import { onMount } from 'svelte';
	import { MonitorDot } from 'lucide-svelte';
	import { dashboardStore, dashboardActions } from '$lib/stores/invoice_notification_dashboard';
	import { formatNumber } from '$lib/utils/format';
	import { PageHeader, SegmentedControl, Spinner, StatCard } from '$lib/components/ui';

	let { title = 'Monitoring' }: { title?: string } = $props();

	let period = $state('month');

	onMount(() => reload());

	function reload() {
		dashboardActions.getSummary({ period });
	}

	let summary = $derived($dashboardStore.summary ?? {});

	let stats = $derived([
		{ label: 'Draft', value: formatNumber(summary.draft ?? 0) },
		{ label: 'Submitted', value: formatNumber(summary.submitted ?? 0) },
		{ label: 'Ready to Plan', value: formatNumber(summary.readyToPlan ?? 0) },
		{ label: 'Assigned', value: formatNumber(summary.assigned ?? 0) },
		{ label: 'In Transit', value: formatNumber(summary.inTransit ?? 0), accent: 'cyan' as const },
		{ label: 'Delivered', value: formatNumber(summary.delivered ?? 0) },
		{ label: 'Completed', value: formatNumber(summary.completed ?? 0), accent: 'success' as const },
		{ label: 'Cancelled', value: formatNumber(summary.cancelled ?? 0), accent: 'danger' as const }
	]);
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={MonitorDot}>
		{#snippet actions()}
			<SegmentedControl
				bind:value={period}
				options={[
					{ value: 'month', label: 'This Month' },
					{ value: 'today', label: "Today's Transaction" }
				]}
				onChange={reload}
			/>
		{/snippet}
	</PageHeader>

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
