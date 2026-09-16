<script lang="ts">
	/**
	 * Port of Karlo-TMS-Revamp/src/views/AgreementView.vue — Master Data — MyAgreement.
	 *
	 * Rows come from GET /agreements; every version is its own row, so the
	 * prototype's archived `versionLog` snapshots are the rows with
	 * statusCode 'superseded'.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, RefreshCw } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { AGREEMENT_TYPE_OPTIONS, agreementTypeLabel } from '$lib/revamp/agreementType.js';
	import { toAgreementRow, isAgreementExpired, type AgreementRow } from '$lib/revamp/agreementView';

	let { basePath = '/t' }: { basePath?: string } = $props();

	let agreements = $state<AgreementRow[]>([]);
	let loaded = $state(false);

	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 200 });
			const rows = Array.isArray(res.data?.data) ? res.data.data : [];
			agreements = rows.map(toAgreementRow);
		} catch {
			agreements = [];
		} finally {
			loaded = true;
		}
	});

	const isExpired = isAgreementExpired;

	let liveAgreements = $derived(agreements.filter((a) => !a.isArchived));
	let activeAgreements = $derived(liveAgreements.filter((a) => !isExpired(a)));
	// A renewal doesn't delete the old terms — the superseded version stays as
	// its own row. Those are archived here alongside date-expired agreements,
	// since both are "no longer the live agreement".
	let archivedVersionRows = $derived(agreements.filter((a) => a.isArchived));
	let expiredAgreements = $derived([...liveAgreements.filter(isExpired), ...archivedVersionRows]);

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

	function goToAdd() {
		goto(`${basePath}/agreement/create`);
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
	<button class="btn btn-primary" onclick={goToAdd}>+ Tambah Agreement</button>
</div>

{#if loaded && !agreements.length}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">📝</div>
			Belum ada data agreement.<br />
			<button class="btn btn-primary" style="margin-top:14px;" onclick={goToAdd}>+ Tambah Agreement</button>
		</div>
	</div>
{:else if loaded}
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

	{#if !filteredAgreements.length}
		<div class="card card-pad">
			<div class="empty">
				<div class="eic">📝</div>
				Tidak ada agreement untuk filter ini.
			</div>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="scroll-table">
				<thead>
					<tr>
						<th>No</th>
						<th>No. Agreement</th>
						<th>Customer</th>
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
							<td>{a.customerNama}</td>
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
									class="badge {a.isArchived ? 'badge-wait' : isExpired(a) ? 'badge-fail' : 'badge-active'}"
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
{/if}
