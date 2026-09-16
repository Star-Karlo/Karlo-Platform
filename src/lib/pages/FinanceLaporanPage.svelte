<script lang="ts">
	/**
	 * Finance — Laporan (prototype FinanceLaporanView): seven reports over
	 * the same journal the Jurnal page shows — automatic lines derived from
	 * Order Kontrak, manual lines from /ledger/entries.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Database, Banknote, Clock, FileText, Eye } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import { loadFinanceData, type FinanceData } from '$lib/revamp/financeData';
	import {
		computeAutoJurnalEntries,
		normalizeManualEntry,
		KAS_BANK,
		PIUTANG_USAHA,
		HUTANG_USAHA
	} from '$lib/revamp/jurnal.js';
	import { coaTypeLabel } from '$lib/revamp/coaTypes.js';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { todayLabel } from '$lib/revamp/date.js';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';

	let { basePath = '/t' }: { basePath?: string } = $props();

	let data = $state<FinanceData | null>(null);
	onMount(async () => {
		const d = await loadFinanceData();
		if (d.failed.length) toast(`Gagal memuat data ${d.failed.join(', ')}`);
		data = d;
	});

	let coa = $derived(data?.coa ?? []);
	function akunNama(kode: string) {
		return coa.find((a) => a.kode === kode)?.nama || kode;
	}
	function typeOf(kode: string) {
		return coa.find((a) => a.kode === kode)?.tipe;
	}
	function isDebitNormal(tipe: string) {
		return tipe === 'aset' || tipe === 'beban';
	}
	function goToOrder(refId: string) {
		goto(`${basePath}/order/kontrak/${refId}`);
	}
	interface AccountRow {
		kode: string;
		nama: string;
		jumlah: number;
	}
	// Per-account totals for every account of `tipe` touched by `entries`.
	// `normalSide` is which side of the posting grows that type's balance
	// (debit for Aset/Beban, credit for Kewajiban/Modal/Pendapatan).
	function accountRowsByType(entries: any[], tipe: string, normalSide: 'debit' | 'credit'): AccountRow[] {
		const map: Record<string, AccountRow> = {};
		for (const e of entries) {
			if (typeOf(e.akunDebitKode) === tipe) {
				const acc = coa.find((a) => a.kode === e.akunDebitKode)!;
				map[acc.kode] = map[acc.kode] || { kode: acc.kode, nama: acc.nama, jumlah: 0 };
				map[acc.kode].jumlah += normalSide === 'debit' ? e.jumlah : -e.jumlah;
			}
			if (typeOf(e.akunKreditKode) === tipe) {
				const acc = coa.find((a) => a.kode === e.akunKreditKode)!;
				map[acc.kode] = map[acc.kode] || { kode: acc.kode, nama: acc.nama, jumlah: 0 };
				map[acc.kode].jumlah += normalSide === 'debit' ? -e.jumlah : e.jumlah;
			}
		}
		return Object.values(map).filter((r) => r.jumlah !== 0);
	}

	let autoEntries = $derived<any[]>(
		data ? computeAutoJurnalEntries(data.orders, data.agreements, data.tripAllowance) : []
	);
	let manualEntries = $derived<any[]>(data ? data.manual.map(normalizeManualEntry) : []);
	let allEntries = $derived([...autoEntries, ...manualEntries].sort((a, b) => b.tanggal - a.tanggal));

	// ---------- Report tabs ----------
	const REPORT_TABS = [
		{ value: 'ringkasan', label: 'Laporan Keuangan' },
		{ value: 'buku-besar', label: 'Buku Besar' },
		{ value: 'neraca', label: 'Neraca' },
		{ value: 'laba-rugi', label: 'Laba Rugi' },
		{ value: 'arus-kas', label: 'Arus Kas' },
		{ value: 'piutang', label: 'Piutang Usaha' },
		{ value: 'hutang', label: 'Hutang Usaha' }
	];
	let activeReport = $state('ringkasan');
	const POINT_IN_TIME_REPORTS = new Set(['neraca', 'piutang', 'hutang']);
	let usesPeriodFilter = $derived(!POINT_IN_TIME_REPORTS.has(activeReport));

	// ---------- Period filter ----------
	const periodTabs = [
		{ value: 'hari', label: 'Hari ini' },
		{ value: 'bulan', label: 'Bulan ini' },
		{ value: 'semua', label: 'Semua periode' },
		{ value: 'custom', label: 'Custom' }
	];
	let periodFilter = $state('bulan');
	let customFrom = $state('');
	let customTo = $state('');
	function inPeriod(entry: any) {
		if (periodFilter === 'semua') return true;
		const d: Date = entry.tanggal;
		const now = new Date();
		if (periodFilter === 'hari') return d.toDateString() === now.toDateString();
		if (periodFilter === 'bulan')
			return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
		if (periodFilter === 'custom') {
			if (customFrom && entry.tanggalLabel < customFrom) return false;
			if (customTo && entry.tanggalLabel > customTo) return false;
			return true;
		}
		return true;
	}
	let periodEntries = $derived(allEntries.filter(inPeriod));
	let periodLabel = $derived(periodTabs.find((p) => p.value === periodFilter)?.label || '');

	// ---------- Laba Rugi ----------
	let labaRugiData = $derived.by(() => {
		const pendapatanRows = accountRowsByType(periodEntries, 'pendapatan', 'credit');
		const bebanRows = accountRowsByType(periodEntries, 'beban', 'debit');
		const totalPendapatan = pendapatanRows.reduce((s, r) => s + r.jumlah, 0);
		const totalBeban = bebanRows.reduce((s, r) => s + r.jumlah, 0);
		return { pendapatanRows, bebanRows, totalPendapatan, totalBeban, labaRugi: totalPendapatan - totalBeban };
	});

	// ---------- Neraca ----------
	let neracaGroups = $derived.by(() => {
		const asetRows = accountRowsByType(allEntries, 'aset', 'debit');
		const kewajibanRows = accountRowsByType(allEntries, 'kewajiban', 'credit');
		const modalRows = accountRowsByType(allEntries, 'modal', 'credit');
		const pendapatanRows = accountRowsByType(allEntries, 'pendapatan', 'credit');
		const bebanRows = accountRowsByType(allEntries, 'beban', 'debit');
		const labaBerjalan =
			pendapatanRows.reduce((s, r) => s + r.jumlah, 0) - bebanRows.reduce((s, r) => s + r.jumlah, 0);
		const totalAset = asetRows.reduce((s, r) => s + r.jumlah, 0);
		const totalKewajiban = kewajibanRows.reduce((s, r) => s + r.jumlah, 0);
		const totalModal = modalRows.reduce((s, r) => s + r.jumlah, 0) + labaBerjalan;
		return { asetRows, kewajibanRows, modalRows, labaBerjalan, totalAset, totalKewajiban, totalModal };
	});

	let ringkasan = $derived({
		pendapatan: labaRugiData.totalPendapatan,
		beban: labaRugiData.totalBeban,
		labaRugi: labaRugiData.labaRugi,
		totalAset: neracaGroups.totalAset,
		totalKewajiban: neracaGroups.totalKewajiban,
		totalModal: neracaGroups.totalModal
	});

	// ---------- Buku Besar ----------
	let bukuBesarKode = $state('');
	let coaOptions = $derived(
		[...coa]
			.sort((a, b) => a.kode.localeCompare(b.kode))
			.map((a) => ({ value: a.kode, label: `${a.kode} — ${a.nama}` }))
	);
	let bukuBesarSummary = $derived.by(() =>
		[...coa]
			.sort((a, b) => a.kode.localeCompare(b.kode))
			.map((account) => {
				const debitNormal = isDebitNormal(account.tipe);
				let totalDebit = 0,
					totalKredit = 0,
					mutasi = 0;
				for (const e of periodEntries) {
					if (e.akunDebitKode === account.kode) {
						totalDebit += e.jumlah;
						mutasi++;
					}
					if (e.akunKreditKode === account.kode) {
						totalKredit += e.jumlah;
						mutasi++;
					}
				}
				const saldo = debitNormal ? totalDebit - totalKredit : totalKredit - totalDebit;
				return {
					kode: account.kode,
					nama: account.nama,
					tipe: account.tipe,
					totalDebit,
					totalKredit,
					saldo,
					mutasi
				};
			})
			.filter((r) => r.mutasi > 0)
	);
	function lihatDetailAkun(kode: string) {
		bukuBesarKode = kode;
	}
	let bukuBesarRows = $derived.by(() => {
		if (!bukuBesarKode) return [];
		const account = coa.find((a) => a.kode === bukuBesarKode);
		if (!account) return [];
		const debitNormal = isDebitNormal(account.tipe);
		const entries = [...periodEntries]
			.filter((e) => e.akunDebitKode === bukuBesarKode || e.akunKreditKode === bukuBesarKode)
			.sort((a, b) => a.tanggal - b.tanggal);
		let balance = 0;
		return entries.map((e) => {
			const isDebit = e.akunDebitKode === bukuBesarKode;
			const debit = isDebit ? e.jumlah : 0;
			const kredit = !isDebit ? e.jumlah : 0;
			balance += debitNormal ? debit - kredit : kredit - debit;
			return { ...e, debit, kredit, balance };
		});
	});

	// ---------- Arus Kas ----------
	let arusKasData = $derived.by(() => {
		const rows = periodEntries
			.filter((e) => e.akunDebitKode === KAS_BANK || e.akunKreditKode === KAS_BANK)
			.map((e) => ({
				...e,
				arah: e.akunDebitKode === KAS_BANK ? 'masuk' : 'keluar',
				lawan: akunNama(e.akunDebitKode === KAS_BANK ? e.akunKreditKode : e.akunDebitKode)
			}));
		const kasMasuk = rows.filter((r) => r.arah === 'masuk').reduce((s, r) => s + r.jumlah, 0);
		const kasKeluar = rows.filter((r) => r.arah === 'keluar').reduce((s, r) => s + r.jumlah, 0);
		return { rows, kasMasuk, kasKeluar, arusBersih: kasMasuk - kasKeluar };
	});

	// ---------- Piutang / Hutang ----------
	let piutangData = $derived.by(() => {
		const rows = allEntries.filter((e) => e.akunDebitKode === PIUTANG_USAHA);
		return { rows, total: rows.reduce((s, r) => s + r.jumlah, 0) };
	});
	let hutangData = $derived.by(() => {
		const rows = allEntries.filter((e) => e.akunKreditKode === HUTANG_USAHA);
		return { rows, total: rows.reduce((s, r) => s + r.jumlah, 0) };
	});

	let recentEntries = $derived(periodEntries.slice(0, 8));
</script>

<div class="page-head">
	<div>
		<h1>Finance — Laporan</h1>
	</div>
</div>

<div class="card card-pad" style="margin-bottom:16px;">
	<div class="method-tabs">
		{#each REPORT_TABS as t (t.value)}
			<button
				type="button"
				class="method-tab"
				class:active={activeReport === t.value}
				onclick={() => (activeReport = t.value)}
			>
				{t.label}
			</button>
		{/each}
	</div>

	{#if usesPeriodFilter}
		<div class="method-tabs" style="margin-top:16px;">
			{#each periodTabs as p (p.value)}
				<button
					type="button"
					class="method-tab"
					class:active={periodFilter === p.value}
					onclick={() => (periodFilter = p.value)}
				>
					{p.label}
				</button>
			{/each}
		</div>
		{#if periodFilter === 'custom'}
			<div class="two-col" style="margin-top:16px; margin-bottom:0;">
				<div class="field" style="margin-bottom:0;">
					<label for="lp-from">Dari Tanggal</label>
					<input id="lp-from" type="date" bind:value={customFrom} />
				</div>
				<div class="field" style="margin-bottom:0;">
					<label for="lp-to">Sampai Tanggal</label>
					<input id="lp-to" type="date" bind:value={customTo} />
				</div>
			</div>
		{/if}
	{:else}
		<div class="hint" style="margin-top:14px;">Per hari ini — {todayLabel()}</div>
	{/if}
</div>

{#snippet calcRows(rows: AccountRow[])}
	{#each rows as r (r.kode)}
		<div class="invoice-calc-row">
			<span class="invoice-calc-label">{r.nama}</span>
			<span class="invoice-calc-value">{formatIDR(r.jumlah)}</span>
		</div>
	{/each}
{/snippet}

{#snippet refTable(rows: any[], total: number, label: string, emptyText: string)}
	{#if !rows.length}
		<div class="empty">
			<div class="eic">🧾</div>
			{emptyText}
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead><tr><th>Tanggal</th><th>Ref</th><th>Keterangan</th><th>Jumlah</th><th>Aksi</th></tr></thead>
				<tbody>
					{#each rows as r (r.id)}
						<tr>
							<td>{r.tanggalLabel}</td>
							<td class="mono">{r.ref || '-'}</td>
							<td>{r.keterangan}</td>
							<td><b>{formatIDR(r.jumlah)}</b></td>
							<td>
								{#if r.refType === 'order'}
									<button class="btn btn-outline btn-sm" onclick={() => goToOrder(r.refId)}>
										<Eye size={14} /> Lihat Order
									</button>
								{:else}<span class="hint">-</span>{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<div class="invoice-total-row">
			<span class="invoice-calc-label">{label}</span>
			<span class="invoice-total-value">{formatIDR(total)}</span>
		</div>
	{/if}
{/snippet}

{#if activeReport === 'ringkasan'}
	<div class="card card-pad" style="margin-bottom:16px;">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Database size={16} /> Ringkasan — {periodLabel}
		</div>
		<div class="report-kpi-grid">
			<div class="report-kpi-card">
				<div class="report-kpi-label">Total Pendapatan</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.pendapatan)}</div>
			</div>
			<div class="report-kpi-card">
				<div class="report-kpi-label">Total Beban</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.beban)}</div>
			</div>
			<div
				class="report-kpi-card"
				class:report-kpi-card--positive={ringkasan.labaRugi >= 0}
				class:report-kpi-card--negative={ringkasan.labaRugi < 0}
			>
				<div class="report-kpi-label">Laba / Rugi Bersih</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.labaRugi)}</div>
			</div>
			<div class="report-kpi-card">
				<div class="report-kpi-label">Total Aset (hari ini)</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.totalAset)}</div>
			</div>
			<div class="report-kpi-card">
				<div class="report-kpi-label">Total Kewajiban (hari ini)</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.totalKewajiban)}</div>
			</div>
			<div class="report-kpi-card">
				<div class="report-kpi-label">Total Modal (hari ini)</div>
				<div class="report-kpi-value">{formatIDR(ringkasan.totalModal)}</div>
			</div>
		</div>
	</div>

	<div class="invoice-two-col" style="margin-bottom:16px;">
		<div class="card card-pad">
			<div class="invoice-section-title" style="margin-bottom:6px;">
				<Banknote size={16} /> Pendapatan & Beban — {periodLabel}
			</div>
			<div class="invoice-calc-block invoice-calc-block--plain">
				<div class="invoice-subcard-head">Pendapatan</div>
				{@render calcRows(labaRugiData.pendapatanRows)}
				{#if !labaRugiData.pendapatanRows.length}<div class="empty">
						<div class="eic">📊</div>
						Belum ada pendapatan periode ini.
					</div>{/if}
				<div class="invoice-subcard-head" style="margin-top:16px;">Beban</div>
				{@render calcRows(labaRugiData.bebanRows)}
				{#if !labaRugiData.bebanRows.length}<div class="empty">
						<div class="eic">📊</div>
						Belum ada beban periode ini.
					</div>{/if}
				<div class="invoice-total-row">
					<span class="invoice-calc-label">Laba / Rugi Bersih</span>
					<span class="invoice-total-value">{formatIDR(labaRugiData.labaRugi)}</span>
				</div>
			</div>
		</div>

		<div class="card card-pad">
			<div class="invoice-section-title" style="margin-bottom:6px;">
				<Database size={16} /> Posisi Keuangan — Per {todayLabel()}
			</div>
			<div class="invoice-calc-block invoice-calc-block--plain">
				<div class="invoice-subcard-head">Aset</div>
				{@render calcRows(neracaGroups.asetRows)}
				<div class="invoice-calc-row invoice-calc-row--bold">
					<span class="invoice-calc-label">Total Aset</span>
					<span class="invoice-calc-value">{formatIDR(neracaGroups.totalAset)}</span>
				</div>
				<div class="invoice-subcard-head" style="margin-top:16px;">Kewajiban + Modal</div>
				{@render calcRows(neracaGroups.kewajibanRows)}
				<div class="invoice-calc-row">
					<span class="invoice-calc-label">Laba/Rugi Berjalan (Modal)</span>
					<span class="invoice-calc-value">{formatIDR(neracaGroups.totalModal)}</span>
				</div>
				<div class="invoice-total-row">
					<span class="invoice-calc-label">Total Kewajiban + Modal</span>
					<span class="invoice-total-value"
						>{formatIDR(neracaGroups.totalKewajiban + neracaGroups.totalModal)}</span
					>
				</div>
			</div>
		</div>
	</div>

	<div class="invoice-two-col" style="margin-bottom:16px;">
		<div class="card card-pad">
			<div class="invoice-section-title" style="margin-bottom:14px;">
				<Banknote size={16} /> Arus Kas — {periodLabel}
			</div>
			<div class="report-kpi-grid" style="grid-template-columns:repeat(3, 1fr);">
				<div class="report-kpi-card report-kpi-card--positive">
					<div class="report-kpi-label">Kas Masuk</div>
					<div class="report-kpi-value">{formatIDR(arusKasData.kasMasuk)}</div>
				</div>
				<div class="report-kpi-card report-kpi-card--negative">
					<div class="report-kpi-label">Kas Keluar</div>
					<div class="report-kpi-value">{formatIDR(arusKasData.kasKeluar)}</div>
				</div>
				<div class="report-kpi-card">
					<div class="report-kpi-label">Bersih</div>
					<div class="report-kpi-value">{formatIDR(arusKasData.arusBersih)}</div>
				</div>
			</div>
		</div>

		<div class="card card-pad">
			<div class="invoice-section-title" style="margin-bottom:14px;">
				<Banknote size={16} /> Piutang & Hutang — Per {todayLabel()}
			</div>
			<div class="report-kpi-grid" style="grid-template-columns:repeat(2, 1fr);">
				<div class="report-kpi-card">
					<div class="report-kpi-label">Piutang Usaha ({piutangData.rows.length})</div>
					<div class="report-kpi-value">{formatIDR(piutangData.total)}</div>
				</div>
				<div class="report-kpi-card">
					<div class="report-kpi-label">Hutang Usaha ({hutangData.rows.length})</div>
					<div class="report-kpi-value">{formatIDR(hutangData.total)}</div>
				</div>
			</div>
		</div>
	</div>

	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Clock size={16} /> Aktivitas Jurnal Terbaru — {periodLabel}
		</div>
		{#if !recentEntries.length}
			<div class="empty">
				<div class="eic">📒</div>
				Belum ada aktivitas keuangan pada periode ini.
			</div>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr
							><th>Tanggal</th><th>Keterangan</th><th>Akun Debit</th><th>Akun Kredit</th><th>Jumlah</th><th
								>Jenis</th
							></tr
						>
					</thead>
					<tbody>
						{#each recentEntries as e (e.id)}
							<tr>
								<td>{e.tanggalLabel}</td>
								<td>{e.keterangan}</td>
								<td>{akunNama(e.akunDebitKode)}</td>
								<td>{akunNama(e.akunKreditKode)}</td>
								<td><b>{formatIDR(e.jumlah)}</b></td>
								<td
									><span
										class="badge"
										class:badge-planner={e.tipe === 'otomatis'}
										class:badge-self={e.tipe !== 'otomatis'}
										>{e.tipe === 'otomatis' ? 'Otomatis' : 'Manual'}</span
									></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else if activeReport === 'buku-besar'}
	<div class="card card-pad" style="margin-bottom:16px;">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<FileText size={16} /> Buku Besar — Seluruh Akun — {periodLabel}
		</div>
		{#if !bukuBesarSummary.length}
			<div class="empty">
				<div class="eic">📒</div>
				Belum ada aktivitas jurnal & transaksi order pada periode ini.
			</div>
		{:else}
			<div class="table-wrap">
				<table>
					<thead>
						<tr
							><th>Kode</th><th>Nama Akun</th><th>Tipe</th><th>Total Debit</th><th>Total Kredit</th><th
								>Saldo</th
							><th>Aksi</th></tr
						>
					</thead>
					<tbody>
						{#each bukuBesarSummary as r (r.kode)}
							<tr>
								<td class="mono">{r.kode}</td>
								<td><b>{r.nama}</b></td>
								<td>{coaTypeLabel(r.tipe)}</td>
								<td>{formatIDR(r.totalDebit)}</td>
								<td>{formatIDR(r.totalKredit)}</td>
								<td><b>{formatIDR(r.saldo)}</b></td>
								<td
									><button class="btn btn-outline btn-sm" onclick={() => lihatDetailAkun(r.kode)}
										>Lihat Detail</button
									></td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<FileText size={16} /> Rincian Buku Besar per Akun — {periodLabel}
		</div>
		<div class="field" style="max-width:420px;">
			<label for="bb-akun">Pilih Akun</label>
			<FieldSelect bind:value={bukuBesarKode} options={coaOptions} placeholder="Pilih akun" />
		</div>

		{#if !bukuBesarKode}
			<div class="empty">
				<div class="eic">📒</div>
				Pilih akun untuk melihat rinciannya, atau klik "Lihat Detail" pada tabel di atas.
			</div>
		{:else if !bukuBesarRows.length}
			<div class="empty">
				<div class="eic">📒</div>
				Belum ada mutasi untuk akun ini pada periode ini.
			</div>
		{:else}
			<div class="table-wrap">
				<table>
					<thead
						><tr
							><th>Tanggal</th><th>Keterangan</th><th>Ref</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr
						></thead
					>
					<tbody>
						{#each bukuBesarRows as r (r.id)}
							<tr>
								<td>{r.tanggalLabel}</td>
								<td>{r.keterangan}</td>
								<td
									>{#if r.ref}<span class="mono">{r.ref}</span>{:else}<span class="hint">Manual</span
										>{/if}</td
								>
								<td>{r.debit ? formatIDR(r.debit) : '-'}</td>
								<td>{r.kredit ? formatIDR(r.kredit) : '-'}</td>
								<td><b>{formatIDR(r.balance)}</b></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else if activeReport === 'neraca'}
	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Database size={16} /> Neraca — Per {todayLabel()}
		</div>
		<div class="invoice-two-col">
			<div class="invoice-calc-block invoice-calc-block--plain">
				<div class="invoice-subcard-head">Aset</div>
				{@render calcRows(neracaGroups.asetRows)}
				<div class="invoice-total-row">
					<span class="invoice-calc-label">Total Aset</span>
					<span class="invoice-total-value">{formatIDR(neracaGroups.totalAset)}</span>
				</div>
			</div>
			<div class="invoice-calc-block invoice-calc-block--plain">
				<div class="invoice-subcard-head">Kewajiban</div>
				{@render calcRows(neracaGroups.kewajibanRows)}
				<div class="invoice-calc-row invoice-calc-row--bold">
					<span class="invoice-calc-label">Total Kewajiban</span>
					<span class="invoice-calc-value">{formatIDR(neracaGroups.totalKewajiban)}</span>
				</div>
				<div class="invoice-subcard-head" style="margin-top:18px;">Modal</div>
				{@render calcRows(neracaGroups.modalRows)}
				<div class="invoice-calc-row">
					<span class="invoice-calc-label">Laba/Rugi Berjalan</span>
					<span class="invoice-calc-value">{formatIDR(neracaGroups.labaBerjalan)}</span>
				</div>
				<div class="invoice-total-row">
					<span class="invoice-calc-label">Total Kewajiban + Modal</span>
					<span class="invoice-total-value"
						>{formatIDR(neracaGroups.totalKewajiban + neracaGroups.totalModal)}</span
					>
				</div>
			</div>
		</div>
	</div>
{:else if activeReport === 'laba-rugi'}
	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Banknote size={16} /> Laba Rugi — {periodLabel}
		</div>
		<div class="invoice-calc-block invoice-calc-block--plain">
			<div class="invoice-subcard-head">Pendapatan</div>
			{@render calcRows(labaRugiData.pendapatanRows)}
			<div class="invoice-calc-row invoice-calc-row--bold">
				<span class="invoice-calc-label">Total Pendapatan</span>
				<span class="invoice-calc-value">{formatIDR(labaRugiData.totalPendapatan)}</span>
			</div>
			<div class="invoice-subcard-head" style="margin-top:18px;">Beban</div>
			{@render calcRows(labaRugiData.bebanRows)}
			<div class="invoice-calc-row invoice-calc-row--bold">
				<span class="invoice-calc-label">Total Beban</span>
				<span class="invoice-calc-value">{formatIDR(labaRugiData.totalBeban)}</span>
			</div>
			<div class="invoice-total-row">
				<span class="invoice-calc-label">Laba / Rugi Bersih</span>
				<span class="invoice-total-value">{formatIDR(labaRugiData.labaRugi)}</span>
			</div>
		</div>
		{#if !labaRugiData.pendapatanRows.length && !labaRugiData.bebanRows.length}
			<div class="empty">
				<div class="eic">📊</div>
				Belum ada transaksi pendapatan/beban pada periode ini.
			</div>
		{/if}
	</div>
{:else if activeReport === 'arus-kas'}
	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Banknote size={16} /> Arus Kas — {periodLabel}
		</div>
		<div class="report-kpi-grid" style="margin-bottom:20px;">
			<div class="report-kpi-card report-kpi-card--positive">
				<div class="report-kpi-label">Kas Masuk</div>
				<div class="report-kpi-value">{formatIDR(arusKasData.kasMasuk)}</div>
			</div>
			<div class="report-kpi-card report-kpi-card--negative">
				<div class="report-kpi-label">Kas Keluar</div>
				<div class="report-kpi-value">{formatIDR(arusKasData.kasKeluar)}</div>
			</div>
			<div class="report-kpi-card">
				<div class="report-kpi-label">Arus Kas Bersih</div>
				<div class="report-kpi-value">{formatIDR(arusKasData.arusBersih)}</div>
			</div>
		</div>

		{#if !arusKasData.rows.length}
			<div class="empty">
				<div class="eic">💵</div>
				Belum ada mutasi Kas/Bank pada periode ini.
			</div>
		{:else}
			<div class="table-wrap">
				<table>
					<thead
						><tr><th>Tanggal</th><th>Keterangan</th><th>Akun Lawan</th><th>Arah</th><th>Jumlah</th></tr
						></thead
					>
					<tbody>
						{#each arusKasData.rows as r (r.id)}
							<tr>
								<td>{r.tanggalLabel}</td>
								<td>{r.keterangan}</td>
								<td>{r.lawan}</td>
								<td
									><span
										class="badge"
										class:badge-active={r.arah === 'masuk'}
										class:badge-fail={r.arah !== 'masuk'}>{r.arah === 'masuk' ? 'Masuk' : 'Keluar'}</span
									></td
								>
								<td><b>{formatIDR(r.jumlah)}</b></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
{:else if activeReport === 'piutang'}
	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Banknote size={16} /> Piutang Usaha — Per {todayLabel()}
		</div>
		{@render refTable(
			piutangData.rows,
			piutangData.total,
			'Total Piutang Usaha',
			'Tidak ada piutang usaha saat ini.'
		)}
	</div>
{:else if activeReport === 'hutang'}
	<div class="card card-pad">
		<div class="invoice-section-title" style="margin-bottom:14px;">
			<Banknote size={16} /> Hutang Usaha — Per {todayLabel()}
		</div>
		{@render refTable(
			hutangData.rows,
			hutangData.total,
			'Total Hutang Usaha',
			'Tidak ada hutang usaha saat ini.'
		)}
	</div>
{/if}
