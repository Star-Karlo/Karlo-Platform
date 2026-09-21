<script lang="ts">
	/**
	 * Trackers — the telematics device register, the same one FMS shows.
	 *
	 * Master data owns the devices and the fit history; FMS reads the same
	 * records, so a device fitted here is the device FMS draws the truck
	 * from, and vice versa. This page registers devices (GPS or dashcam),
	 * fits one to a truck, and unfits it. A device on a truck is what
	 * turns the truck's position live on the Control Tower map.
	 */
	import { onMount } from 'svelte';
	import { Plus, Search, Link2, Link2Off, Pencil, Trash2, Radio, Camera } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';
	import Pagination from '$lib/components/revamp/Pagination.svelte';

	let { basePath = '/t' }: { basePath?: string } = $props();

	type Tracker = {
		id: string;
		kind: 'gps' | 'dashcam';
		deviceId: string;
		imei?: string;
		iccid?: string;
		simProvider?: string;
		modelId?: string;
		owner?: string;
		ownerName?: string;
		status: string;
		currentVehicleId?: string | null;
		fittedAt?: string | null;
	};
	type Vehicle = { id: string; licensePlate: string; tracker?: { deviceId?: string } | null };
	type Model = { id: string; name?: string; attributes?: Record<string, any> };

	let trackers = $state<Tracker[]>([]);
	let vehicles = $state<Vehicle[]>([]);
	let models = $state<Model[]>([]);
	let loading = $state(true);
	let error = $state('');

	let search = $state('');
	let kindFilter = $state('all');
	let fitFilter = $state('all');
	let page = $state(1);
	const PAGE_SIZE = 10;

	async function load() {
		loading = true;
		error = '';
		try {
			const [t, v, m] = await Promise.allSettled([
				api.get(ENDPOINTS.trackers.list, { pageSize: 500 }),
				api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
				api.get(ENDPOINTS.catalog.list('trackerModel'), { pageSize: 200 })
			]);
			if (t.status === 'fulfilled') trackers = t.value.data?.data ?? [];
			else error = t.reason?.response?.data?.message ?? 'Gagal memuat daftar tracker.';
			if (v.status === 'fulfilled') vehicles = v.value.data?.data ?? [];
			if (m.status === 'fulfilled') models = m.value.data?.data ?? [];
		} finally {
			loading = false;
		}
	}
	onMount(load);

	const plateOf = (id?: string | null) => vehicles.find((v) => v.id === id)?.licensePlate ?? '';
	const modelName = (id?: string | null) => {
		const m = models.find((x) => x.id === id);
		if (!m) return '';
		const a = m.attributes ?? {};
		return [a.vendor, a.model].filter(Boolean).join(' ') || m.name || '';
	};
	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return trackers.filter((t) => {
			if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
			if (fitFilter === 'fitted' && !t.currentVehicleId) return false;
			if (fitFilter === 'spare' && t.currentVehicleId) return false;
			if (!q) return true;
			return [t.deviceId, t.imei, t.iccid, t.simProvider, plateOf(t.currentVehicleId), modelName(t.modelId)]
				.join(' ')
				.toLowerCase()
				.includes(q);
		});
	});
	let rows = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
	$effect(() => {
		void search, kindFilter, fitFilter;
		page = 1;
	});
	let fittedCount = $derived(trackers.filter((t) => t.currentVehicleId).length);

	// --- Register / edit --------------------------------------------------------
	let showForm = $state(false);
	let editing = $state<Tracker | null>(null);
	let saving = $state(false);
	let form = $state({ kind: 'gps', deviceId: '', iccid: '', simProvider: '', modelId: '', status: 'active' });
	function openAdd() {
		editing = null;
		form = { kind: 'gps', deviceId: '', iccid: '', simProvider: '', modelId: '', status: 'active' };
		showForm = true;
	}
	function openEdit(t: Tracker) {
		editing = t;
		form = { kind: t.kind, deviceId: t.deviceId || t.imei || '', iccid: t.iccid ?? '', simProvider: t.simProvider ?? '', modelId: t.modelId ?? '', status: t.status || 'active' };
		showForm = true;
	}
	async function save() {
		if (!form.deviceId.trim()) {
			toast(form.kind === 'gps' ? 'IMEI wajib diisi' : 'Device ID wajib diisi');
			return;
		}
		saving = true;
		try {
			const payload: Record<string, unknown> = {
				kind: form.kind,
				deviceId: form.deviceId.trim(),
				iccid: form.iccid.trim() || null,
				simProvider: form.simProvider.trim() || null,
				modelId: form.modelId || null,
				status: form.status
			};
			if (editing) await api.put(ENDPOINTS.trackers.one(editing.id), payload);
			else await api.post(ENDPOINTS.trackers.list, payload);
			toast(editing ? 'Tracker diperbarui' : 'Tracker terdaftar');
			showForm = false;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan tracker');
		} finally {
			saving = false;
		}
	}

	// --- Fit / unfit ----------------------------------------------------------
	let fitting = $state<Tracker | null>(null);
	let fitVehicleId = $state('');
	let fitNotes = $state('');
	let vehicleOptions = $derived(
		vehicles
			.filter((v) => !trackers.some((t) => t.currentVehicleId === v.id && t.kind === fitting?.kind))
			.sort((a, b) => a.licensePlate.localeCompare(b.licensePlate))
			.map((v) => ({ value: v.id, label: v.licensePlate }))
	);
	function openFit(t: Tracker) {
		fitting = t;
		fitVehicleId = '';
		fitNotes = '';
	}
	async function submitFit() {
		if (!fitting || !fitVehicleId) return;
		saving = true;
		try {
			await api.post(`${ENDPOINTS.trackers.one(fitting.id)}/fit`, { vehicleId: fitVehicleId, installNotes: fitNotes.trim() || null });
			toast(`${fitting.deviceId || fitting.imei} dipasang ke ${plateOf(fitVehicleId)}`);
			fitting = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memasang tracker');
		} finally {
			saving = false;
		}
	}
	let unfitting = $state<Tracker | null>(null);
	async function submitUnfit() {
		if (!unfitting) return;
		saving = true;
		try {
			await api.post(`${ENDPOINTS.trackers.one(unfitting.id)}/unfit`, {});
			toast(`${unfitting.deviceId || unfitting.imei} dilepas dari ${plateOf(unfitting.currentVehicleId)}`);
			unfitting = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal melepas tracker');
		} finally {
			saving = false;
		}
	}
	let removing = $state<Tracker | null>(null);
	async function submitRemove() {
		if (!removing) return;
		saving = true;
		try {
			await api.delete(ENDPOINTS.trackers.one(removing.id));
			toast('Tracker dihapus');
			removing = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus tracker');
		} finally {
			saving = false;
		}
	}
	const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
</script>

<div class="page-head">
	<div><h1>Trackers</h1></div>
	<button class="btn btn-primary" onclick={openAdd}><Plus size={14} /> Daftarkan Tracker</button>
</div>

{#if error}<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>{/if}

<div class="fleet-search-row">
	<div class="field">
		<label for="trk-search">Search by</label>
		<input id="trk-search" type="text" bind:value={search} placeholder="IMEI, device ID, ICCID, plat nomor…" />
	</div>
	<div class="field">
		<label for="trk-kind">Jenis</label>
		<FieldSelect bind:value={kindFilter} options={[{ value: 'all', label: 'Semua Jenis' }, { value: 'gps', label: 'GPS' }, { value: 'dashcam', label: 'Dashcam' }]} compact />
	</div>
	<div class="field">
		<label for="trk-fit">Pemasangan</label>
		<FieldSelect bind:value={fitFilter} options={[{ value: 'all', label: 'Semua' }, { value: 'fitted', label: 'Terpasang' }, { value: 'spare', label: 'Belum terpasang' }]} compact />
	</div>
</div>

<div class="card card-pad">
	<div class="insight-fleet-head" style="margin-bottom:10px;">
		<h2 style="font-size:15px; margin:0;">Perangkat</h2>
		<span class="insight-fleet-count">{filtered.length} tracker · {fittedCount} terpasang</span>
	</div>
	<div class="table-wrap">
		<table class="fleet-table trackers-table">
			<thead>
				<tr><th>Perangkat</th><th>Model</th><th>SIM</th><th>Terpasang di</th><th>Status</th><th>Aksi</th></tr>
			</thead>
			<tbody>
				{#if loading}
					<tr><td colspan="6"><div class="empty">Memuat…</div></td></tr>
				{:else if !filtered.length}
					<tr><td colspan="6"><div class="empty"><div class="eic">📡</div>{trackers.length ? 'Tidak ada tracker yang cocok dengan filter ini.' : 'Belum ada tracker terdaftar. Daftarkan perangkat GPS atau dashcam, lalu pasang ke truck.'}</div></td></tr>
				{/if}
				{#each rows as t (t.id)}
					<tr>
						<td>
							<div class="trk-device">
								<span class="trk-kind" title={t.kind === 'gps' ? 'GPS tracker' : 'Dashcam'}>{#if t.kind === 'gps'}<Radio size={14} />{:else}<Camera size={14} />{/if}</span>
								<div>
									<div class="mono" style="font-weight:700;">{t.deviceId || t.imei}</div>
									<div class="hint">{t.kind === 'gps' ? 'IMEI' : 'Device ID'}{#if t.ownerName} · {t.ownerName}{:else if t.owner} · {t.owner}{/if}</div>
								</div>
							</div>
						</td>
						<td>{modelName(t.modelId) || '—'}</td>
						<td>{#if t.iccid || t.simProvider}<span class="mono">{t.iccid ?? ''}</span>{#if t.simProvider}<div class="hint">{t.simProvider}</div>{/if}{:else}—{/if}</td>
						<td>
							{#if t.currentVehicleId}
								<span class="pairing-ok">{plateOf(t.currentVehicleId) || t.currentVehicleId}</span>
								<div class="hint">sejak {fmt(t.fittedAt)}</div>
							{:else}
								<span class="no-pairing">Belum terpasang</span>
							{/if}
						</td>
						<td><span class="badge" class:badge-active={t.status === 'active'} class:badge-fail={t.status !== 'active'}>{t.status || 'active'}</span></td>
						<td>
							<div class="action-cell">
								{#if t.currentVehicleId}
									<button class="mini-icon-btn-del" title="Lepas dari truck" onclick={() => (unfitting = t)}><Link2Off size={14} /></button>
								{:else}
									<button class="mini-icon-btn-dark" title="Pasang ke truck" disabled={t.status !== 'active' && !!t.status} onclick={() => openFit(t)}><Link2 size={14} /></button>
								{/if}
								<button class="mini-icon-btn" title="Ubah" onclick={() => openEdit(t)}><Pencil size={14} /></button>
								<button class="mini-icon-btn-del" title="Hapus" disabled={!!t.currentVehicleId} onclick={() => (removing = t)}><Trash2 size={14} /></button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{#if filtered.length > PAGE_SIZE}<Pagination totalItems={filtered.length} bind:page pageSize={PAGE_SIZE} />{/if}
</div>

{#if showForm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) showForm = false; }}>
		<div class="modal-box" role="dialog" aria-modal="true">
			<h3>{editing ? 'Ubah Tracker' : 'Daftarkan Tracker'}</h3>
			<div class="field">
				<label for="trk-form-kind">Jenis <span class="req">*</span></label>
				<FieldSelect bind:value={form.kind} options={[{ value: 'gps', label: 'GPS tracker' }, { value: 'dashcam', label: 'Dashcam' }]} disabled={!!editing} />
			</div>
			<div class="field">
				<label for="trk-form-id">{form.kind === 'gps' ? 'IMEI' : 'Device ID'} <span class="req">*</span></label>
				<input id="trk-form-id" type="text" bind:value={form.deviceId} disabled={!!editing} placeholder={form.kind === 'gps' ? '15 digit, cth. 864454076648348' : 'ID perangkat kamera'} />
			</div>
			<div class="two-col">
				<div class="field"><label for="trk-form-iccid">ICCID (SIM)</label><input id="trk-form-iccid" type="text" bind:value={form.iccid} placeholder="Opsional" /></div>
				<div class="field"><label for="trk-form-sim">Provider SIM</label><input id="trk-form-sim" type="text" bind:value={form.simProvider} placeholder="cth. Telkomsel" /></div>
			</div>
			<div class="field">
				<label for="trk-form-model">Model</label>
				<FieldSelect bind:value={form.modelId} options={[{ value: '', label: '— Tanpa model —' }, ...models.map((m) => ({ value: m.id, label: modelName(m.id) || m.id }))]} placeholder="Pilih model" />
			</div>
			<div class="field">
				<label for="trk-form-status">Status</label>
				<FieldSelect bind:value={form.status} options={[{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Non-aktif' }, { value: 'retired', label: 'Pensiun' }]} />
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={() => (showForm = false)}>Batal</button>
				<button class="btn btn-primary" disabled={saving} onclick={save}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
			</div>
		</div>
	</div>
{/if}

{#if fitting}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) fitting = null; }}>
		<div class="modal-box" role="dialog" aria-modal="true">
			<h3>Pasang {fitting.deviceId || fitting.imei} ke truck</h3>
			<p class="hint" style="margin-bottom:12px;">Truck yang sudah punya {fitting.kind === 'gps' ? 'GPS tracker' : 'dashcam'} tidak ditampilkan — lepas dulu perangkat lamanya.</p>
			<div class="field">
				<label for="trk-fit-vehicle">Truck <span class="req">*</span></label>
				<FieldSelect bind:value={fitVehicleId} options={vehicleOptions} searchable placeholder="Pilih plat nomor" />
			</div>
			<div class="field">
				<label for="trk-fit-notes">Catatan pemasangan</label>
				<input id="trk-fit-notes" type="text" bind:value={fitNotes} placeholder="Opsional — teknisi, lokasi pemasangan…" />
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={() => (fitting = null)}>Batal</button>
				<button class="btn btn-primary" disabled={saving || !fitVehicleId} onclick={submitFit}>{saving ? 'Memasang…' : 'Pasang'}</button>
			</div>
		</div>
	</div>
{/if}

<ConfirmModal
	open={!!unfitting}
	title="Lepas tracker?"
	message={`Perangkat <b>${unfitting?.deviceId || unfitting?.imei || ''}</b> akan dilepas dari <b>${plateOf(unfitting?.currentVehicleId)}</b>. Posisi truck tidak lagi diperbarui dari perangkat ini sampai dipasang lagi.`}
	confirmLabel="Ya, Lepas"
	busy={saving}
	onConfirm={submitUnfit}
	onClose={() => (unfitting = null)}
/>
<ConfirmModal
	open={!!removing}
	title="Hapus tracker?"
	message={`Perangkat <b>${removing?.deviceId || removing?.imei || ''}</b> akan dihapus dari daftar. Riwayat pemasangannya tetap tersimpan.`}
	confirmLabel="Ya, Hapus"
	busy={saving}
	onConfirm={submitRemove}
	onClose={() => (removing = null)}
/>

<style>
	.trackers-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.trackers-table th { text-align: left; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--on-surface-variant); padding: 10px 12px; border-bottom: 1px solid var(--outline-variant); background: var(--surface-alt); }
	.trackers-table td { padding: 10px 12px; border-bottom: 1px solid var(--outline-variant); vertical-align: middle; }
	.trackers-table tr:last-child td { border-bottom: none; }
	.trk-device { display: flex; align-items: center; gap: 10px; }
	.trk-kind { width: 28px; height: 28px; border-radius: 8px; background: var(--primary-container); color: var(--primary); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.action-cell { display: flex; gap: 6px; }
	.action-cell :global(button:disabled) { opacity: 0.4; cursor: not-allowed; }
	.fleet-search-row .field { max-width: 240px; }
</style>
