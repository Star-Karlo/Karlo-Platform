<script lang="ts">
	/**
	 * Port of OrderKontrakView.vue + OrderKontrakStatusTabs.vue +
	 * OrderKontrakTable.vue. Order Kontrak = the orders the transporter
	 * entered through the Internal Order wizard (`detail.internalOrder`).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { FilePlus, Filter, Download, Upload, Search, Copy } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { ORDER_KONTRAK_TABS, statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { initials } from '$lib/revamp/initials.js';
	import { copyText } from '$lib/revamp/clipboard.js';

	let { basePath }: { basePath: string } = $props();

	type Row = {
		id: string;
		idOrder: string;
		tanggalPickup: string;
		rute: string;
		shipperName: string;
		muatan: string;
		status: string;
	};

	let loaded = $state(false);
	let items = $state<Row[]>([]);

	function toRow(o: any): Row {
		const d = o.detail ?? {};
		return {
			id: o.id,
			idOrder: o.orderNumber,
			tanggalPickup: d.tanggalPickup || (o.pickupAt ? formatTimestampLabel(new Date(o.pickupAt)) : ''),
			rute: d.rute || '',
			shipperName: d.shipperName || o.shipperCompanyName || '',
			muatan: d.muatan || '',
			status: kontrakStatus(o)
		};
	}

	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 200 });
			items = (res.data.data ?? []).filter((o: any) => o?.detail?.internalOrder === true).map(toRow);
		} catch (e: any) {
			toast(e?.response?.data?.message || 'Gagal memuat Order Kontrak');
		} finally {
			loaded = true;
		}
	});

	let activeTab = $state('total');

	function goToInternalOrder() {
		goto(`${basePath}/internal-order`);
	}

	/* ---------- Status tabs ---------- */
	let tabs = $derived.by(() => {
		const all = [{ key: 'total', label: 'Total', count: items.length }];
		for (const key of ORDER_KONTRAK_TABS as string[]) {
			all.push({ key, label: statusLabel(key), count: items.filter((o) => o.status === key).length });
		}
		return all;
	});

	/* ---------- Table ---------- */
	// Rows follow the pipeline's own order (Penugasan Pengemudi first,
	// Pengiriman Terkonfirmasi last) rather than createdAt, so orders at the
	// same stage sit together instead of being scattered by whenever each one
	// happened to be created.
	const STATUS_ORDER: Record<string, number> = Object.fromEntries(
		(ORDER_KONTRAK_TABS as string[]).map((s, i) => [s, i])
	);
	let filtered = $derived.by(() => {
		const base = activeTab === 'total' ? items : items.filter((o) => o.status === activeTab);
		return [...base].sort((a, b) => (STATUS_ORDER[a.status] ?? 999) - (STATUS_ORDER[b.status] ?? 999));
	});

	function viewOrder(order: Row) {
		goto(`${basePath}/order/kontrak/${order.id}`);
	}
	async function copyOrderId(order: Row) {
		const ok = await copyText(order.idOrder);
		toast(ok ? 'ID Order disalin: ' + order.idOrder : 'Gagal menyalin otomatis. Silakan salin manual.');
	}
</script>

<div class="page-head">
	<div>
		<h1>Orders — Order Kontrak</h1>
	</div>
	<button class="btn btn-primary" onclick={goToInternalOrder}>
		<span class="icon-wrap"><FilePlus size={16} /></span> Input Order
	</button>
</div>

{#if loaded && !items.length}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">📄</div>
			Belum ada Order Kontrak.<br />
			<button class="btn btn-primary" style="margin-top:14px;" onclick={goToInternalOrder}
				>+ Input Order</button
			>
		</div>
	</div>
{:else if loaded}
	<div class="order-toolbar">
		<div class="order-tabs-row">
			{#each tabs as tab (tab.key)}
				<button class="order-tab" class:active={activeTab === tab.key} onclick={() => (activeTab = tab.key)}>
					{tab.label} ({tab.count})
				</button>
			{/each}
		</div>
		<div class="order-toolbar-actions">
			<button class="btn btn-outline btn-sm" onclick={() => toast('Fitur Filter akan segera hadir')}>
				<span class="icon-wrap"><Filter size={14} /></span> Filter
			</button>
			<button class="btn btn-outline btn-sm" onclick={() => toast('Fitur Import akan segera hadir')}>
				<span class="icon-wrap"><Download size={15} /></span> Import
			</button>
			<button class="btn btn-outline btn-sm" onclick={() => toast('Fitur Export akan segera hadir')}>
				<span class="icon-wrap"><Upload size={15} /></span> Export
			</button>
		</div>
	</div>

	<div class="spot-order-wrap">
		<div class="spot-order-scroll">
			<table class="spot-order-table" style="min-width:1246px;">
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
					{#if filtered.length === 0}
						<tr>
							<td colspan="7">
								<div class="empty">
									<div class="eic">📄</div>
									Belum ada Order Kontrak.
								</div>
							</td>
						</tr>
					{/if}
					{#each filtered as o, i (o.id)}
						<tr>
							<td>{i + 1}</td>
							<td>{o.tanggalPickup}</td>
							<td class="mono" style="font-weight:700;">{o.idOrder}</td>
							<td>{o.rute || '---'}</td>
							<td>
								<div class="shipper-cell">
									<div class="shipper-avatar">{initials(o.shipperName)}</div>
									<span class="shipper-name">{o.shipperName}</span>
								</div>
							</td>
							<td>{o.muatan || '-'}</td>
							<td>
								<span class="badge {statusBadgeClass(o.status || 'penugasan_pengemudi')}">
									{statusLabel(o.status || 'penugasan_pengemudi')}
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<table class="spot-order-table spot-order-table-frozen" style="width:96px;">
			<colgroup>
				<col style="width:96px" />
			</colgroup>
			<thead>
				<tr>
					<th>Kontrol</th>
				</tr>
			</thead>
			<tbody>
				{#if filtered.length === 0}
					<tr>
						<td></td>
					</tr>
				{/if}
				{#each filtered as o (o.id)}
					<tr>
						<td>
							<div class="action-cell">
								<button class="frozen-icon-btn" title="Lihat detail" onclick={() => viewOrder(o)}>
									<span class="icon-wrap"><Search size={16} /></span>
								</button>
								<button class="frozen-icon-btn" title="Salin ID Order" onclick={() => copyOrderId(o)}>
									<span class="icon-wrap"><Copy size={15} /></span>
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="table-footer-bar">Semua data sudah dimuat</div>
{/if}
