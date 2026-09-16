<script lang="ts">
	/**
	 * Port of Karlo-TMS-Revamp/src/views/AgreementDocumentView.vue — the
	 * printable SURAT PERJANJIAN KERJASAMA TRANSPORTASI.
	 *
	 * `id` is any version row; the lineage (GET /agreements/{root}/versions)
	 * gives the current version and the prototype's `versionLog`. `?version=N`
	 * shows that archived version's terms read-only.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { RefreshCw } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { agreementTypeLabel } from '$lib/revamp/agreementType.js';
	import { truckTypeLabel } from '$lib/revamp/truckTypes.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { toAgreementRow, type AgreementRow, type AgreementRouteEntry } from '$lib/revamp/agreementView';

	let { basePath = '/t', id }: { basePath?: string; id: string } = $props();

	let agreement = $state<AgreementRow | null>(null);
	let lineage = $state<AgreementRow[]>([]);
	let loaded = $state(false);
	let transporterName = $state('');

	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.agreements.one(id));
			agreement = res.data?.data ? toAgreementRow(res.data.data) : null;
		} catch {
			agreement = null;
		}
		if (agreement) {
			try {
				const res = await api.get(ENDPOINTS.agreements.versions(agreement.rootAgreementId));
				const rows = Array.isArray(res.data?.data) ? res.data.data : [];
				lineage = rows.map(toAgreementRow);
			} catch {
				lineage = [];
			}
		}
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			transporterName = res.data?.data?.name || '';
		} catch {
			transporterName = '';
		}
		loaded = true;
	});

	let versions = $derived.by(() => {
		const rows = lineage.length ? lineage : agreement ? [agreement] : [];
		return [...rows].sort((a, b) => a.version - b.version);
	});
	// The live version: the newest row that isn't superseded (falls back to the
	// highest version number).
	let currentRow = $derived.by(() => {
		if (!versions.length) return null;
		const live = versions.filter((v) => !v.isArchived);
		return live.length ? live[live.length - 1] : versions[versions.length - 1];
	});
	let currentVersion = $derived(currentRow?.version || 1);

	// A list row for a superseded version links here with ?version=N so its
	// archived terms can be viewed read-only instead of the current terms.
	let requestedVersion = $derived(
		$page.url.searchParams.get('version') ? Number($page.url.searchParams.get('version')) : null
	);
	let displayVersion = $derived(requestedVersion || agreement?.version || currentVersion);
	let isArchivedView = $derived(displayVersion !== currentVersion);
	let terms = $derived.by(() => {
		if (!agreement) return null;
		return versions.find((v) => v.version === displayVersion) || agreement;
	});

	let initialRoutes = $derived<AgreementRouteEntry[]>(
		terms?.initialRoutes?.length
			? terms.initialRoutes
			: [{ kota: terms?.kotaAsal || '', level: 'kota', kecamatan: '' }]
	);
	let destinationRoutes = $derived<AgreementRouteEntry[]>(
		terms?.destinationRoutes?.length
			? terms.destinationRoutes
			: [{ kota: terms?.kotaTujuan || '', level: 'kota', kecamatan: '' }]
	);

	function routeLabel(r: AgreementRouteEntry) {
		return r.level === 'kecamatan' && r.kecamatan ? r.kecamatan : r.kota;
	}

	let truckTypes = $derived(
		(terms?.truckTypeMatrix || []).map((key) => {
			const [body, size] = key.split('|');
			return truckTypeLabel(body, size);
		})
	);

	function createdByLabel(v: AgreementRow) {
		if (v.createdByEmail) return v.createdByEmail;
		if (v.createdByUserId) return v.createdByUserId.slice(0, 8);
		return '-';
	}
	let versionLogEntries = $derived(
		versions.map((v) => ({
			version: v.version,
			createdAt: v.createdAt,
			createdBy: createdByLabel(v)
		}))
	);

	function goBack() {
		goto(`${basePath}/agreement`);
	}
	function goToRenew() {
		goto(`${basePath}/agreement/${currentRow?.id || agreement?.id}/renew`);
	}
	function goToCurrentVersion() {
		goto(`${basePath}/agreement/${currentRow?.id || agreement?.id}`);
	}
	function exportPdf() {
		window.print();
	}
</script>

{#if loaded && !agreement}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">📄</div>
			Agreement tidak ditemukan.<br />
			<button class="btn btn-primary" style="margin-top:14px;" onclick={goBack}>← Kembali ke Agreement</button
			>
		</div>
	</div>
{:else if agreement && terms}
	<div class="doc-toolbar">
		<button class="btn btn-outline" onclick={goBack}>← Kembali ke Agreement</button>
		<div style="display:flex; gap:10px;">
			{#if !isArchivedView}
				<button class="btn btn-outline" onclick={goToRenew}
					><span class="icon-wrap"><RefreshCw size={14} /></span> Renewal Agreement</button
				>
			{/if}
			<button class="btn btn-primary" onclick={exportPdf}>Export to PDF</button>
		</div>
	</div>

	{#if isArchivedView}
		<div class="agreement-doc-archive-banner">
			Ini adalah arsip <b>Version {displayVersion}</b> — agreement ini sudah diperbarui lewat renewal ke
			<b>Version {currentVersion}</b> (versi aktif saat ini).
			<button
				type="button"
				class="btn btn-text"
				style="padding:0; margin-left:4px;"
				onclick={goToCurrentVersion}>Lihat versi aktif →</button
			>
		</div>
	{/if}

	<div class="agreement-doc">
		<div class="agreement-doc-header">
			<h1>SURAT PERJANJIAN KERJASAMA TRANSPORTASI</h1>
			<div class="agreement-doc-number">
				No. {agreement.idAgreement} ·
				<span class="badge {isArchivedView ? 'badge-wait' : 'badge-planner'}"
					>Version {displayVersion}{isArchivedView ? ' (Diarsipkan)' : ''}</span
				>
			</div>
		</div>

		<p>
			Pada hari ini, perjanjian kerjasama transportasi ini dibuat dan disepakati oleh dan antara pihak-pihak
			sebagai berikut:
		</p>

		<div class="agreement-doc-parties">
			<div class="agreement-doc-party">
				<div class="agreement-doc-party-label">Pihak Pertama (Transporter)</div>
				<div class="agreement-doc-party-name">{transporterName}</div>
			</div>
			<div class="agreement-doc-party">
				<div class="agreement-doc-party-label">Pihak Kedua (Customer)</div>
				<div class="agreement-doc-party-name">{terms.customerNama}</div>
			</div>
		</div>

		<p>
			Kedua belah pihak sepakat untuk mengikatkan diri dalam kerjasama transportasi dengan ketentuan sebagai
			berikut:
		</p>

		<div class="agreement-doc-section">
			<h2>Detail Perjanjian</h2>
			<table class="agreement-doc-table">
				<tbody>
					<tr><td>Tipe Perjanjian</td><td>{agreementTypeLabel(terms.agreementType)}</td></tr>
					<tr><td>Masa Berlaku</td><td>{terms.tanggalMulai} s/d {terms.tanggalBerakhir}</td></tr>
					<tr><td>Cargo Item</td><td>{terms.namaBarang || '-'}</td></tr>
					<tr><td>Cargo Type</td><td>{terms.cargoTypeSpecific || '-'}</td></tr>
					<tr><td>Tipe Harga</td><td>{pricingTypeLabel(terms.pricingType)}</td></tr>
					<tr><td>Harga</td><td>{formatIDR(terms.tarif)}</td></tr>
					{#if terms.pricingType !== 'per-truk' && (terms.tonaseMin || terms.tonaseMax)}
						<tr>
							<td>Minimum/Maximum Load</td>
							<td>{terms.tonaseMin || '-'} s/d {terms.tonaseMax || '-'}</td>
						</tr>
					{/if}
				</tbody>
			</table>
		</div>

		<div class="agreement-doc-section">
			<h2>Rute Pengiriman</h2>
			<div class="agreement-doc-routes">
				<div>
					<div class="agreement-doc-route-label">Titik Muat (Initial Route)</div>
					<ul>
						{#each initialRoutes as r, i (i)}
							<li>{routeLabel(r)}</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="agreement-doc-route-label">Titik Bongkar (Destination Route)</div>
					<ul>
						{#each destinationRoutes as r, i (i)}
							<li>{routeLabel(r)}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>

		{#if truckTypes.length}
			<div class="agreement-doc-section">
				<h2>Tipe Armada</h2>
				<p>{truckTypes.join(', ')}</p>
			</div>
		{/if}

		{#if terms.deskripsi}
			<div class="agreement-doc-section">
				<h2>Deskripsi</h2>
				<p>{terms.deskripsi}</p>
			</div>
		{/if}

		{#if terms.termsAndCondition}
			<div class="agreement-doc-section">
				<h2>Syarat dan Ketentuan</h2>
				<p class="agreement-doc-terms">{terms.termsAndCondition}</p>
			</div>
		{/if}

		<div class="agreement-doc-section">
			<h2>Log Agreement</h2>
			{#each versionLogEntries as entry (entry.version)}
				<div class="invoice-log-item">
					Version {entry.version}
					{entry.version === 1 ? 'dibuat' : 'diperbarui (renewal)'} : {entry.createdAt
						? formatTimestampLabel(new Date(entry.createdAt))
						: '-'} by {entry.createdBy || '-'}
				</div>
			{/each}
			{#if !versionLogEntries.length}
				<div class="invoice-log-item">Belum ada riwayat versi.</div>
			{/if}
		</div>
	</div>
{/if}
