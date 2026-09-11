<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, Copy, Filter, Download, Upload, FileInput } from 'lucide-svelte';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { catalog, loadCatalogs } from '$lib/stores/catalog';
	import { formatDate, getInitials } from '$lib/utils/format';
	import { copyText } from '$lib/utils/clipboard';
	import { Button, FilterPanel, type FilterField } from '$lib/components/ui';

	/**
	 * The order list, shared by every role.
	 *
	 * Each role's route is a wrapper that supplies its own base path, so the
	 * warehouse's order list links to warehouse detail pages rather than the
	 * shipper's — which is what the five copied versions of this page all did
	 * wrong.
	 *
	 * Laid out as the console's Order Kontrak screen: a status tab per pipeline
	 * stage with its own count, then a wide scrolling table whose Kontrol
	 * column is frozen to the right so the row's actions stay reachable however
	 * far the table is scrolled.
	 */
	let {
		basePath,
		title = 'Orders — Order Kontrak',
		canCreate = false
	}: {
		/** URL prefix that owns this list, e.g. "/s/order". Detail links hang off it. */
		basePath: string;
		title?: string;
		canCreate?: boolean;
	} = $props();

	/**
	 * One tab per order status, in lifecycle order, plus an always-first Total.
	 *
	 * These are the business service's own codes — the same values its status
	 * machine writes — rather than display groupings, so a tab's count and the
	 * rows it shows can never disagree. The Indonesian label beside each comes
	 * from the row itself (`status`), which the service derives from the code;
	 * the labels here are only needed for tabs that currently match no rows.
	 */
	const STATUSES: { code: string; label: string }[] = [
		{ code: 'draft', label: 'Draft' },
		{ code: 'submitted', label: 'Menunggu Persetujuan' },
		{ code: 'approved', label: 'Disetujui' },
		{ code: 'readyToPlan', label: 'Siap Direncanakan' },
		{ code: 'assigned', label: 'Driver Ditugaskan' },
		{ code: 'inTransit', label: 'Dalam Perjalanan' },
		{ code: 'delivered', label: 'Terkirim' },
		{ code: 'completed', label: 'Selesai' },
		{ code: 'cancelRequested', label: 'Permintaan Pembatalan' },
		{ code: 'cancelled', label: 'Order Dibatalkan' },
		{ code: 'rejected', label: 'Ditolak' }
	];

	/**
	 * Which pill each status wears. Waiting on somebody is amber, moving is
	 * blue, finished is green, stopped is red — so the column reads at a glance
	 * without anyone having to learn eleven separate words.
	 */
	const BADGE: Record<string, string> = {
		draft: 'badge',
		submitted: 'badge badge-wait',
		approved: 'badge badge-planner',
		readyToPlan: 'badge badge-wait',
		assigned: 'badge badge-planner',
		inTransit: 'badge badge-planner',
		delivered: 'badge badge-active',
		completed: 'badge badge-active',
		cancelRequested: 'badge badge-wait',
		cancelled: 'badge badge-fail',
		rejected: 'badge badge-fail'
	};

	let activeTab = $state('total');
	/** The Filter panel is collapsed until asked for — it is eight controls. */
	let showFilters = $state(false);
	let pageSize = $state(20);
	/** Extra filters from the Filter panel, kept so paging does not drop them. */
	let extra = $state<any[]>([]);
	/** Shown under the toolbar after a copy, since a copy is otherwise silent. */
	let notice = $state('');

	const FILTERS: FilterField[] = [
		{ group: 'Order', id: 'orderNumber', label: 'ID Order' },
		{ group: 'Order', id: 'referenceNumber', label: 'Reference Number' },
		{ group: 'Order', id: 'orderKind', label: 'Kind' },
		// Two controls over one column, so each needs its own form key.
		{ group: 'Created Date', id: 'createdAt', key: 'createdFrom', label: 'From', type: 'date', op: 'gte' },
		{ group: 'Created Date', id: 'createdAt', key: 'createdTo', label: 'To', type: 'date', op: 'lte' },
		{ group: 'Jadwal Muat', id: 'pickupAt', key: 'pickupFrom', label: 'From', type: 'date', op: 'gte' },
		{ group: 'Jadwal Muat', id: 'pickupAt', key: 'pickupTo', label: 'To', type: 'date', op: 'lte' }
	];

	/**
	 * Per-tab counts, from the summary endpoint.
	 *
	 * One call for every tab rather than one call per tab: the service already
	 * aggregates by status, and eleven filtered list requests to render eleven
	 * numbers would many times over the load of opening this page.
	 *
	 * Counts are not fatal. A tab strip without them is still navigable, so a
	 * failure leaves the labels bare rather than blocking the list.
	 */
	let counts = $state<Record<string, number>>({});

	async function loadCounts() {
		try {
			const summary = (await orderActions.summary()) ?? {};
			const next: Record<string, number> = {};
			let total = 0;
			for (const { code } of STATUSES) {
				next[code] = summary[code] ?? 0;
				total += summary[code] ?? 0;
			}
			next.total = total;
			counts = next;
		} catch {
			counts = {};
		}
	}

	onMount(() => {
		load();
		void loadCounts();
		// Klien and Muatan are ids on the order; both columns are blank without
		// the names behind them, and neither is worth a request per row.
		void customerActions.getAll({ pageSize: 200 });
		void loadCatalogs(['cargoType', 'itemType']);
	});

	function load(page = 0) {
		const tabFilter =
			activeTab === 'total' ? [] : [{ id: 'statusCode', value: [activeTab], type: 'in' }];
		orderActions.getAll({ page, pageSize, filtered: [...tabFilter, ...extra] });
	}

	function selectTab(code: string) {
		activeTab = code;
		load(0);
	}

	function openOrder(row: any) {
		goto(`${basePath}/${row.id}`);
	}

	async function copyOrderNumber(row: any) {
		const ok = await copyText(row.orderNumber ?? '');
		notice = ok
			? `ID Order disalin: ${row.orderNumber}`
			: 'Gagal menyalin otomatis. Silakan salin manual.';
	}

	/** The customer's own name, or the raw id when it has not loaded. */
	function klien(row: any): string {
		const found = $customerStore.customers.find((c: any) => c.id === row.customerId);
		return found?.name ?? row.customerName ?? '';
	}

	/** What is being carried — the item if the order names one, else its category. */
	function muatan(row: any): string {
		const item = $catalog.itemType?.find((e: any) => e.id === row.itemTypeId);
		if (item) return item.name;
		const cargo = $catalog.cargoType?.find((e: any) => e.id === row.cargoTypeId);
		return cargo?.name ?? '-';
	}

	function rute(row: any): string {
		const from = row.originWarehouseName;
		const to = row.destinationWarehouseName;
		if (!from && !to) return '---';
		return `${from || '?'} — ${to || '?'}`;
	}

	let rows = $derived($orderStore.orders ?? []);
	/** Row numbers continue across pages, so row 21 is the 21st order, not the 1st. */
	let firstRowNumber = $derived(($orderStore.page ?? 0) * pageSize + 1);
	let lastPage = $derived(Math.max(0, Math.ceil(($orderStore.totalRows ?? 0) / pageSize) - 1));
</script>

<div class="page-head">
	<div><h1>{title}</h1></div>
	{#if canCreate}
		<a class="btn btn-primary" href="{basePath}/create">
			<FileInput size={15} /> Input Order
		</a>
	{/if}
</div>

{#if $orderStore.error}
	<div class="note-banner note-banner-error" role="alert">
		<span>⛔</span><div>{$orderStore.error}</div>
	</div>
{/if}

<div class="order-toolbar">
	<div class="order-tabs-row">
		<button
			type="button"
			class="order-tab {activeTab === 'total' ? 'active' : ''}"
			onclick={() => selectTab('total')}
		>
			Total{counts.total === undefined ? '' : ` (${counts.total})`}
		</button>
		{#each STATUSES as s}
			<!-- A stage nobody is at is still shown, at zero: a tab that appears
			     and disappears as orders move is a tab people stop trusting. -->
			<button
				type="button"
				class="order-tab {activeTab === s.code ? 'active' : ''}"
				onclick={() => selectTab(s.code)}
			>
				{s.label}{counts[s.code] === undefined ? '' : ` (${counts[s.code]})`}
			</button>
		{/each}
	</div>
	<div class="order-toolbar-actions">
		<button type="button" class="btn btn-outline btn-sm" onclick={() => (showFilters = !showFilters)}>
			<Filter size={14} /> Filter
		</button>
		<button type="button" class="btn btn-outline btn-sm" disabled title="Belum tersedia">
			<Download size={14} /> Import
		</button>
		<button type="button" class="btn btn-outline btn-sm" disabled title="Belum tersedia">
			<Upload size={14} /> Export
		</button>
	</div>
</div>

{#if showFilters}
	<div style="margin-bottom:18px;">
		<FilterPanel
			fields={FILTERS}
			onSearch={(f) => {
				extra = f;
				load(0);
			}}
			onReset={() => {
				extra = [];
				load(0);
			}}
		/>
	</div>
{/if}

{#if notice}
	<div class="note-banner" role="status" style="margin-top:0;">
		<span>📋</span><div>{notice}</div>
	</div>
{/if}

{#if !$orderStore.loading && rows.length === 0 && activeTab === 'total' && extra.length === 0}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">📄</div>
			Belum ada Order Kontrak.
			{#if canCreate}
				<br />
				<a class="btn btn-primary" style="margin-top:14px;" href="{basePath}/create">
					+ Input Order
				</a>
			{/if}
		</div>
	</div>
{:else}
	<!-- Kontrol lives in its own table pinned beside the scrolling one, so a
	     row's actions stay put however far right the data is scrolled. Both
	     tables render the same rows in the same order, which is what keeps the
	     two halves of a row aligned. -->
	<div class="spot-order-wrap">
		<div class="spot-order-scroll">
			<table class="spot-order-table">
				<colgroup>
					<col style="width:4.49%" />
					<col style="width:12.84%" />
					<col style="width:12.84%" />
					<col style="width:20.87%" />
					<col style="width:20.06%" />
					<col style="width:13.64%" />
					<col style="width:15.25%" />
				</colgroup>
				<thead>
					<tr>
						<th>No</th>
						<th>Jadwal Muat</th>
						<th>ID Order</th>
						<th>Rute</th>
						<th>Klien</th>
						<th>Muatan</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#if $orderStore.loading}
						<tr><td colspan="7"><div class="empty">Memuat…</div></td></tr>
					{:else if rows.length === 0}
						<tr>
							<td colspan="7">
								<div class="empty"><div class="eic">📄</div>Tidak ada order pada tab ini.</div>
							</td>
						</tr>
					{:else}
						{#each rows as o, i}
							<tr>
								<td>{firstRowNumber + i}</td>
								<td>{o.pickupAt ? formatDate(o.pickupAt, 'datetime') : '-'}</td>
								<td class="mono" style="font-weight:700;">{o.orderNumber}</td>
								<td title={rute(o)}>{rute(o)}</td>
								<td>
									{#if klien(o)}
										<div class="shipper-cell">
											<div class="shipper-avatar">{getInitials(klien(o))}</div>
											<span class="shipper-name">{klien(o)}</span>
										</div>
									{:else}
										-
									{/if}
								</td>
								<td>{muatan(o)}</td>
								<td>
									<span class={BADGE[o.statusCode ?? ''] ?? 'badge badge-wait'}>
										{o.status || o.statusAlias || o.statusCode}
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>

		<table class="spot-order-table spot-order-table-frozen">
			<colgroup><col style="width:96px" /></colgroup>
			<thead><tr><th>Kontrol</th></tr></thead>
			<tbody>
				{#if $orderStore.loading || rows.length === 0}
					<tr><td></td></tr>
				{:else}
					{#each rows as o}
						<tr>
							<td>
								<div class="action-cell">
									<button
										type="button"
										class="frozen-icon-btn"
										title="Lihat detail"
										aria-label="Lihat detail {o.orderNumber}"
										onclick={() => openOrder(o)}
									>
										<Search size={14} />
									</button>
									<button
										type="button"
										class="frozen-icon-btn"
										title="Salin ID Order"
										aria-label="Salin ID Order {o.orderNumber}"
										onclick={() => copyOrderNumber(o)}
									>
										<Copy size={14} />
									</button>
								</div>
							</td>
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	{#if lastPage > 0}
		<div class="table-footer-bar" style="display:flex; align-items:center; justify-content:center; gap:14px;">
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={($orderStore.page ?? 0) <= 0}
				onclick={() => load(($orderStore.page ?? 0) - 1)}
			>
				← Sebelumnya
			</button>
			<span>Halaman {($orderStore.page ?? 0) + 1} dari {lastPage + 1}</span>
			<button
				type="button"
				class="btn btn-outline btn-sm"
				disabled={($orderStore.page ?? 0) >= lastPage}
				onclick={() => load(($orderStore.page ?? 0) + 1)}
			>
				Selanjutnya →
			</button>
		</div>
	{:else}
		<div class="table-footer-bar">Semua data sudah dimuat</div>
	{/if}
{/if}
