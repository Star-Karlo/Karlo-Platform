<script lang="ts">
	/**
	 * Finance — Jurnal (prototype FinanceJurnalView). The automatic lines are
	 * derived from Order Kontrak on every load (jurnal.js); the manual lines
	 * come from /ledger/entries.
	 */
	import { onMount } from 'svelte';
	import { Download, FileText, Pencil, Trash2 } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import { ledger } from '$lib/stores/ledger';
	import { loadFinanceData, type FinanceData } from '$lib/revamp/financeData';
	import { computeAutoJurnalEntries, normalizeManualEntry } from '$lib/revamp/jurnal.js';
	import { coaTypeLabel } from '$lib/revamp/coaTypes.js';
	import { formatIDR } from '$lib/revamp/currency.js';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';

	let { basePath: _basePath = '/t' }: { basePath?: string } = $props();

	let data = $state<FinanceData | null>(null);

	async function load() {
		const d = await loadFinanceData();
		if (d.failed.length) toast(`Gagal memuat data ${d.failed.join(', ')}`);
		data = d;
	}
	onMount(load);

	function akunNama(kode: string) {
		const a = data?.coa.find((x) => x.kode === kode);
		return a ? `${a.nama} (${coaTypeLabel(a.tipe)})` : kode;
	}

	let autoEntries = $derived<any[]>(
		data ? computeAutoJurnalEntries(data.orders, data.agreements, data.tripAllowance) : []
	);
	let manualEntries = $derived<any[]>(data ? data.manual.map(normalizeManualEntry) : []);
	let allEntries = $derived([...autoEntries, ...manualEntries].sort((a, b) => b.tanggal - a.tanggal));

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

	// ---------- Sub-tabs ----------
	let activeTab = $state('semua');
	let tabCounts = $derived({
		semua: periodEntries.length,
		manual: periodEntries.filter((e) => e.tipe === 'manual').length,
		otomatis: periodEntries.filter((e) => e.tipe === 'otomatis').length
	});

	// ---------- Search + akun filter ----------
	let searchText = $state('');
	let akunFilter = $state('');
	let coaOptions = $derived(
		[...(data?.coa ?? [])]
			.sort((a, b) => a.kode.localeCompare(b.kode))
			.map((a) => ({ value: a.kode, label: `${a.kode} — ${a.nama}` }))
	);
	let akunFilterOptions = $derived([{ value: '', label: 'Semua Akun' }, ...coaOptions]);

	let filteredEntries = $derived.by(() => {
		let list = periodEntries;
		if (activeTab !== 'semua') list = list.filter((e) => e.tipe === activeTab);
		if (akunFilter)
			list = list.filter((e) => e.akunDebitKode === akunFilter || e.akunKreditKode === akunFilter);
		const q = searchText.trim().toLowerCase();
		if (q) {
			list = list.filter(
				(e) =>
					e.keterangan.toLowerCase().includes(q) ||
					(e.ref || '').toLowerCase().includes(q) ||
					akunNama(e.akunDebitKode).toLowerCase().includes(q) ||
					akunNama(e.akunKreditKode).toLowerCase().includes(q)
			);
		}
		return list;
	});

	function onExportClick() {
		toast('Fitur export segera hadir');
	}

	// ---------- Entri Manual ----------
	let showEntryModal = $state(false);
	let editingEntryId = $state<string | null>(null);
	let entrySaving = $state(false);
	let entryForm = $state({ tanggal: '', keterangan: '', akunDebitKode: '', akunKreditKode: '', jumlah: 0 });

	function openAddEntry() {
		editingEntryId = null;
		entryForm = {
			tanggal: new Date().toISOString().slice(0, 10),
			keterangan: '',
			akunDebitKode: '',
			akunKreditKode: '',
			jumlah: 0
		};
		showEntryModal = true;
	}
	function openEditEntry(entry: any) {
		const raw = data?.manual.find((x) => x.id === entry.id);
		if (!raw) return;
		editingEntryId = raw.id;
		entryForm = {
			tanggal: raw.tanggal || '',
			keterangan: raw.keterangan || '',
			akunDebitKode: raw.akunDebitKode || '',
			akunKreditKode: raw.akunKreditKode || '',
			jumlah: Number(raw.jumlah) || 0
		};
		showEntryModal = true;
	}
	function closeEntryModal() {
		showEntryModal = false;
	}
	function onEntryOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeEntryModal();
	}

	async function submitEntry() {
		if (
			!entryForm.tanggal ||
			!entryForm.keterangan.trim() ||
			!entryForm.akunDebitKode ||
			!entryForm.akunKreditKode ||
			!Number(entryForm.jumlah)
		) {
			toast('Semua field wajib diisi');
			return;
		}
		if (entryForm.akunDebitKode === entryForm.akunKreditKode) {
			toast('Akun debit dan kredit tidak boleh sama');
			return;
		}
		entrySaving = true;
		try {
			const payload = {
				tanggal: entryForm.tanggal,
				keterangan: entryForm.keterangan.trim(),
				akunDebitKode: entryForm.akunDebitKode,
				akunKreditKode: entryForm.akunKreditKode,
				jumlah: Number(entryForm.jumlah) || 0
			};
			if (editingEntryId) {
				await ledger.updateEntry(editingEntryId, payload);
				toast('Entri jurnal berhasil diperbarui');
			} else {
				await ledger.addEntry(payload);
				toast('Entri jurnal baru berhasil ditambahkan');
			}
			await load();
			closeEntryModal();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan entri jurnal');
		} finally {
			entrySaving = false;
		}
	}

	let removing = $state<any | null>(null);
	let removeBusy = $state(false);
	async function confirmRemove() {
		if (!removing) return;
		removeBusy = true;
		try {
			await ledger.deleteEntry(removing.id);
			removing = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus entri');
		} finally {
			removeBusy = false;
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Finance — Jurnal</h1>
	</div>
	<div style="display:flex; gap:10px;">
		<button class="btn btn-outline" onclick={onExportClick}><Download size={14} /> Export</button>
		<button class="btn btn-primary" onclick={openAddEntry}>+ Entri Baru</button>
	</div>
</div>

<div class="card card-pad" style="margin-bottom:16px;">
	<div class="method-tabs">
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
				<label for="jr-from">Dari Tanggal</label>
				<input id="jr-from" type="date" bind:value={customFrom} />
			</div>
			<div class="field" style="margin-bottom:0;">
				<label for="jr-to">Sampai Tanggal</label>
				<input id="jr-to" type="date" bind:value={customTo} />
			</div>
		</div>
	{/if}
</div>

<div class="card card-pad">
	<div class="invoice-section-title" style="margin-bottom:14px;"><FileText size={16} /> Jurnal Umum</div>

	<div class="method-tabs" style="margin-bottom:14px;">
		<button
			type="button"
			class="method-tab"
			class:active={activeTab === 'semua'}
			onclick={() => (activeTab = 'semua')}
		>
			Semua ({tabCounts.semua})
		</button>
		<button
			type="button"
			class="method-tab"
			class:active={activeTab === 'manual'}
			onclick={() => (activeTab = 'manual')}
		>
			Jurnal Manual ({tabCounts.manual})
		</button>
		<button
			type="button"
			class="method-tab"
			class:active={activeTab === 'otomatis'}
			onclick={() => (activeTab = 'otomatis')}
		>
			Jurnal Otomatis ({tabCounts.otomatis})
		</button>
	</div>

	<div class="two-col">
		<div class="field">
			<input
				type="text"
				bind:value={searchText}
				placeholder="Cari keterangan, akun, atau nomor referensi..."
			/>
		</div>
		<div class="field">
			<FieldSelect bind:value={akunFilter} options={akunFilterOptions} placeholder="Semua Akun" />
		</div>
	</div>

	{#if !filteredEntries.length}
		<div class="empty">
			<div class="eic">📒</div>
			Tidak ada entri jurnal untuk filter ini.
		</div>
	{:else}
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Tanggal</th>
						<th>Keterangan</th>
						<th>Ref</th>
						<th>Akun Debit</th>
						<th>Akun Kredit</th>
						<th>Jumlah</th>
						<th>Aksi</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredEntries as e (e.id)}
						<tr>
							<td>{e.tanggalLabel}</td>
							<td>{e.keterangan}</td>
							<td
								>{#if e.ref}<span class="mono">{e.ref}</span>{:else}<span class="hint">Manual</span>{/if}</td
							>
							<td>{akunNama(e.akunDebitKode)}</td>
							<td>{akunNama(e.akunKreditKode)}</td>
							<td><b>{formatIDR(e.jumlah)}</b></td>
							<td>
								{#if e.tipe === 'manual'}
									<div class="action-cell">
										<button class="mini-icon-btn" title="Edit" onclick={() => openEditEntry(e)}
											><Pencil size={14} /></button
										>
										<button class="mini-icon-btn-del" title="Hapus" onclick={() => (removing = e)}
											><Trash2 size={14} /></button
										>
									</div>
								{:else}
									<span class="hint">Otomatis dari Order</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

{#if showEntryModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onEntryOverlayClick}>
		<div class="modal-box" role="dialog" aria-modal="true">
			<h3>{editingEntryId ? 'Edit Entri Jurnal' : 'Entri Jurnal Baru'}</h3>

			<div class="field">
				<label for="je-tanggal">Tanggal <span class="req">*</span></label>
				<input id="je-tanggal" type="date" bind:value={entryForm.tanggal} />
			</div>
			<div class="field">
				<label for="je-ket">Keterangan <span class="req">*</span></label>
				<input
					id="je-ket"
					type="text"
					bind:value={entryForm.keterangan}
					placeholder="cth. Biaya transfer payment"
				/>
			</div>
			<div class="two-col">
				<div class="field">
					<label for="je-debit">Akun Debit <span class="req">*</span></label>
					<FieldSelect
						bind:value={entryForm.akunDebitKode}
						options={coaOptions}
						placeholder="Pilih akun debit"
					/>
				</div>
				<div class="field">
					<label for="je-kredit">Akun Kredit <span class="req">*</span></label>
					<FieldSelect
						bind:value={entryForm.akunKreditKode}
						options={coaOptions}
						placeholder="Pilih akun kredit"
					/>
				</div>
			</div>
			<div class="field">
				<label for="je-jumlah">Jumlah (Rp) <span class="req">*</span></label>
				<input id="je-jumlah" type="number" bind:value={entryForm.jumlah} placeholder="0" />
			</div>

			<div class="modal-actions">
				<button class="btn btn-outline" onclick={closeEntryModal}>Batal</button>
				<button class="btn btn-primary" disabled={entrySaving} onclick={submitEntry}>
					{entrySaving ? 'Menyimpan...' : 'Simpan'}
				</button>
			</div>
		</div>
	</div>
{/if}

<ConfirmModal
	open={!!removing}
	title="Hapus Entri Jurnal?"
	message={`Entri "<b>${removing?.keterangan ?? ''}</b>" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
	confirmLabel="Ya, Hapus"
	danger={true}
	busy={removeBusy}
	onConfirm={confirmRemove}
	onClose={() => (removing = null)}
/>
