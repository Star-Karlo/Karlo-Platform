<script lang="ts">
	/**
	 * Trip Allowance — Reconciliation (prototype
	 * TripAllowanceReconciliationView). Only orders with a post-trip record
	 * (detail.postTrip, written from the order's own detail page) appear,
	 * finalised or not; the figures come from computePostTripReconciliation,
	 * the same derivation the detail page shows.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, FileText } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import {
		computeUangSangu,
		computePostTripReconciliation,
		reconStatusLabel
	} from '$lib/revamp/uangSangu.js';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { initials } from '$lib/revamp/initials.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import {
		loadTripAllowance,
		tripAllowanceDefaults,
		type TripAllowanceSettings
	} from '$lib/revamp/tripAllowanceSettings';

	let { basePath = '/t' }: { basePath?: string } = $props();

	interface Item {
		order: { id: string; idSpotOrder: string; shipperName: string; rute: string };
		recon: any;
	}

	let orders = $state<any[]>([]);
	let tripAllowance = $state<TripAllowanceSettings>(tripAllowanceDefaults());
	let loaded = $state(false);

	let reconciliations = $derived<Item[]>(
		orders
			.map((o) => {
				const d = o.detail ?? {};
				const withStatus = { ...o, status: kontrakStatus(o) };
				const uangSangu = computeUangSangu(withStatus, tripAllowance);
				const recon = computePostTripReconciliation(withStatus, tripAllowance, uangSangu.uangMakan.value);
				if (!recon) return null;
				return {
					order: {
						id: o.id,
						idSpotOrder: o.orderNumber ?? o.id,
						shipperName: o.shipperCompanyName ?? d.shipperName ?? '',
						rute: d.rute ?? `${o.originWarehouseName ?? ''} - ${o.destinationWarehouseName ?? ''}`
					},
					recon
				};
			})
			.filter((x): x is Item => !!x)
	);

	onMount(async () => {
		const [o, ta] = await Promise.allSettled([
			api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 200 }),
			loadTripAllowance()
		]);
		if (o.status === 'fulfilled') {
			orders = (o.value.data?.data ?? [])
				.filter((x: any) => !x.detail?.internalOrder)
				.sort((a: any, b: any) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
		} else {
			toast('Gagal memuat order');
		}
		if (ta.status === 'fulfilled') tripAllowance = ta.value.settings;
		loaded = true;
	});

	let viewing = $state<Item | null>(null);
	function openView(item: Item) {
		viewing = item;
	}
	function closeView() {
		viewing = null;
	}
	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeView();
	}
	function goToOrder(id: string) {
		closeView();
		goto(`${basePath}/order/spot/${id}`);
	}
</script>

<div class="page-head">
	<div>
		<h1>Trip Allowance — Reconciliation</h1>
	</div>
</div>

{#if loaded && !reconciliations.length}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">🧾</div>
			Belum ada order dengan rekonsiliasi post-trip.
		</div>
	</div>
{:else if loaded}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>No</th>
					<th>ID Spot Order</th>
					<th>Shipper</th>
					<th>Rute</th>
					<th>Total Rekonsiliasi</th>
					<th>Status</th>
					<th>Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each reconciliations as item, i (item.order.id)}
					<tr>
						<td>{i + 1}</td>
						<td><b>{item.order.idSpotOrder}</b></td>
						<td>
							<div class="shipper-cell">
								<div class="shipper-avatar">{initials(item.order.shipperName)}</div>
								<div class="shipper-name">{item.order.shipperName}</div>
							</div>
						</td>
						<td>{item.order.rute}</td>
						<td><b>{formatIDR(item.recon.total)}</b></td>
						<td>
							<span
								class="badge"
								class:badge-active={item.recon.status === 'sudah_diproses'}
								class:badge-wait={item.recon.status !== 'sudah_diproses'}
							>
								{item.recon.status === 'sudah_diproses' ? 'Sudah Diproses' : 'Belum Diproses'}
							</span>
						</td>
						<td>
							<button class="icon-btn" title="Lihat detail" onclick={() => openView(item)}
								><Search size={14} /></button
							>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if viewing}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box modal-box-lg" role="dialog" aria-modal="true">
			<h3>Rekonsiliasi Post-Trip — {viewing.order.idSpotOrder}</h3>
			<p>{viewing.order.shipperName} &middot; {viewing.order.rute}</p>

			<div class="recon-modal-list">
				{#each viewing.recon.components as c (c.id)}
					<div class="recon-modal-item">
						<div class="recon-modal-item-head">
							<div>
								<div class="recon-modal-item-label">{c.label}</div>
								<div class="recon-modal-item-formula">{c.formula}</div>
							</div>
							{#if c.isReimburse}<span class="recon-status-tag {c.status}">{reconStatusLabel(c.status)}</span
								>{:else if c.finalized}<span class="sangu-final-tag">Final</span>{/if}
						</div>

						{#if c.attachment}
							<div class="recon-modal-attachment">
								<div class="doc-photo-placeholder"><FileText size={18} /></div>
								<span>{c.attachment}</span>
							</div>
						{/if}

						<div class="recon-modal-nominal">
							<label for="rc-{c.id}">Nominal</label>
							<div id="rc-{c.id}" class="recon-modal-nominal-readonly">{formatIDR(c.nominal)}</div>
						</div>

						{#if c.isReimburse && c.status === 'rejected' && c.note}
							<div class="sangu-row-note" style="margin-top:10px;">Catatan: {c.note}</div>
						{/if}
					</div>
				{/each}
			</div>

			<div class="recon-modal-total">
				<span>Total Rekonsiliasi</span>
				<b>{formatIDR(viewing.recon.total)}</b>
			</div>

			<div class="modal-actions">
				<button class="btn btn-outline" onclick={closeView}>Tutup</button>
				<button class="btn btn-primary" onclick={() => goToOrder(viewing!.order.id)}
					>Buka di Detail Order</button
				>
			</div>
		</div>
	</div>
{/if}
