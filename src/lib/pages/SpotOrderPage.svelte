<script lang="ts">
	/**
	 * Orders — Spot Order (prototype SpotOrderView + SpotOrderStatusTabs +
	 * SpotOrderTable). Spot orders are the orders shipper companies submitted
	 * to us — every order that the internal-order wizard did NOT create.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, Copy, Filter, Download, Upload } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { SPOT_ORDER_TABS, statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { formatDateTimeLabel } from '$lib/revamp/date.js';
	import { initials } from '$lib/revamp/initials.js';
	import { copyText } from '$lib/revamp/clipboard.js';

	let { basePath = '/t' }: { basePath?: string } = $props();

	type SpotRow = {
		id: string;
		idSpotOrder: string;
		tanggalPickup: string;
		rute: string;
		shipperName: string;
		shipperVerified: boolean;
		muatan: string;
		status: string;
		timer: string;
		createdAt: string;
	};

	let items = $state<SpotRow[]>([]);
	let activeTab = $state('total');

	function pickupLabel(o: any): string {
		if (o.detail?.tanggalPickup) return o.detail.tanggalPickup;
		if (!o.pickupAt) return '';
		const d = new Date(o.pickupAt);
		if (Number.isNaN(d.getTime())) return '';
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
		return formatDateTimeLabel(date, time);
	}

	function toRow(o: any): SpotRow {
		const d = o.detail ?? {};
		return {
			id: o.id,
			idSpotOrder: o.orderNumber ?? o.id,
			tanggalPickup: pickupLabel(o),
			rute: d.rute ?? `${o.originWarehouseName ?? ''} - ${o.destinationWarehouseName ?? ''}`,
			shipperName: o.shipperCompanyName ?? d.shipperName ?? '',
			shipperVerified: !!d.shipperVerified,
			muatan: d.muatan ?? o.cargoTypeName ?? o.cargoType?.name ?? '',
			status: kontrakStatus(o),
			timer: d.timer ?? '',
			createdAt: o.createdAt ?? ''
		};
	}

	async function load() {
		try {
			const res = await api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 200 });
			const rows: any[] = res.data?.data ?? [];
			items = rows
				.filter((o) => !o.detail?.internalOrder)
				.sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
				.map(toRow);
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat Spot Order');
		}
	}
	onMount(load);

	let tabs = $derived.by(() => {
		const all = [{ key: 'total', label: 'Total', count: items.length }];
		for (const key of SPOT_ORDER_TABS) {
			all.push({ key, label: statusLabel(key), count: items.filter((o) => o.status === key).length });
		}
		return all;
	});

	let filtered = $derived(activeTab === 'total' ? items : items.filter((o) => o.status === activeTab));

	function viewOrder(order: SpotRow) {
		goto(`${basePath}/order/spot/${order.id}`);
	}
	async function copyOrderId(order: SpotRow) {
		const ok = await copyText(order.idSpotOrder);
		toast(
			ok ? 'ID Spot Order disalin: ' + order.idSpotOrder : 'Gagal menyalin otomatis. Silakan salin manual.'
		);
	}
</script>

<div class="page-head">
	<div>
		<h1>Orders — Spot Order</h1>
	</div>
</div>

<div class="order-toolbar">
	<div class="order-tabs-row">
		{#each tabs as tab (tab.key)}
			<button
				type="button"
				class="order-tab"
				class:active={activeTab === tab.key}
				onclick={() => (activeTab = tab.key)}
			>
				{tab.label} ({tab.count})
			</button>
		{/each}
	</div>
	<div class="order-toolbar-actions">
		<button
			type="button"
			class="btn btn-outline btn-sm"
			onclick={() => toast('Fitur Filter akan segera hadir')}
		>
			<span class="icon-wrap"><Filter size={15} /></span> Filter
		</button>
		<button
			type="button"
			class="btn btn-outline btn-sm"
			onclick={() => toast('Fitur Import akan segera hadir')}
		>
			<span class="icon-wrap"><Download size={15} /></span> Import
		</button>
		<button
			type="button"
			class="btn btn-outline btn-sm"
			onclick={() => toast('Fitur Export akan segera hadir')}
		>
			<span class="icon-wrap"><Upload size={15} /></span> Export
		</button>
	</div>
</div>

<!--
  Two separate <table> elements side by side instead of CSS `position:sticky`
  on individual cells — same frozen-column technique as the prototype.
-->
<div class="spot-order-wrap">
	<div class="spot-order-scroll">
		<table class="spot-order-table">
			<colgroup>
				<col style="width:4.46%" />
				<col style="width:12.74%" />
				<col style="width:12.74%" />
				<col style="width:20.70%" />
				<col style="width:19.90%" />
				<col style="width:11.15%" />
				<col style="width:18.31%" />
			</colgroup>
			<thead>
				<tr>
					<th>No</th>
					<th>Tanggal Pickup</th>
					<th>ID Spot Order</th>
					<th>Rute</th>
					<th>Shipper</th>
					<th>Muatan</th>
					<th>Status</th>
				</tr>
			</thead>
			<tbody>
				{#if filtered.length === 0}
					<tr>
						<td colspan="7">
							<div class="empty">
								<div class="eic">📦</div>
								Tidak ada Spot Order pada kategori ini.
							</div>
						</td>
					</tr>
				{/if}
				{#each filtered as o, i (o.id)}
					<tr>
						<td>{i + 1}</td>
						<td>{o.tanggalPickup}</td>
						<td class="mono" style="font-weight:700;">{o.idSpotOrder}</td>
						<td>{o.rute || '---'}</td>
						<td>
							<div class="shipper-cell">
								<div class="shipper-avatar">
									{initials(o.shipperName)}
									{#if o.shipperVerified}<span class="verified-dot">&#10003;</span>{/if}
								</div>
								<span class="shipper-name">{o.shipperName}</span>
							</div>
						</td>
						<td>{o.muatan}</td>
						<td>
							<span class="badge {statusBadgeClass(o.status)}">{statusLabel(o.status)}</span>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<table class="spot-order-table spot-order-table-frozen">
		<colgroup>
			<col style="width:70px" />
			<col style="width:96px" />
		</colgroup>
		<thead>
			<tr>
				<th>Timer</th>
				<th>Kontrol</th>
			</tr>
		</thead>
		<tbody>
			{#if filtered.length === 0}
				<tr>
					<td colspan="2"></td>
				</tr>
			{/if}
			{#each filtered as o (o.id)}
				<tr>
					<td>{o.timer || '-'}</td>
					<td>
						<div class="action-cell">
							<button type="button" class="frozen-icon-btn" title="Lihat detail" onclick={() => viewOrder(o)}
								><span class="icon-wrap"><Search size={16} /></span></button
							>
							<button
								type="button"
								class="frozen-icon-btn"
								title="Salin ID Spot Order"
								onclick={() => copyOrderId(o)}><span class="icon-wrap"><Copy size={15} /></span></button
							>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<div class="table-footer-bar">Semua data sudah dimuat</div>
