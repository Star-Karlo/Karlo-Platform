<script lang="ts">
	import { onMount } from 'svelte';
	import { BarChart3 } from 'lucide-svelte';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { formatCurrency, formatDate, formatNumber } from '$lib/utils/format';
	import {
		Card,
		DataTable,
		EmptyState,
		PageHeader,
		PillTab,
		Spinner,
		StatusBadge,
		Tabs,
		type Column
	} from '$lib/components/ui';

	/**
	 * Report Order Reguler — the old app's Top 5 by sender / receiver, the status
	 * breakdown, and the order table under Active / History tabs.
	 *
	 * There is no reporting endpoint, so the rankings are counted here from the
	 * orders actually fetched. That is a real limitation, not a rounding one:
	 * with more orders than one page holds, this ranks the page, not the
	 * business. The sample size is printed so the number is never mistaken for a
	 * total.
	 */
	let { title = 'Report Order Reguler' }: { basePath?: string; title?: string } = $props();

	const SAMPLE = 200;

	let activeTab = $state('active');
	const TABS: { id: string; label: string; statuses: string[] }[] = [
		{ id: 'active', label: 'Active List', statuses: ['draft', 'submitted', 'approved', 'readyToPlan', 'assigned', 'inTransit', 'delivered'] },
		{ id: 'history', label: 'History List', statuses: ['completed', 'cancelled', 'rejected'] }
	];

	onMount(() => load());

	function load(page = 0) {
		const tab = TABS.find((t) => t.id === activeTab);
		orderActions.getAll({
			page,
			pageSize: SAMPLE,
			filtered: tab ? [{ id: 'statusCode', value: tab.statuses, type: 'in' }] : []
		});
	}

	let orders = $derived($orderStore.orders as any[]);

	function topFive(key: 'originWarehouseName' | 'destinationWarehouseName') {
		const counts = new Map<string, number>();
		for (const o of orders) {
			const name = o[key];
			if (!name) continue;
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
		const max = ranked[0]?.[1] ?? 1;
		return ranked.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }));
	}

	let bySender = $derived(topFive('originWarehouseName'));
	let byReceiver = $derived(topFive('destinationWarehouseName'));

	let byStatus = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const o of orders) {
			const label = o.statusAlias ?? o.statusCode ?? 'Unknown';
			counts.set(label, (counts.get(label) ?? 0) + 1);
		}
		const total = orders.length || 1;
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
	});

	const TONES = ['bg-cyan', 'bg-success', 'bg-warning', 'bg-legacy', 'bg-danger', 'bg-muted'];

	const columns: Column[] = [
		{ key: 'orderNumber', label: 'Order Number' },
		{ key: 'statusAlias', label: 'Status' },
		{ key: 'originWarehouseName', label: 'Sender' },
		{ key: 'destinationWarehouseName', label: 'Receiver' },
		{ key: 'truckPoliceNumber', label: 'Truck' },
		{ key: 'price', label: 'Amount', align: 'right', format: (row) => formatCurrency(Number(row.price ?? 0)) },
		{ key: 'pickupAt', label: 'Pickup', format: (row) => formatDate(row.pickupAt) }
	];
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={BarChart3} subtitle="Computed from {orders.length} orders in this tab" />

	{#if $orderStore.loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else}
		<div class="grid grid-cols-1 gap-gutter lg:grid-cols-3">
			<div class="space-y-gutter lg:col-span-2">
				{#each [{ t: 'Top 5 Order by Sender', rows: bySender }, { t: 'Top 5 Order by Receiver', rows: byReceiver }] as block}
					<Card title={block.t}>
						{#if block.rows.length === 0}
							<EmptyState message="Nothing to rank yet" />
						{:else}
							<ul class="space-y-3">
								{#each block.rows as row}
									<li class="flex items-center gap-3">
										<span class="w-44 shrink-0 truncate text-xs text-ink" title={row.name}>{row.name}</span>
										<div class="h-3 flex-1 overflow-hidden rounded-full bg-canvas">
											<div class="h-full rounded-full bg-cyan" style="width:{row.pct}%"></div>
										</div>
										<span class="w-10 text-right text-xs text-muted">{formatNumber(row.count)}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</Card>
				{/each}
			</div>

			<Card title="Order by Status">
				{#if byStatus.length === 0}
					<EmptyState message="No orders in this tab" />
				{:else}
					<ul class="space-y-3">
						{#each byStatus as row, i}
							<li class="flex items-center justify-between gap-3">
								<span class="flex min-w-0 items-center gap-2">
									<span class="h-2.5 w-2.5 shrink-0 rounded-full {TONES[i % TONES.length]}"></span>
									<span class="truncate text-xs text-muted">{row.label}</span>
								</span>
								<span class="shrink-0 text-xs text-ink">{formatNumber(row.count)} · {row.pct}%</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>
		</div>

		<Tabs
			tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
			{activeTab}
			onChange={(id) => {
				activeTab = id;
				load(0);
			}}
		>
			{#snippet actions()}
				<PillTab>Order Recap</PillTab>
			{/snippet}
		</Tabs>

		<DataTable
			{columns}
			data={orders}
			loading={$orderStore.loading}
			pageSize={SAMPLE}
			totalRows={$orderStore.totalRows}
			emptyMessage="No orders in this tab"
			onPageChange={(p) => load(p)}
		>
			{#snippet cell(row: any, column: Column, text: string)}
				{#if column.key === 'statusAlias'}
					<StatusBadge statusCode={row.statusCode ?? ''} label={row.statusAlias ?? ''} />
				{:else}
					{text}
				{/if}
			{/snippet}
		</DataTable>
	{/if}
</div>
