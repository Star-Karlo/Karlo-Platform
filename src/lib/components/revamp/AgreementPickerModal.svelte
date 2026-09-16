<script lang="ts">
	/**
	 * Port of AgreementPickerModal.vue ("Agreement List"). Lists the
	 * transporter's agreements from GET /agreements, scoped to one customer
	 * when `customerFilter`/`customerId` is set. Expired agreements are
	 * included, exactly like the prototype (no date check).
	 */
	import { onMount } from 'svelte';
	import { X } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { AGREEMENT_TYPE_OPTIONS, agreementTypeLabel } from '$lib/revamp/agreementType.js';
	import Pagination from './Pagination.svelte';

	const PAGE_SIZE = 5;

	let {
		show = $bindable(false),
		customerFilter = '',
		customerId = '',
		onSelected
	}: {
		show?: boolean;
		/** When set, only agreements whose detail.customerNama matches. */
		customerFilter?: string;
		/** The customer's shipper company id (matched against shipperCompanyId). */
		customerId?: string;
		onSelected?: (agreement: any) => void;
	} = $props();

	let items = $state<any[]>([]);
	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 200 });
			items = res.data.data ?? [];
		} catch {
			items = [];
		}
	});

	let activeTypeFilter = $state('all');
	let page = $state(1);

	$effect(() => {
		// Any change of the type tab returns to the first page.
		void activeTypeFilter;
		page = 1;
	});
	$effect(() => {
		if (show) {
			activeTypeFilter = 'all';
			page = 1;
		}
	});

	function detailOf(a: any): Record<string, any> {
		return a?.detail ?? {};
	}

	let scoped = $derived.by(() => {
		if (!customerFilter && !customerId) return items;
		return items.filter(
			(a) =>
				(customerFilter && detailOf(a).customerNama === customerFilter) ||
				(customerId && a.shipperCompanyId === customerId)
		);
	});
	let filterTabs = $derived([
		{ value: 'all', label: 'Semua', count: scoped.length },
		...AGREEMENT_TYPE_OPTIONS.map((o: { value: string; label: string }) => ({
			value: o.value,
			label: o.label,
			count: scoped.filter((a) => detailOf(a).agreementType === o.value).length
		}))
	]);
	let filtered = $derived(
		activeTypeFilter === 'all' ? scoped : scoped.filter((a) => detailOf(a).agreementType === activeTypeFilter)
	);
	let pageItems = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	function close() {
		show = false;
	}
	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}
	function select(a: any) {
		onSelected?.(a);
		close();
	}
</script>

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box modal-box-lg picker-modal" role="dialog" aria-modal="true">
			<div class="picker-modal-head">
				<h3 style="margin:0;">Agreement List</h3>
				<button type="button" class="icon-btn" onclick={close}
					><span class="icon-wrap"><X size={15} /></span></button
				>
			</div>

			<div class="method-tabs picker-modal-tabs">
				{#each filterTabs as tab (tab.value)}
					<button
						type="button"
						class="method-tab"
						class:active={activeTypeFilter === tab.value}
						onclick={() => (activeTypeFilter = tab.value)}
					>
						{tab.label} ({tab.count})
					</button>
				{/each}
			</div>

			<div class="modal-scroll-body">
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>No</th>
								<th>No Agreement</th>
								<th>Company</th>
								<th>Type Agreement</th>
								<th>Rute</th>
								<th>Cargo Type</th>
								<th>Harga</th>
								<th>Pricing Type</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{#if !pageItems.length}
								<tr>
									<td colspan="9"
										><div class="empty">
											<div class="eic">📄</div>
											Tidak ada agreement yang cocok.
										</div></td
									>
								</tr>
							{/if}
							{#each pageItems as a, i (a.id)}
								{@const d = detailOf(a)}
								<tr>
									<td>{(page - 1) * PAGE_SIZE + i + 1}</td>
									<td><b>{a.agreementNumber}</b></td>
									<td>{d.customerNama || a.shipperCompanyName}</td>
									<td>{agreementTypeLabel(d.agreementType)}</td>
									<td>{d.kotaAsal} - {d.kotaTujuan}</td>
									<td>{d.namaBarang || '-'}</td>
									<td>{formatIDR(d.tarif)}</td>
									<td>{pricingTypeLabel(d.pricingType)}</td>
									<td
										><button type="button" class="btn btn-outline btn-sm" onclick={() => select(a)}
											>Pilih</button
										></td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if filtered.length}
					<Pagination totalItems={filtered.length} bind:page />
				{/if}
			</div>
		</div>
	</div>
{/if}
