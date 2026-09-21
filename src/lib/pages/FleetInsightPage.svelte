<script lang="ts">
	import { onMount } from 'svelte';
	import { Truck, CheckCircle2, Wrench, XCircle } from 'lucide-svelte';
	import { truckStore, truckActions } from '$lib/stores/trucks';
	import { formatNumber } from '$lib/utils/format';
	import { asset } from '$lib/constants/assets';
	import { Card, EmptyState, PageHeader, Spinner, StatCard } from '$lib/components/ui';

	/**
	 * Fleet Insight.
	 *
	 * The old app read this from GET /fleet/insight, which the services do not
	 * serve. Everything here is therefore counted from the truck list itself —
	 * honest, and correct as far as it goes.
	 *
	 * What is deliberately absent: utilisation over time, distance travelled and
	 * idle hours. Those need trip history the frontend cannot compute, and
	 * inventing them from truck status would be a guess dressed as a metric.
	 */
	let { basePath, title = 'Fleet Insight' }: { basePath: string; title?: string } = $props();

	onMount(() => truckActions.getAll({ pageSize: 500 }));

	let trucks = $derived($truckStore.trucks);

	let counts = $derived.by(() => {
		const by: Record<string, number> = { active: 0, maintenance: 0, inactive: 0 };
		let available = 0;
		let paired = 0;
		for (const t of trucks as any[]) {
			const s = t.status ?? 'inactive';
			by[s] = (by[s] ?? 0) + 1;
			if (t.isAvailable) available += 1;
			// The register is /vehicles: one current driver, not the legacy driverIds list.
			if (t.currentDriverId || t.driverIds?.length) paired += 1;
		}
		return { by, available, paired, total: trucks.length };
	});

	let utilisation = $derived(
		counts.total === 0 ? 0 : Math.round(((counts.total - counts.available) / counts.total) * 100)
	);

	const BREAKDOWN = [
		{ key: 'active', label: 'Active', tone: 'bg-success', icon: CheckCircle2 },
		{ key: 'maintenance', label: 'Maintenance', tone: 'bg-warning', icon: Wrench },
		{ key: 'inactive', label: 'Inactive', tone: 'bg-danger', icon: XCircle }
	];
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Truck} />

	{#if $truckStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$truckStore.error}</p>
	{/if}

	{#if $truckStore.loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else if counts.total === 0}
		<Card><EmptyState message="No trucks registered" /></Card>
	{:else}
		<div class="flex flex-wrap gap-gutter">
			<div class="min-w-[170px] flex-1">
				<StatCard label="Total Truck" value={formatNumber(counts.total)} />
			</div>
			<div class="min-w-[170px] flex-1">
				<StatCard label="Active" value={formatNumber(counts.by.active)} accent="success" />
			</div>
			<div class="min-w-[170px] flex-1">
				<StatCard label="Available Now" value={formatNumber(counts.available)} accent="cyan" />
			</div>
			<div class="min-w-[170px] flex-1">
				<StatCard
					label="In Use"
					value={`${utilisation}%`}
					hint="Registered trucks not currently marked available"
				/>
			</div>
			<div class="min-w-[170px] flex-1">
				<StatCard label="Driver Paired" value={`${counts.paired} / ${counts.total}`} />
			</div>
		</div>

		<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
			<Card title="Fleet by Status">
				<ul class="space-y-4">
					{#each BREAKDOWN as row}
						{@const Icon = row.icon}
						{@const value = counts.by[row.key] ?? 0}
						{@const pct = counts.total === 0 ? 0 : Math.round((value / counts.total) * 100)}
						<li class="flex items-center justify-between gap-4">
							<span class="flex items-center gap-2 text-xs text-muted">
								<Icon size={14} />
								{row.label}
							</span>
							<div class="flex items-center gap-3">
								<div class="h-2 w-40 overflow-hidden rounded-full bg-canvas">
									<div class="h-full rounded-full {row.tone}" style="width:{pct}%"></div>
								</div>
								<span class="w-16 text-right text-xs text-muted">{value} · {pct}%</span>
							</div>
						</li>
					{/each}
				</ul>
			</Card>

			<Card title="Fleet">
				<ul class="scroll-cyan max-h-[320px] space-y-2 overflow-y-auto pr-1">
					{#each trucks as truck}
						<li>
							<a
								href="{basePath}/truck-list"
								class="flex items-center gap-3 rounded-nav border border-line-card p-3 hover:border-cyan"
							>
								<img
									src={asset(truck.isAvailable ? 'icon/truckIdle.png' : 'icon/truckOnduty.png')}
									alt=""
									width="12"
									height="27"
									class="shrink-0"
								/>
								<span class="text-xs font-medium text-ink">{truck.licensePlate ?? truck.policeNumber}</span>
								<span class="ml-auto text-xs text-muted">
									{truck.isAvailable ? 'Available' : 'In use'} · {truck.status}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			</Card>
		</div>

		<p class="text-xs italic text-muted">
			Utilisation over time, distance travelled and idle hours are not shown: they need trip history, which no
			service exposes yet.
		</p>
	{/if}
</div>
