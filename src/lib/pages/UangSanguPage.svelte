<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Wallet } from 'lucide-svelte';
	import { allowanceActions, type AllowanceListRow } from '$lib/stores/allowance';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { formatCurrency, formatDate, getInitials } from '$lib/utils/format';

	/**
	 * Uang Sangu — the driver's advance, per order.
	 *
	 * A list of every dispatched order with its advance alongside, INCLUDING
	 * orders that have none yet. The screen's whole job is to show which trucks
	 * are about to leave without money; a list of only entered advances would
	 * hide exactly those rows. The amount itself is entered on the order's
	 * detail page, which this links to — one place to edit, not two.
	 */
	let { basePath }: { basePath: string } = $props();

	const TABS = [
		{ id: '', label: 'Semua' },
		{ id: 'none', label: 'Belum Diisi' },
		{ id: 'pending', label: 'Belum Finalisasi' },
		{ id: 'final', label: 'Final' }
	];

	let activeTab = $state('');
	let rows = $state<AllowanceListRow[]>([]);
	let totalRows = $state(0);
	let page = $state(0);
	let loading = $state(true);
	let error = $state('');
	const pageSize = 20;

	onMount(() => {
		void load();
		// Klien and Rute are ids on the row; both columns are blank without the
		// names behind them, and neither is worth a request per row.
		void customerActions.getAll({ pageSize: 200 });
		void warehouseActions.getAll({ pageSize: 200 });
	});

	async function load(p = 0) {
		loading = true;
		error = '';
		try {
			const res = await allowanceActions.list({ page: p, pageSize, state: activeTab });
			rows = res.rows;
			totalRows = res.totalRows;
			page = p;
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Uang sangu tidak dapat dimuat.';
		} finally {
			loading = false;
		}
	}

	function selectTab(id: string) {
		activeTab = id;
		void load(0);
	}

	function klien(r: AllowanceListRow): string {
		return ($customerStore.customers ?? []).find((c: any) => c.id === r.customerId)?.name ?? '—';
	}

	function warehouseName(id?: string): string {
		if (!id) return '?';
		return ($warehouseStore.warehouses ?? []).find((w: any) => w.id === id)?.name ?? '?';
	}

	/**
	 * The three states an advance can be in, read off the timestamps rather
	 * than a stored status — the timestamps are the fact, a status column
	 * would only be a copy of them that could disagree.
	 */
	function stateOf(r: AllowanceListRow): { label: string; badge: string } {
		if (r.finalisedAt) return { label: 'Final', badge: 'badge badge-active' };
		if (r.enteredAt) return { label: 'Belum Finalisasi', badge: 'badge badge-wait' };
		return { label: 'Belum Diisi', badge: 'badge badge-fail' };
	}

	let lastPage = $derived(Math.max(0, Math.ceil(totalRows / pageSize) - 1));
</script>

<div class="page-head">
	<div>
		<h1>Uang Sangu</h1>
		<p>Uang jalan pengemudi, per order. Nominal diisi dari halaman detail order.</p>
	</div>
</div>

{#if error}
	<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{error}</div></div>
{/if}

<div class="order-toolbar">
	<div class="order-tabs-row">
		{#each TABS as t (t.id)}
			<button
				type="button"
				class="order-tab {activeTab === t.id ? 'active' : ''}"
				onclick={() => selectTab(t.id)}
			>
				{t.label}
			</button>
		{/each}
	</div>
	<div class="order-toolbar-actions"><span class="hint">{totalRows} order</span></div>
</div>

{#if loading}
	<div class="card card-pad"><div class="empty">Memuat…</div></div>
{:else if rows.length === 0}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">💸</div>
			{activeTab
				? 'Tidak ada order pada tab ini.'
				: 'Belum ada order yang dijadwalkan. Uang sangu muncul begitu order siap direncanakan.'}
		</div>
	</div>
{:else}
	<div class="spot-order-wrap">
		<div class="spot-order-scroll">
			<table class="spot-order-table" style="min-width:1100px;">
				<colgroup>
					<col style="width:5%" /><col style="width:14%" /><col style="width:20%" />
					<col style="width:24%" /><col style="width:13%" /><col style="width:12%" /><col style="width:12%" />
				</colgroup>
				<thead>
					<tr>
						<th>No</th><th>ID Order</th><th>Klien</th><th>Rute</th>
						<th>Jadwal Muat</th><th>Subtotal Uang Sangu</th><th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as r, i (r.orderId)}
						{@const st = stateOf(r)}
						<tr>
							<td>{page * pageSize + i + 1}</td>
							<td class="mono" style="font-weight:700;">{r.orderNumber}</td>
							<td>
								<div class="shipper-cell">
									<div class="shipper-avatar">{getInitials(klien(r))}</div>
									<span class="shipper-name">{klien(r)}</span>
								</div>
							</td>
							<td>{warehouseName(r.originWarehouseId)} → {warehouseName(r.destinationWarehouseId)}</td>
							<td>{r.pickupAt ? formatDate(r.pickupAt, 'datetime') : '-'}</td>
							<td class="mono">{r.total !== undefined && r.total !== null ? formatCurrency(Number(r.total)) : '—'}</td>
							<td><span class={st.badge}>{st.label}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<table class="spot-order-table spot-order-table-frozen" style="width:64px;">
			<colgroup><col style="width:64px" /></colgroup>
			<thead><tr><th>Aksi</th></tr></thead>
			<tbody>
				{#each rows as r (r.orderId)}
					<tr>
						<td>
							<div class="action-cell">
								<button
									type="button"
									class="frozen-icon-btn"
									title="Buka order & isi uang sangu"
									aria-label="Buka {r.orderNumber}"
									onclick={() => goto(`${basePath}/order/${r.orderId}`)}
								>
									<Wallet size={14} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if lastPage > 0}
		<div class="table-footer-bar" style="display:flex; align-items:center; justify-content:center; gap:14px;">
			<button type="button" class="btn btn-outline btn-sm" disabled={page <= 0} onclick={() => load(page - 1)}>← Sebelumnya</button>
			<span>Halaman {page + 1} dari {lastPage + 1}</span>
			<button type="button" class="btn btn-outline btn-sm" disabled={page >= lastPage} onclick={() => load(page + 1)}>Selanjutnya →</button>
		</div>
	{:else}
		<div class="table-footer-bar">Semua data sudah dimuat</div>
	{/if}
{/if}
