<script lang="ts">
	import { onMount } from 'svelte';
	import { Lightbulb } from 'lucide-svelte';
	import { dashboardStore, dashboardActions } from '$lib/stores/invoice_notification_dashboard';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { formatCurrency, formatDate, formatNumber } from '$lib/utils/format';
	import {
		Card,
		EmptyState,
		PageHeader,
		PillTab,
		SegmentedControl,
		Spinner,
		StatCard,
		StatusBadge
	} from '$lib/components/ui';

	let { basePath, title = 'Insight' }: { basePath: string; title?: string } = $props();

	let period = $state('month');

	onMount(() => reload());

	function reload() {
		dashboardActions.getSummary({ period });
		orderActions.getAll({ page: 0, pageSize: 5, sorted: [{ id: 'createdAt', desc: true }] });
	}

	/**
	 * The KPI strip.
	 *
	 * /orders/summary returns counts keyed by status, so each tile reads its own
	 * key rather than a precomputed field. A key the service does not send shows
	 * zero — never an invented figure.
	 */
	let summary = $derived($dashboardStore.summary ?? {});

	let stats = $derived([
		{ label: 'Order Draft', value: formatNumber(summary.draft ?? 0) },
		{ label: 'Submitted', value: formatNumber(summary.submitted ?? 0) },
		{ label: 'Ready to Plan', value: formatNumber(summary.readyToPlan ?? 0) },
		{ label: 'Assigned', value: formatNumber(summary.assigned ?? 0) },
		{ label: 'In Transit', value: formatNumber(summary.inTransit ?? 0), accent: 'cyan' as const },
		{ label: 'Delivered', value: formatNumber(summary.delivered ?? 0) },
		{ label: 'Completed', value: formatNumber(summary.completed ?? 0), accent: 'success' as const },
		{ label: 'Cancelled', value: formatNumber(summary.cancelled ?? 0), accent: 'danger' as const }
	]);

	/**
	 * Status breakdown, computed from the same counts.
	 *
	 * The previous version of this page drew a bar chart with the percentages
	 * hardcoded at 45/35/10, which looked like data and was not.
	 */
	let breakdown = $derived.by(() => {
		const rows = [
			{ label: 'Active', value: Number(summary.inTransit ?? 0) + Number(summary.assigned ?? 0), tone: 'bg-cyan' },
			{ label: 'Completed', value: Number(summary.completed ?? 0), tone: 'bg-success' },
			{ label: 'Cancelled', value: Number(summary.cancelled ?? 0), tone: 'bg-danger' }
		];
		const total = rows.reduce((sum, row) => sum + row.value, 0);
		return rows.map((row) => ({ ...row, pct: total === 0 ? 0 : Math.round((row.value / total) * 100) }));
	});
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Lightbulb} />

	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-4">
			<h2 class="text-lg font-semibold text-ink-heading">Monitoring</h2>
			<PillTab href="{basePath}/order">Order List</PillTab>
		</div>
		<SegmentedControl
			bind:value={period}
			options={[
				{ value: 'month', label: 'This Month' },
				{ value: 'today', label: "Today's Transaction" }
			]}
			onChange={reload}
		/>
	</div>

	{#if $dashboardStore.loading}
		<div class="flex justify-center py-10"><Spinner size={28} /></div>
	{:else}
		<div class="flex flex-wrap gap-gutter">
			{#each stats as stat}
				<div class="min-w-[170px] flex-1">
					<StatCard label={stat.label} value={stat.value} accent={stat.accent ?? 'navy'} />
				</div>
			{/each}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
		<Card title="Recent Orders">
			{#if $orderStore.loading}
				<div class="flex justify-center py-6"><Spinner /></div>
			{:else if $orderStore.orders.length === 0}
				<EmptyState message="No orders yet" />
			{:else}
				<ul class="divide-y divide-line-card">
					{#each $orderStore.orders.slice(0, 5) as order}
						<li class="flex items-center justify-between gap-4 py-3">
							<a href="{basePath}/order/{order.id}" class="min-w-0">
								<p class="truncate text-xs font-medium text-ink">{order.orderNumber}</p>
								<p class="text-xs text-muted">{formatDate(order.createdAt)}</p>
							</a>
							<div class="flex shrink-0 items-center gap-3">
								<StatusBadge statusCode={order.statusCode ?? ''} label={order.statusAlias ?? ''} />
								<span class="text-xs text-ink">{formatCurrency(Number(order.price ?? 0))}</span>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<Card title="Order Status Distribution">
			<ul class="space-y-4">
				{#each breakdown as row}
					<li class="flex items-center justify-between gap-4">
						<span class="text-xs text-muted">{row.label}</span>
						<div class="flex items-center gap-3">
							<div class="h-2 w-40 overflow-hidden rounded-full bg-canvas">
								<div class="h-full rounded-full {row.tone}" style="width:{row.pct}%"></div>
							</div>
							<span class="w-16 text-right text-xs text-muted">{formatNumber(row.value)} · {row.pct}%</span>
						</div>
					</li>
				{/each}
			</ul>
		</Card>
	</div>
</div>
