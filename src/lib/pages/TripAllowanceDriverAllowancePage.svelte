<script lang="ts">
	/**
	 * Trip Allowance — Driver Allowance (prototype
	 * TripAllowanceDriverAllowanceView). Every spot order has a pre-trip
	 * Uang Sangu estimate, computed here from the order's trip estimate and
	 * the company's Trip Allowance configuration — the same formula the
	 * order's own detail page shows.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { computeUangSangu } from '$lib/revamp/uangSangu.js';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { initials } from '$lib/revamp/initials.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import {
		loadTripAllowance,
		tripAllowanceDefaults,
		type TripAllowanceSettings
	} from '$lib/revamp/tripAllowanceSettings';

	let { basePath = '/t' }: { basePath?: string } = $props();

	interface Component {
		id: string;
		label: string;
		formula: string;
		nominal: number;
		needsInput?: boolean;
		isCustom?: boolean;
	}
	interface Item {
		order: { id: string; idSpotOrder: string; shipperName: string; rute: string };
		uangSangu: any;
		components: Component[];
		needsFerryInput: boolean;
	}

	let orders = $state<any[]>([]);
	let tripAllowance = $state<TripAllowanceSettings>(tripAllowanceDefaults());
	let loaded = $state(false);

	function buildComponents(uangSangu: any): Component[] {
		const list: Component[] = [
			{ id: 'bbm', label: 'Biaya BBM', formula: uangSangu.bbm.formula, nominal: uangSangu.bbm.value },
			{ id: 'tol', label: 'Biaya Tol', formula: uangSangu.tol.formula, nominal: uangSangu.tol.value },
			{
				id: 'uangMakan',
				label: 'Uang Makan',
				formula: uangSangu.uangMakan.formula,
				nominal: uangSangu.uangMakan.value
			}
		];
		if (uangSangu.ferry.melewatiFerry) {
			list.push({
				id: 'ferry',
				label: 'Biaya Ferry',
				formula: uangSangu.ferry.formula,
				nominal: uangSangu.ferry.value,
				needsInput: uangSangu.ferry.needsInput
			});
		}
		for (const c of uangSangu.custom) {
			list.push({
				id: `custom_${c.index}`,
				label: c.label,
				formula: c.formula,
				nominal: c.nominal,
				isCustom: true
			});
		}
		return list;
	}

	let driverAllowances = $derived<Item[]>(
		orders.map((o) => {
			const d = o.detail ?? {};
			const uangSangu = computeUangSangu({ ...o, status: kontrakStatus(o) }, tripAllowance);
			return {
				order: {
					id: o.id,
					idSpotOrder: o.orderNumber ?? o.id,
					shipperName: o.shipperCompanyName ?? d.shipperName ?? '',
					rute: d.rute ?? `${o.originWarehouseName ?? ''} - ${o.destinationWarehouseName ?? ''}`
				},
				uangSangu,
				components: buildComponents(uangSangu),
				needsFerryInput: uangSangu.ferry.needsInput
			};
		})
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
		<h1>Trip Allowance — Driver Allowance</h1>
	</div>
</div>

{#if loaded && !driverAllowances.length}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">💳</div>
			Belum ada order.
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
					<th>Subtotal Uang Sangu</th>
					<th>Status</th>
					<th>Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each driverAllowances as item, i (item.order.id)}
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
						<td><b>{formatIDR(item.uangSangu.subtotal)}</b></td>
						<td>
							<span
								class="badge"
								class:badge-wait={item.needsFerryInput}
								class:badge-active={!item.needsFerryInput}
							>
								{item.needsFerryInput ? 'Perlu Diinput' : 'Lengkap'}
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
			<h3>Uang Sangu Driver — {viewing.order.idSpotOrder}</h3>
			<p>{viewing.order.shipperName} &middot; {viewing.order.rute}</p>

			<div class="recon-modal-list">
				{#each viewing.components as c (c.id)}
					<div class="recon-modal-item">
						<div class="recon-modal-item-head">
							<div>
								<div class="recon-modal-item-label">{c.label}</div>
								<div class="recon-modal-item-formula">{c.formula}</div>
							</div>
							{#if c.needsInput}<span class="sangu-needs-input-tag">Perlu Diinput</span
								>{:else if c.isCustom}<span class="sangu-tambahan-tag">Tambahan</span>{/if}
						</div>

						<div class="recon-modal-nominal">
							<label for="rm-{c.id}">Nominal</label>
							<div id="rm-{c.id}" class="recon-modal-nominal-readonly">{formatIDR(c.nominal)}</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="recon-modal-total">
				<span>Subtotal Uang Sangu Pre-Trip</span>
				<b>{formatIDR(viewing.uangSangu.subtotal)}</b>
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
