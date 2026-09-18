<script lang="ts">
	/**
	 * Master Data — MyAgreement, laid out like MyCargo and MyWarehouse: the
	 * customers down the left with a count of live agreements each, and
	 * the selected customer's agreements on the right, by type.
	 *
	 * Rows come from GET /agreements; every version is its own row, so the
	 * prototype's archived `versionLog` snapshots are the rows with
	 * statusCode 'superseded'.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, RefreshCw, Plus } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { AGREEMENT_TYPE_OPTIONS, agreementTypeLabel } from '$lib/revamp/agreementType.js';
	import { toAgreementRow, isAgreementExpired, type AgreementRow } from '$lib/revamp/agreementView';

	let { basePath = '/t' }: { basePath?: string } = $props();

	interface Customer {
		id: string;
		name: string;
	}
	let customers = $state<Customer[]>([]);
	let agreements = $state<AgreementRow[]>([]);
	let loaded = $state(false);
	let selected = $state('');
	let search = $state('');

	onMount(async () => {
		const [c, a] = await Promise.allSettled([
			api.get(ENDPOINTS.shippers.list),
			api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 500 })
		]);
		customers = c.status === 'fulfilled' && Array.isArray(c.value.data?.data) ? c.value.data.data : [];
		const rows = a.status === 'fulfilled' && Array.isArray(a.value.data?.data) ? a.value.data.data : [];
		agreements = rows.map(toAgreementRow);
		// A customer that has agreements but is not (any longer) in the
		// client list still gets a row, so nothing is hidden.
		const known = new Set(customers.map((x) => x.id));
		for (const r of agreements) {
			if (r.shipperCompanyId && !known.has(r.shipperCompanyId)) {
				known.add(r.shipperCompanyId);
				customers = [...customers, { id: r.shipperCompanyId, name: r.customerNama || 'Customer' }];
			}
		}
		if (!selected && customers.length) selected = customers[0].id;
		loaded = true;
	});

	const isExpired = isAgreementExpired;

	/** Live agreements per customer, for the counts down the left. */
	let liveCounts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const a of agreements) {
			if (a.isArchived || isExpired(a)) continue;
			c[a.shipperCompanyId] = (c[a.shipperCompanyId] ?? 0) + 1;
		}
		return c;
	});

	let matchesSearch = $derived((a: AgreementRow) => {
		const q = search.trim().toLowerCase();
		if (!q) return true;
		return [a.customerNama, a.idAgreement, a.kotaAsal, a.kotaTujuan, a.namaBarang].some((v) =>
			(v ?? '').toLowerCase().includes(q)
		);
	});
	/** With a search, every customer is a candidate; without, the selected one. */
	let customerRows = $derived(
		agreements.filter((a) => (search.trim() ? matchesSearch(a) : a.shipperCompanyId === selected))
	);
	let liveAgreements = $derived(customerRows.filter((a) => !a.isArchived));
	let activeAgreements = $derived(liveAgreements.filter((a) => !isExpired(a)));
	// A renewal doesn't delete the old terms — the superseded version stays as
	// its own row. Those are archived here alongside date-expired agreements,
	// since both are "no longer the live agreement".
	let expiredAgreements = $derived([
		...liveAgreements.filter(isExpired),
		...customerRows.filter((a) => a.isArchived)
	]);

	let activeFilter = $state('all');
	let filterTabs = $derived([
		{ value: 'all', label: 'Semua', count: activeAgreements.length },
		...AGREEMENT_TYPE_OPTIONS.map((o: { value: string; label: string }) => ({
			value: o.value,
			label: o.label,
			count: activeAgreements.filter((a) => a.agreementType === o.value).length
		})),
		{ value: 'expired', label: 'Agreement Expired', count: expiredAgreements.length }
	]);
	let filteredAgreements = $derived.by(() => {
		if (activeFilter === 'all') return activeAgreements;
		if (activeFilter === 'expired') return expiredAgreements;
		return activeAgreements.filter((a) => a.agreementType === activeFilter);
	});

	let selectedName = $derived(customers.find((c) => c.id === selected)?.name ?? '');

	function goToAdd() {
		goto(`${basePath}/agreement/create${selected ? `?customer=${selected}` : ''}`);
	}
	function goToRenew(a: AgreementRow) {
		goto(`${basePath}/agreement/${a.id}/renew`);
	}
	function goToDocument(a: AgreementRow) {
		goto(`${basePath}/agreement/${a.id}${a.isArchived ? `?version=${a.version}` : ''}`);
	}
</script>

<div class="page-head">
	<div>
		<h1>Master Data — MyAgreement</h1>
	</div>
</div>

<div class="field" style="max-width:600px;">
	<input
		type="text"
		bind:value={search}
		placeholder="Cari nama customer, no. agreement, rute, atau muatan..."
	/>
</div>

<div class="md-layout">
	<aside class="md-side">
		<div class="md-side-head">Customer</div>
		{#if !loaded}
			<p class="md-side-note">Loading…</p>
		{:else if !customers.length}
			<p class="md-side-note">Belum ada customer.</p>
		{:else}
			<ul>
				{#each customers as c (c.id)}
					<li>
						<button
							type="button"
							class="md-side-row"
							class:active={selected === c.id && !search.trim()}
							onclick={() => {
								selected = c.id;
								search = '';
							}}
						>
							<span class="truncate">{c.name}</span>
							<span class="md-side-count">{liveCounts[c.id] ?? 0}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<a class="md-side-add" href="{basePath}/customer-list"><Plus size={14} /> Tambah Customer</a>
	</aside>

	<section class="md-main">
		<header class="md-main-head">
			<div>
				<h2>{search.trim() ? `Hasil pencarian "${search.trim()}"` : selectedName || 'Pilih customer'}</h2>
				<p>{activeAgreements.length} agreement aktif</p>
			</div>
			<button class="btn btn-primary" onclick={goToAdd}>+ Tambah Agreement</button>
		</header>

		<div class="md-main-body">
			<div class="method-tabs">
				{#each filterTabs as tab (tab.value)}
					<button
						type="button"
						class="method-tab"
						class:active={activeFilter === tab.value}
						onclick={() => (activeFilter = tab.value)}
					>
						{tab.label} ({tab.count})
					</button>
				{/each}
			</div>

			{#if loaded && !filteredAgreements.length}
				<div class="empty">
					<div class="eic">📝</div>
					{#if activeFilter === 'all' && !search.trim()}
						Belum ada agreement untuk {selectedName || 'customer ini'}.<br />
						<button class="btn btn-primary" style="margin-top:14px;" onclick={goToAdd}
							>+ Tambah Agreement</button
						>
					{:else}
						Tidak ada agreement untuk filter ini.
					{/if}
				</div>
			{:else if loaded}
				<div class="table-wrap">
					<table class="scroll-table">
						<thead>
							<tr>
								<th>No</th>
								<th>No. Agreement</th>
								{#if search.trim()}<th>Customer</th>{/if}
								<th>Type Agreement</th>
								<th>Rute</th>
								<th>Cargo Item</th>
								<th>Tipe Harga</th>
								<th>Harga</th>
								<th>Versi</th>
								<th>Masa Berlaku</th>
								<th class="sticky-col-status">Status</th>
								<th class="sticky-col-aksi">Aksi</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredAgreements as a, i (a.id)}
								<tr>
									<td>{i + 1}</td>
									<td><b>{a.idAgreement}</b></td>
									{#if search.trim()}<td>{a.customerNama}</td>{/if}
									<td>{agreementTypeLabel(a.agreementType)}</td>
									<td>{a.kotaAsal} - {a.kotaTujuan}</td>
									<td>{a.namaBarang || '-'}</td>
									<td>{pricingTypeLabel(a.pricingType)}</td>
									<td><b>{formatIDR(a.tarif)}</b></td>
									<td
										><span class="badge {a.isArchived ? 'badge-wait' : 'badge-planner'}"
											>Version {a.version || 1}</span
										></td
									>
									<td>{a.tanggalMulai} s/d {a.tanggalBerakhir}</td>
									<td class="sticky-col-status">
										<span
											class="badge {a.isArchived
												? 'badge-wait'
												: isExpired(a)
													? 'badge-fail'
													: 'badge-active'}"
										>
											{a.isArchived ? 'Diganti (Renewal)' : isExpired(a) ? 'Berakhir' : 'Aktif'}
										</span>
									</td>
									<td class="sticky-col-aksi">
										<div class="action-cell">
											<button class="mini-icon-btn" title="Lihat Dokumen" onclick={() => goToDocument(a)}
												><span class="icon-wrap"><Search size={16} /></span></button
											>
											{#if !a.isArchived}
												<button class="mini-icon-btn" title="Renewal Agreement" onclick={() => goToRenew(a)}
													><span class="icon-wrap"><RefreshCw size={14} /></span></button
												>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</section>
</div>
