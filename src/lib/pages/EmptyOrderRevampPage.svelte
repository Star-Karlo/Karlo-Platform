<script lang="ts">
	/**
	 * Orders — Empty Order list. Ported 1:1 from the prototype's
	 * EmptyOrderView.vue: the same fieldset filter bar, the same two-step
	 * Cari (typing narrows nothing until Search), Active/History tabs, and
	 * the same nine columns.
	 *
	 * An Empty Order is a truck trip with no cargo — repositioning, or
	 * deadheading back to base — recorded so the empty run is a costed fact
	 * rather than an untracked gap.
	 *
	 * NO BACKEND YET. The prototype keeps these in Firestore; this console
	 * has no empty-order table, model or endpoint. The page therefore asks
	 * for them, accepts "not there" as an empty list rather than an error,
	 * and says so plainly instead of showing a bare "no results" that reads
	 * as "none exist". When the API lands, the one call below is the only
	 * thing that changes.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import {
		emptyOrderStatusLabel,
		emptyOrderStatusBadgeClass,
		EMPTY_ORDER_STATUS_LIST,
		isEmptyOrderHistoryStatus
	} from '$lib/revamp/emptyOrderStatus';

	let { basePath = '/t' }: { basePath?: string } = $props();

	type EmptyOrder = {
		id: string;
		idEmptyOrder?: string;
		createdAt?: string | null;
		plate?: string;
		driver?: string;
		startKota?: string;
		destinations?: { nama?: string; kota?: string }[];
		distanceKm?: number | null;
		status?: string;
	};

	let items = $state<EmptyOrder[]>([]);
	let loaded = $state(false);
	/** True when the service has no empty-order endpoint at all, which is a
	 *  different thing from a company having none. */
	let unavailable = $state(false);

	onMount(async () => {
		try {
			const res = await api.get('/empty-orders', { page: 0, pageSize: 200 });
			items = Array.isArray(res.data?.data) ? res.data.data : [];
		} catch {
			items = [];
			unavailable = true;
		} finally {
			loaded = true;
		}
	});

	let activeTab = $state<'active' | 'history'>('active');
	let tabCounts = $derived.by(() => {
		const counts = { active: 0, history: 0 };
		for (const o of items) {
			if (isEmptyOrderHistoryStatus(o.status)) counts.history++;
			else counts.active++;
		}
		return counts;
	});
	let tabFilteredItems = $derived(
		items.filter((o) =>
			activeTab === 'history' ? isEmptyOrderHistoryStatus(o.status) : !isEmptyOrderHistoryStatus(o.status)
		)
	);

	/* ---------- Filter bar ----------
	   Draft (typed) against applied (what the table reads) is the same
	   two-step Cari every other list in this console uses: typing narrows
	   nothing until Search is pressed. Route and Truck options are built from
	   what the orders actually contain rather than a fixed master list, so a
	   choice here can never silently return no rows. */
	const STATUS_OPTIONS = EMPTY_ORDER_STATUS_LIST.map((s) => ({ value: s.key, label: s.label }));
	const blankFilter = () => ({
		orderNumber: '',
		status: '',
		routeFrom: '',
		routeTo: '',
		plate: '',
		dateFrom: '',
		dateTo: ''
	});
	let draft = $state(blankFilter());
	let applied = $state(blankFilter());
	let moreOpen = $state(false);

	const optionsOf = (values: (string | undefined)[]) =>
		[...new Set(values.filter(Boolean) as string[])].sort().map((v) => ({ value: v, label: v }));

	let routeFromOptions = $derived(optionsOf(items.map((o) => o.startKota)));
	let routeToOptions = $derived(optionsOf(items.flatMap((o) => (o.destinations ?? []).map((d) => d.kota))));
	let plateOptions = $derived(optionsOf(items.map((o) => o.plate)));

	function applyFilters() {
		applied = { ...draft };
	}
	function clearFilters() {
		draft = blankFilter();
		applied = blankFilter();
	}

	let rows = $derived.by(() => {
		const q = applied.orderNumber.trim().toLowerCase();
		return tabFilteredItems.filter((o) => {
			if (q && !(o.idEmptyOrder ?? '').toLowerCase().includes(q)) return false;
			if (applied.status && o.status !== applied.status) return false;
			if (applied.routeFrom && o.startKota !== applied.routeFrom) return false;
			if (applied.routeTo && !(o.destinations ?? []).some((d) => d.kota === applied.routeTo)) return false;
			if (applied.plate && o.plate !== applied.plate) return false;
			if (applied.dateFrom || applied.dateTo) {
				const created = o.createdAt ? new Date(o.createdAt) : null;
				if (!created || Number.isNaN(created.getTime())) return false;
				if (applied.dateFrom && created < new Date(`${applied.dateFrom}T00:00:00`)) return false;
				if (applied.dateTo && created > new Date(`${applied.dateTo}T23:59:59`)) return false;
			}
			return true;
		});
	});

	function destinationSummary(o: EmptyOrder) {
		const stops = (o.destinations ?? []).map((d) => d.nama || d.kota).filter(Boolean);
		return stops.length ? stops.join(' → ') : '-';
	}

	function viewOrder(o: EmptyOrder) {
		goto(`${basePath}/empty-order/${o.id}`);
	}
</script>

<div class="page-head">
	<div>
		<h1>Empty Order List</h1>
	</div>
</div>

<div class="card card-pad" style="margin-bottom:16px;">
	<div class="eo-filter-groups">
		<fieldset class="eo-filter-group">
			<legend>Empty Order</legend>
			<div class="eo-filter-group-row">
				<input
					type="text"
					bind:value={draft.orderNumber}
					placeholder="Empty Order Number"
					onkeydown={(e) => e.key === 'Enter' && applyFilters()}
				/>
				<FieldSelect bind:value={draft.status} options={STATUS_OPTIONS} placeholder="Status" searchable />
			</div>
		</fieldset>
		<fieldset class="eo-filter-group">
			<legend>Rute</legend>
			<div class="eo-filter-group-row">
				<FieldSelect
					bind:value={draft.routeFrom}
					options={routeFromOptions}
					placeholder="Type Route From"
					searchable
				/>
				<FieldSelect
					bind:value={draft.routeTo}
					options={routeToOptions}
					placeholder="Type Route To"
					searchable
				/>
			</div>
		</fieldset>
		<fieldset class="eo-filter-group">
			<legend>Truck</legend>
			<div class="eo-filter-group-row">
				<FieldSelect bind:value={draft.plate} options={plateOptions} placeholder="License Plate" searchable />
			</div>
		</fieldset>
	</div>

	{#if moreOpen}
		<div class="eo-filter-groups" style="margin-top:14px;">
			<fieldset class="eo-filter-group">
				<legend>Tanggal Dibuat</legend>
				<div class="eo-filter-group-row">
					<input type="date" bind:value={draft.dateFrom} />
					<input type="date" bind:value={draft.dateTo} />
				</div>
			</fieldset>
		</div>
	{/if}

	<div class="eo-filter-actions">
		<button type="button" class="btn btn-text btn-sm" onclick={() => (moreOpen = !moreOpen)}
			>{moreOpen ? 'Less' : 'More'}</button
		>
		<button type="button" class="btn btn-outline" onclick={clearFilters}>Clear</button>
		<button type="button" class="btn btn-primary" onclick={applyFilters}>Search</button>
	</div>
</div>

<div class="card card-pad">
	<div class="eo-list-head">
		<div class="method-tabs">
			<button
				type="button"
				class="method-tab"
				class:active={activeTab === 'active'}
				onclick={() => (activeTab = 'active')}>Active List ({tabCounts.active})</button
			>
			<button
				type="button"
				class="method-tab"
				class:active={activeTab === 'history'}
				onclick={() => (activeTab = 'history')}>History List ({tabCounts.history})</button
			>
		</div>
	</div>

	<div class="table-wrap">
		<table class="planner-table">
			<colgroup>
				<col style="width:5%" />
				<col style="width:13%" />
				<col style="width:12%" />
				<col style="width:10%" />
				<col style="width:11%" />
				<col style="width:19%" />
				<col style="width:8%" />
				<col style="width:14%" />
				<col style="width:8%" />
			</colgroup>
			<thead>
				<tr>
					<th>No</th>
					<th>Tanggal Dibuat</th>
					<th>ID Empty Order</th>
					<th>No Polisi</th>
					<th>Driver</th>
					<th>Rute</th>
					<th>Jarak</th>
					<th>Status</th>
					<th>Kontrol</th>
				</tr>
			</thead>
			<tbody>
				{#if !rows.length}
					<tr>
						<td colspan="9">
							<div class="empty">
								<div class="eic">🚚</div>
								{#if !loaded}
									Memuat…
								{:else if unavailable}
									<!-- Not the same as "none exist", and saying so saves
									     somebody looking for orders that were never stored. -->
									Empty Order belum tersedia di layanan ini — datanya belum dipindahkan dari prototype.
								{:else}
									Tidak ada Empty Order yang cocok.
								{/if}
							</div>
						</td>
					</tr>
				{/if}
				{#each rows as o, i (o.id)}
					<tr class="planner-row" onclick={() => viewOrder(o)}>
						<td>{i + 1}</td>
						<td>{o.createdAt ? formatTimestampLabel(new Date(o.createdAt)) : '-'}</td>
						<td class="mono" style="font-weight:700;">{o.idEmptyOrder ?? '-'}</td>
						<td class="mono">{o.plate ?? '-'}</td>
						<td>{o.driver || '-'}</td>
						<td>{o.startKota || '-'} &rarr; {destinationSummary(o)}</td>
						<td>{o.distanceKm != null ? `${o.distanceKm} Km` : '-'}</td>
						<td
							><span class="badge {emptyOrderStatusBadgeClass(o.status)}"
								>{emptyOrderStatusLabel(o.status)}</span
							></td
						>
						<td>
							<div class="action-cell">
								<button
									type="button"
									class="mini-icon-btn"
									title="Lihat detail"
									onclick={(e) => {
										e.stopPropagation();
										viewOrder(o);
									}}><Search size={14} /></button
								>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
