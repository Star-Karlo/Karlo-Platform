<script lang="ts">
	/**
	 * Truck Insight — port of Karlo-TMS-Revamp/src/views/InsightView.vue.
	 *
	 * Everything is counted from the fleet register (/vehicles) and the
	 * orders in flight, the same way Allocate and Control Tower derive a
	 * truck's status, so the numbers agree across the three pages. STNK / KIR
	 * validity is read off the register's own period fields. Maintenance is
	 * the register's `maintenance` status.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, CircleCheck, Wrench, CircleX, Info } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS, ORDER_STATUS } from '$lib/constants/endpoints';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import { truckDocuments, expiresWithinMonths, monthsFromToday } from '$lib/revamp/truckDocuments.js';

	let { basePath = '/t/fleet', title: _title = 'Truck Insight' }: { basePath?: string; title?: string } = $props();

	type Vehicle = {
		id: string;
		licensePlate: string;
		status?: string;
		currentDriverId?: string | null;
		attributes?: Record<string, any>;
	};
	let vehicles = $state<Vehicle[]>([]);
	let busyOrders = $state<any[]>([]);
	let loaded = $state(false);

	onMount(async () => {
		const [v, o] = await Promise.allSettled([
			api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
			api.get(ENDPOINTS.orders.list, {
				page: 0,
				pageSize: 200,
				filtered: JSON.stringify([{ id: 'statusCode', value: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_TRANSIT], type: 'in' }])
			})
		]);
		if (v.status === 'fulfilled') vehicles = v.value.data?.data ?? [];
		if (o.status === 'fulfilled') busyOrders = o.value.data?.data ?? [];
		loaded = true;
	});

	// Same taxonomy and colours as Allocate / Control Tower.
	const TRUCK_STATUS_LIST = [
		{ key: 'available', label: 'Available', color: '#146C2E' },
		{ key: 'planned', label: 'Planned', color: '#EAB308' },
		{ key: 'onduty', label: 'On Duty', color: '#0B57D0' },
		{ key: 'unavailable', label: 'Unavailable', color: '#B3261E' },
		{ key: 'unpaired', label: 'Unpaired', color: '#5B5F67' }
	] as const;
	type TruckStatus = (typeof TRUCK_STATUS_LIST)[number]['key'];
	const TRUCK_STATUS_META = Object.fromEntries(TRUCK_STATUS_LIST.map((s) => [s.key, s])) as Record<TruckStatus, (typeof TRUCK_STATUS_LIST)[number]>;
	const TRUCK_BODY_COLOR: Record<TruckStatus, string> = { available: '#4CAF32', planned: '#EAB308', onduty: '#2F6FDE', unavailable: '#C9463D', unpaired: '#8A8F98' };
	let statusSets = $derived.by(() => {
		const planned = new Set<string>();
		const onduty = new Set<string>();
		for (const o of busyOrders) {
			if (!o.truckId) continue;
			if (o.statusCode === ORDER_STATUS.IN_TRANSIT) onduty.add(o.truckId);
			else planned.add(o.truckId);
		}
		return { planned, onduty };
	});
	const isActive = (t: Vehicle) => (t.status ?? 'active') === 'active';
	function statusOf(t: Vehicle): TruckStatus {
		if (!isActive(t)) return 'unavailable';
		if (!t.currentDriverId) return 'unpaired';
		if (statusSets.onduty.has(t.id)) return 'onduty';
		if (statusSets.planned.has(t.id)) return 'planned';
		return 'available';
	}

	let total = $derived(vehicles.length);
	let activeCount = $derived(vehicles.filter(isActive).length);
	let maintenanceCount = $derived(vehicles.filter((t) => t.status === 'maintenance').length);
	let inactiveCount = $derived(total - activeCount - maintenanceCount);
	let availableNow = $derived(vehicles.filter((t) => statusOf(t) === 'available').length);
	let onDutyCount = $derived(vehicles.filter((t) => statusOf(t) === 'onduty').length);
	let inUsePercent = $derived(activeCount ? Math.round((onDutyCount / activeCount) * 100) : 0);
	let pairedCount = $derived(vehicles.filter((t) => t.currentDriverId).length);
	const percentOfTotal = (n: number) => (total ? Math.round((n / total) * 100) : 0);

	let statusRows = $derived(
		[
			{ key: 'active', label: 'Active', count: activeCount, color: '#146C2E' },
			{ key: 'maintenance', label: 'Maintenance', count: maintenanceCount, color: '#CA8A04' },
			{ key: 'inactive', label: 'Inactive', count: inactiveCount, color: '#B3261E' }
		].map((r) => ({ ...r, percent: percentOfTotal(r.count) }))
	);
	let orderStatusRows = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const t of vehicles) counts[statusOf(t)] = (counts[statusOf(t)] || 0) + 1;
		return TRUCK_STATUS_LIST.map((s) => ({ key: s.key, label: s.label, color: s.color, count: counts[s.key] || 0, percent: percentOfTotal(counts[s.key] || 0) }));
	});
	let activePhase = $state<string | null>(null);

	// STNK / KIR come from the register's attributes (free-text periods).
	function docSource(t: Vehicle) {
		const a = t.attributes ?? {};
		return { noStnk: a.noStnk, stnkFrom: a.stnkFrom, stnkTo: a.stnkTo ?? a.stnkExpiry, noKir: a.noKir, kirFrom: a.kirFrom, kirTo: a.kirTo ?? a.kirExpiry };
	}
	let allFleetRows = $derived(
		[...vehicles]
			.sort((a, b) => (a.licensePlate || '').localeCompare(b.licensePlate || ''))
			.map((t) => {
				const key = statusOf(t);
				return {
					id: t.id,
					plate: t.licensePlate,
					statusKey: key,
					docs: truckDocuments(docSource(t)),
					statusLabel: TRUCK_STATUS_META[key].label,
					bodyColor: TRUCK_BODY_COLOR[key],
					activeLabel: t.status === 'maintenance' ? 'maintenance' : isActive(t) ? 'active' : 'inactive'
				};
			})
	);

	const ACTIVE_FILTER_OPTIONS = [
		{ value: 'all', label: 'Semua Active Status' },
		{ value: 'active', label: 'Active' },
		{ value: 'maintenance', label: 'Maintenance' },
		{ value: 'inactive', label: 'Inactive' }
	];
	const TRUCK_STATUS_FILTER_OPTIONS = [{ value: 'all', label: 'Semua Truck Status' }, ...TRUCK_STATUS_LIST.map((s) => ({ value: s.key, label: s.label }))];
	let activeFilter = $state('all');
	let truckStatusFilter = $state('all');
	let fleetRows = $derived(
		allFleetRows.filter((f) => (activeFilter === 'all' || f.activeLabel === activeFilter) && (truckStatusFilter === 'all' || f.statusKey === truckStatusFilter))
	);

	// Fleet Document card.
	const DOC_TABS = [
		{ value: 'all', label: 'Semua' },
		{ value: 'valid', label: 'Aktif' },
		{ value: 'soon', label: 'Akan Expired' },
		{ value: 'stnk', label: 'STNK Expired' },
		{ value: 'kir', label: 'KIR Expired' },
		{ value: 'missing', label: 'Belum Lengkap' }
	];
	let docFilter = $state('all');
	const SOON_MONTHS_MIN = 1;
	const SOON_MONTHS_MAX = 12;
	let soonMonths = $state(3);
	function setSoonMonths(value: number | string) {
		const n = Math.round(Number(value));
		if (Number.isFinite(n)) soonMonths = Math.min(SOON_MONTHS_MAX, Math.max(SOON_MONTHS_MIN, n));
	}
	function docTest(kind: string, d: any): boolean {
		switch (kind) {
			case 'valid': return d.overall === 'valid';
			case 'stnk': return d.stnk.state === 'expired';
			case 'kir': return d.kir.state === 'expired';
			case 'missing': return d.overall === 'missing';
			case 'soon': return expiresWithinMonths(d.stnk, soonMonths) || expiresWithinMonths(d.kir, soonMonths);
			default: return true;
		}
	}
	let soonUntilLabel = $derived(monthsFromToday(soonMonths).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
	let docTabs = $derived(DOC_TABS.map((tab) => ({ ...tab, count: allFleetRows.filter((f) => docTest(tab.value, f.docs)).length })));
	let docRows = $derived(allFleetRows.filter((f) => docTest(docFilter, f.docs)));

	const DOC_STATES = [
		{ key: 'active', label: 'Aktif', color: '#146C2E' },
		{ key: 'expired', label: 'Expired', color: '#B3261E' },
		{ key: 'missing', label: 'Belum ada data', color: '#AEB4BF' }
	];
	let documentStatusRows = $derived(
		[{ key: 'stnk', label: 'STNK' }, { key: 'kir', label: 'KIR' }].map((d) => ({
			...d,
			states: DOC_STATES.map((st) => {
				const count = allFleetRows.filter((f) => (f.docs as any)[d.key].state === st.key).length;
				return { ...st, count, percent: percentOfTotal(count) };
			})
		}))
	);
	function docPeriodLabel(doc: { to: string; state: string }) {
		if (!doc.to) return 'Belum ada data';
		return doc.state === 'expired' ? `s/d ${doc.to} · Expired` : `s/d ${doc.to}`;
	}
	function viewTruck(id: string) {
		goto(`${basePath}/truck/${id}`);
	}
</script>

<svg width="0" height="0" style="position:absolute" aria-hidden="true">
	<defs>
		<linearGradient id="insight-truck-shade" x1="0" x2="1" y1="0" y2="0">
			<stop offset="0" stop-color="#000" stop-opacity=".3" />
			<stop offset=".45" stop-color="#fff" stop-opacity=".16" />
			<stop offset="1" stop-color="#000" stop-opacity=".32" />
		</linearGradient>
	</defs>
</svg>

<div class="insight-head"><div><h1>Truck Insight</h1></div></div>

<div class="insight-kpis">
	<div class="card insight-kpi"><div class="insight-kpi-label">Total Truck</div><div class="insight-kpi-value">{total}</div></div>
	<div class="card insight-kpi"><div class="insight-kpi-label">Active</div><div class="insight-kpi-value insight-kpi-value--green">{activeCount}</div></div>
	<div class="card insight-kpi"><div class="insight-kpi-label">Available Now</div><div class="insight-kpi-value insight-kpi-value--blue">{availableNow}</div></div>
	<div class="card insight-kpi">
		<div class="insight-kpi-label">In Use <span class="insight-info" title="Share of active trucks currently on an order in progress (status On Duty)"><Info size={13} /></span></div>
		<div class="insight-kpi-value">{inUsePercent}%</div>
	</div>
	<div class="card insight-kpi"><div class="insight-kpi-label">Driver Paired</div><div class="insight-kpi-value">{pairedCount} / {total}</div></div>
</div>

<div class="insight-panels">
	<section class="card insight-panel">
		<h2>Fleet by active Status</h2>
		{#each statusRows as r (r.key)}
			<div class="insight-status-row">
				<span class="insight-status-label">
					{#if r.key === 'active'}<CircleCheck size={16} />{:else if r.key === 'maintenance'}<Wrench size={16} />{:else}<CircleX size={16} />{/if}
					{r.label}
				</span>
				<span class="insight-bar"><span class="insight-bar-fill" style="width:{r.percent}%; background:{r.color}"></span></span>
				<span class="insight-status-count">{r.count} | {r.percent}%</span>
			</div>
		{/each}

		<div class="insight-subsection">
			<h2>Fleet by Order Status</h2>
			{#if total}
				<div class="insight-stack" role="img" aria-label={'Fleet by order status: ' + orderStatusRows.filter((r) => r.count > 0).map((r) => `${r.label} ${r.percent}%`).join(', ')}>
					{#each orderStatusRows.filter((x) => x.count > 0) as r (r.key)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span class="insight-stack-seg" class:is-dim={activePhase && activePhase !== r.key} style="flex-grow:{r.count}; background:{r.color}" title="{r.label}: {r.count} truck | {r.percent}%" onmouseenter={() => (activePhase = r.key)} onmouseleave={() => (activePhase = null)}></span>
					{/each}
				</div>
				<ul class="insight-legend">
					{#each orderStatusRows as r (r.key)}
						<li class:is-dim={activePhase && activePhase !== r.key} onmouseenter={() => (activePhase = r.key)} onmouseleave={() => (activePhase = null)}>
							<span class="insight-legend-swatch" style="background:{r.color}"></span>
							<span class="insight-legend-label">{r.label}</span>
							<span class="insight-legend-count">{r.count} | {r.percent}%</span>
						</li>
					{/each}
				</ul>
			{:else}
				<div class="insight-empty">{loaded ? 'Belum ada truck terdaftar.' : 'Memuat…'}</div>
			{/if}
		</div>
	</section>

	<section class="card insight-panel insight-panel--fill">
		<div class="insight-fill-inner">
			<div class="insight-fleet-head"><h2>Fleet</h2><span class="insight-fleet-count">{fleetRows.length} truck</span></div>
			<div class="insight-fleet-filters">
				<FieldSelect bind:value={activeFilter} options={ACTIVE_FILTER_OPTIONS} compact placeholder="Active Status" />
				<FieldSelect bind:value={truckStatusFilter} options={TRUCK_STATUS_FILTER_OPTIONS} compact placeholder="Truck Status" />
			</div>
			<div class="insight-fleet-list">
				{#each fleetRows as f (f.id)}
					<div class="insight-fleet-row">
						<svg class="insight-truck" viewBox="0 0 20 74" style="--truck:{f.bodyColor}" aria-hidden="true">
							<rect x="7.5" y="16" width="5" height="6" fill="#2b2b2b" />
							<rect x="1.2" y="55" width="3" height="11" rx="1.2" fill="#1c1c1c" />
							<rect x="15.8" y="55" width="3" height="11" rx="1.2" fill="#1c1c1c" />
							<rect x="3" y="21" width="14" height="49" rx="2.5" fill="var(--truck)" />
							<rect x="3" y="21" width="14" height="49" rx="2.5" fill="url(#insight-truck-shade)" />
							<rect x="3" y="64" width="14" height="6" rx="2" fill="#000" opacity=".2" />
							<rect x="1.2" y="9" width="3" height="7" rx="1.2" fill="#1c1c1c" />
							<rect x="15.8" y="9" width="3" height="7" rx="1.2" fill="#1c1c1c" />
							<rect x="0.4" y="4" width="2" height="3" rx=".8" fill="#1c1c1c" />
							<rect x="17.6" y="4" width="2" height="3" rx=".8" fill="#1c1c1c" />
							<rect x="3" y="1" width="14" height="17" rx="4.5" fill="var(--truck)" />
							<rect x="3" y="1" width="14" height="17" rx="4.5" fill="url(#insight-truck-shade)" />
							<rect x="5" y="3.5" width="10" height="5" rx="1.6" fill="#16221a" />
							<rect x="5.5" y="10.5" width="9" height="5" rx="2" fill="#fff" opacity=".18" />
						</svg>
						<div class="insight-fleet-main">
							<span class="insight-fleet-plate">{f.plate}</span>
							<span class="insight-fleet-status">{f.statusLabel} · {f.activeLabel}</span>
						</div>
						<div class="insight-docs">
							{#each [{ name: 'STNK', doc: f.docs.stnk }, { name: 'KIR', doc: f.docs.kir }] as d (d.name)}
								<div class="insight-doc">
									<span class="insight-doc-label">{d.name}</span>
									<div class="insight-doc-period is-{d.doc.state}"><span class="insight-doc-dot"></span><span class="insight-doc-text">{docPeriodLabel(d.doc)}</span></div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
				{#if !fleetRows.length}<div class="insight-empty">{allFleetRows.length ? 'Tidak ada truck yang cocok dengan filter.' : loaded ? 'Belum ada truck terdaftar.' : 'Memuat…'}</div>{/if}
			</div>
		</div>
	</section>
</div>

<section class="card insight-doc-card">
	<div class="insight-fleet-head"><h2>Fleet Document</h2><span class="insight-fleet-count">{docRows.length} truck</span></div>

	{#if total}
		<div class="insight-doc-charts">
			{#each documentStatusRows as d (d.key)}
				<div class="insight-doc-chart">
					<div class="insight-doc-chart-head">{d.label}</div>
					<div class="insight-stack" role="img" aria-label={d.label + ': ' + d.states.map((st) => `${st.label} ${st.percent}%`).join(', ')}>
						{#each d.states.filter((x) => x.count > 0) as st (st.key)}
							<span class="insight-stack-seg" style="flex-grow:{st.count}; background:{st.color}" title="{d.label} {st.label}: {st.count} truck | {st.percent}%"></span>
						{/each}
					</div>
					<ul class="insight-legend insight-legend--inline">
						{#each d.states as st (st.key)}
							<li><span class="insight-legend-swatch" style="background:{st.color}"></span><span class="insight-legend-label">{st.label}</span><span class="insight-legend-count">{st.count} | {st.percent}%</span></li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}

	<div class="method-tabs insight-doc-tabs">
		{#each docTabs as tab (tab.value)}
			<button type="button" class="method-tab" class:active={docFilter === tab.value} onclick={() => (docFilter = tab.value)}>{tab.label} ({tab.count})</button>
		{/each}
	</div>

	{#if docFilter === 'soon'}
		<div class="insight-soon-bar">
			<span>Akan expired dalam</span>
			<div class="insight-stepper">
				<button type="button" aria-label="Kurangi periode" disabled={soonMonths <= SOON_MONTHS_MIN} onclick={() => setSoonMonths(soonMonths - 1)}>−</button>
				<input type="number" inputmode="numeric" min={SOON_MONTHS_MIN} max={SOON_MONTHS_MAX} value={soonMonths} aria-label="Periode dalam bulan" onchange={(e) => { setSoonMonths((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).value = String(soonMonths); }} />
				<button type="button" aria-label="Tambah periode" disabled={soonMonths >= SOON_MONTHS_MAX} onclick={() => setSoonMonths(soonMonths + 1)}>+</button>
			</div>
			<span>bulan ke depan</span>
			<span class="insight-soon-until">(sampai {soonUntilLabel})</span>
		</div>
	{/if}

	<div class="insight-doc-table-head"><span>Truck</span><span>STNK</span><span>KIR</span><span class="insight-doc-actions">Aksi</span></div>
	<div class="insight-doc-table-body">
		{#each docRows as f (f.id)}
			<div class="insight-doc-row">
				<span class="insight-doc-plate">{f.plate}</span>
				<div class="insight-doc-period is-{f.docs.stnk.state}"><span class="insight-doc-dot"></span><span class="insight-doc-text">{docPeriodLabel(f.docs.stnk)}</span></div>
				<div class="insight-doc-period is-{f.docs.kir.state}"><span class="insight-doc-dot"></span><span class="insight-doc-text">{docPeriodLabel(f.docs.kir)}</span></div>
				<div class="insight-doc-actions"><button type="button" class="mini-icon-btn" title="Lihat detail truck" onclick={() => viewTruck(f.id)}><Search size={14} /></button></div>
			</div>
		{/each}
		{#if !docRows.length}<div class="insight-empty">{allFleetRows.length ? 'Tidak ada truck pada filter ini.' : loaded ? 'Belum ada truck terdaftar.' : 'Memuat…'}</div>{/if}
	</div>
</section>
