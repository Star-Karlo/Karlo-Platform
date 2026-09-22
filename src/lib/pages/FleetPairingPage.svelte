<script lang="ts">
	/**
	 * My Fleet — trucks and drivers side by side, paired on one page.
	 *
	 * Port of the prototype's FleetHomeView + TruckTable + DriverTable +
	 * PairingAutocomplete. A planner pairing a truck needs both lists at
	 * once: the truck row turns into a typeable driver field, the driver
	 * list grows a checkbox per row, and the suggestion filters (who has
	 * driven this truck most, who has been idle longest) only appear while a
	 * pairing is in progress. Master data holds the pairing itself; the
	 * suggestions come from the order history (business-service).
	 */
	import { onMount, tick } from 'svelte';
	import { Truck, Plus, Search, Check, Pencil, Trash2, CircleDot, Disc3 } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';
	import Pagination from '$lib/components/revamp/Pagination.svelte';
	import { catalog, loadCatalog } from '$lib/stores/catalog';

	let { basePath = '/t' }: { basePath?: string } = $props();

	type Vehicle = {
		id: string;
		licensePlate: string;
		status?: string;
		isAvailable?: boolean;
		currentDriverId?: string | null;
		driver?: { id: string; fullName: string } | null;
		truckBody?: { name: string } | null;
		truckHead?: { name: string } | null;
		truckGroupId?: string | null;
		attributes?: Record<string, any>;
	};
	type Driver = { id: string; fullName: string; phone?: string; status?: string; userId?: string };
	type Activity = { driverId: string; truckId: string; trips: number; lastActiveAt?: string };
	type Live = { truckId: string; city?: string };

	const PAGE_SIZE = 5;
	const PAIRING_OPTIONS = [
		{ value: 'all', label: 'Semua Truck' },
		{ value: 'paired', label: 'Sudah Ada Driver' },
		{ value: 'unpaired', label: 'Belum Ada Driver' }
	];
	const STATUS_OPTIONS = [
		{ value: 'all', label: 'Semua Status' },
		{ value: 'active', label: 'Truck Aktif' },
		{ value: 'inactive', label: 'Truck Non-aktif' }
	];
	const DRIVER_OPTIONS = [
		{ value: 'all', label: 'Semua Driver' },
		{ value: 'paired', label: 'Sudah Terpairing' },
		{ value: 'unpaired', label: 'Belum Terpairing' }
	];

	let vehicles = $state<Vehicle[]>([]);
	let drivers = $state<Driver[]>([]);
	let activity = $state<Activity[]>([]);
	let live = $state<Live[]>([]);
	let loading = $state(true);
	let error = $state('');

	let searchTruck = $state('');
	let searchDriver = $state('');
	let pairingFilter = $state('all');
	let statusFilter = $state('all');
	let groupFilter = $state('all');
	let driverFilter = $state('all');
	let truckPage = $state(1);
	let driverPage = $state(1);
	let sugFreqTruck = $state(false);
	let sugIdle = $state(false);

	// Pairing in progress: the truck whose driver cell is the autocomplete.
	let assigning = $state<string | null>(null);
	let query = $state('');
	let dropdownOpen = $state(false);
	let dropdownStyle = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let saving = $state(false);

	async function load() {
		loading = true;
		error = '';
		void loadCatalog('vehicleGroup');
		try {
			const [v, d] = await Promise.all([
				api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
				api.get(ENDPOINTS.drivers.list, { pageSize: 500 })
			]);
			vehicles = v.data?.data ?? [];
			drivers = d.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Gagal memuat data armada.';
		} finally {
			loading = false;
		}
		// Suggestions and last-known cities are niceties: their absence must
		// not empty the page.
		const [a, l] = await Promise.allSettled([
			api.get(ENDPOINTS.fleet.driverActivity),
			api.get(ENDPOINTS.fleet.live)
		]);
		activity = a.status === 'fulfilled' ? (a.value.data?.data ?? []) : [];
		live = l.status === 'fulfilled' ? (l.value.data?.data ?? l.value.data?.positions ?? []) : [];
	}
	onMount(load);

	const truckOfDriver = $derived(
		new Map(vehicles.filter((v) => v.currentDriverId).map((v) => [v.currentDriverId as string, v]))
	);
	const cityOf = $derived(new Map(live.map((p) => [p.truckId, p.city ?? ''])));
	const lastActive = $derived.by(() => {
		const m = new Map<string, string>();
		for (const a of activity) {
			const prev = m.get(a.driverId);
			if (a.lastActiveAt && (!prev || a.lastActiveAt > prev)) m.set(a.driverId, a.lastActiveAt);
		}
		return m;
	});
	const tripsWith = (driverId: string, truckId: string | null) =>
		truckId ? (activity.find((a) => a.driverId === driverId && a.truckId === truckId)?.trips ?? 0) : 0;
	const idleDays = (driverId: string) => {
		const at = lastActive.get(driverId);
		if (!at) return null;
		return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000));
	};

	function typeLabel(v: Vehicle) {
		return v.truckHead?.name ?? v.truckBody?.name ?? v.attributes?.truckTypeName ?? '';
	}
	function locationOf(v: Vehicle) {
		return cityOf.get(v.id) || v.attributes?.location || v.attributes?.pool || '—';
	}
	const isActive = (v: Vehicle) => (v.status ?? 'active') !== 'inactive';
	const groupName = (v: Vehicle) => ($catalog.vehicleGroup ?? []).find((g) => g.id === v.truckGroupId)?.name ?? '';
	const GROUP_OPTIONS = $derived([
		{ value: 'all', label: 'Semua Grup' },
		{ value: 'none', label: 'Tanpa Grup' },
		...($catalog.vehicleGroup ?? []).map((g) => ({ value: g.id, label: g.name }))
	]);

	const filteredTrucks = $derived.by(() => {
		const q = searchTruck.trim().toLowerCase();
		return vehicles.filter((v) => {
			if (pairingFilter === 'paired' && !v.currentDriverId) return false;
			if (pairingFilter === 'unpaired' && v.currentDriverId) return false;
			if (statusFilter === 'active' && !isActive(v)) return false;
			if (statusFilter === 'inactive' && isActive(v)) return false;
			if (groupFilter === 'none' && v.truckGroupId) return false;
			if (groupFilter !== 'all' && groupFilter !== 'none' && v.truckGroupId !== groupFilter) return false;
			if (!q) return true;
			return [v.licensePlate, typeLabel(v), locationOf(v), groupName(v), v.driver?.fullName ?? '']
				.join(' ')
				.toLowerCase()
				.includes(q);
		});
	});
	const truckRows = $derived(filteredTrucks.slice((truckPage - 1) * PAGE_SIZE, truckPage * PAGE_SIZE));

	const filteredDrivers = $derived.by(() => {
		const q = searchDriver.trim().toLowerCase();
		let list = drivers.filter((d) => {
			if (driverFilter === 'paired' && !truckOfDriver.has(d.id)) return false;
			if (driverFilter === 'unpaired' && truckOfDriver.has(d.id)) return false;
			if (q && !(d.fullName ?? '').toLowerCase().includes(q) && !(d.phone ?? '').includes(q)) return false;
			return true;
		});
		if (assigning && (sugFreqTruck || sugIdle)) {
			list = [...list].sort((a, b) => {
				let sa = 0;
				let sb = 0;
				if (sugFreqTruck) {
					sa += tripsWith(a.id, assigning) * 1000;
					sb += tripsWith(b.id, assigning) * 1000;
				}
				if (sugIdle) {
					sa += idleDays(a.id) ?? 0;
					sb += idleDays(b.id) ?? 0;
				}
				return sb - sa;
			});
		}
		return list;
	});
	const driverRows = $derived(filteredDrivers.slice((driverPage - 1) * PAGE_SIZE, driverPage * PAGE_SIZE));

	$effect(() => {
		void searchTruck, pairingFilter, statusFilter, groupFilter;
		truckPage = 1;
	});
	$effect(() => {
		void searchDriver, driverFilter, sugFreqTruck, sugIdle;
		driverPage = 1;
	});

	function tagsFor(d: Driver) {
		const tags: { type: 'freq' | 'idle'; text: string }[] = [];
		if (!assigning) return tags;
		if (sugFreqTruck) {
			const n = tripsWith(d.id, assigning);
			if (n > 0) tags.push({ type: 'freq', text: `${n}× pakai truck ini` });
		}
		if (sugIdle) {
			const days = idleDays(d.id);
			if (days !== null && days >= 3) tags.push({ type: 'idle', text: `${days} hari idle` });
		}
		return tags;
	}

	// --- Pairing ------------------------------------------------------------
	const plateOf = (id: string | null) => vehicles.find((v) => v.id === id)?.licensePlate ?? '';

	async function startPairing(v: Vehicle) {
		assigning = v.id;
		query = '';
		sugFreqTruck = false;
		sugIdle = false;
		toast('Pilih driver untuk dipasangkan dengan truck ' + v.licensePlate);
		await tick();
		inputEl?.focus();
	}
	function cancelPairing() {
		assigning = null;
		query = '';
		dropdownOpen = false;
	}
	function selectDriver(d: Driver) {
		query = query === d.fullName ? '' : d.fullName;
	}
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return drivers.filter((d) => d.fullName.toLowerCase().includes(q));
	});
	function positionDropdown() {
		if (!inputEl) return;
		const r = inputEl.getBoundingClientRect();
		dropdownStyle = `left:${Math.round(r.left)}px; top:${Math.round(r.bottom + 4)}px; min-width:${Math.round(r.width)}px;`;
	}
	function showDropdown() {
		positionDropdown();
		dropdownOpen = true;
	}
	// Options pick on mousedown, which fires before the input's blur, so the
	// menu can close on blur at once — leaving it open a beat longer put it
	// over the Submit/Batal row underneath.
	function hideDropdown() {
		dropdownOpen = false;
	}
	async function submitPairing() {
		if (!assigning) return;
		const name = query.trim().toLowerCase();
		if (!name) return;
		const driver = drivers.find((d) => d.fullName.toLowerCase() === name);
		if (!driver) {
			toast(`Driver "${query.trim()}" tidak ditemukan di daftar Driver List`);
			return;
		}
		const plate = plateOf(assigning);
		const ok = await setDriver(assigning, driver.id);
		if (ok) {
			toast(`${driver.fullName} dipasangkan dengan truck ${plate}`);
			cancelPairing();
		}
	}
	async function setDriver(vehicleId: string, driverId: string) {
		saving = true;
		error = '';
		try {
			await api.put(ENDPOINTS.vehicles.update(vehicleId), { currentDriverId: driverId });
			await load();
			return true;
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Gagal menyimpan pairing.';
			return false;
		} finally {
			saving = false;
		}
	}

	// --- Status toggle ---------------------------------------------------------
	let deactivating = $state<Vehicle | null>(null);
	async function toggleActive(v: Vehicle) {
		if (isActive(v)) {
			deactivating = v;
			return;
		}
		await setStatus(v, 'active');
	}
	async function setStatus(v: Vehicle, status: 'active' | 'inactive') {
		saving = true;
		try {
			await api.put(ENDPOINTS.vehicles.update(v.id), { status });
			toast(`Truck ${v.licensePlate} sekarang ${status === 'active' ? 'Aktif' : 'Non-aktif'}`);
			deactivating = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal mengubah status truck');
		} finally {
			saving = false;
		}
	}

	// --- Delete ---------------------------------------------------------------
	let removingTruck = $state<Vehicle | null>(null);
	let removingDriver = $state<Driver | null>(null);
	async function removeTruck() {
		if (!removingTruck) return;
		saving = true;
		try {
			await api.delete(ENDPOINTS.vehicles.remove(removingTruck.id));
			toast(`Truck ${removingTruck.licensePlate} dihapus dari armada`);
			removingTruck = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus truck');
		} finally {
			saving = false;
		}
	}
	async function removeDriver() {
		if (!removingDriver) return;
		saving = true;
		try {
			await api.delete(ENDPOINTS.drivers.remove(removingDriver.id));
			toast(`Driver ${removingDriver.fullName} dihapus`);
			removingDriver = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus driver');
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window onscroll={() => (dropdownOpen = false)} />

<div class="page-head">
	<div><h1>My Fleet</h1></div>
</div>

<div class="fleet-actions">
	<a class="btn btn-outline" href="{basePath}/fleet/truck-list/create"><Plus size={14} /> Add Truck</a>
	<a class="btn btn-outline" href="{basePath}/drivers"><Plus size={14} /> Add Driver</a>
</div>

{#if error}<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>{/if}

<div class="fleet-search-row">
	<div class="field">
		<label for="fleet-search-truck">Search Truck by</label>
		<input
			id="fleet-search-truck"
			type="text"
			bind:value={searchTruck}
			placeholder="Cari plat nomor, tipe truck, atau lokasi…"
		/>
	</div>
	<div class="field">
		<label for="fleet-search-driver">Search Driver by</label>
		<input
			id="fleet-search-driver"
			type="text"
			bind:value={searchDriver}
			placeholder="Cari nama atau nomor telepon driver…"
		/>
	</div>
</div>

<div class="fleet-columns">
	<!-- Active Fleet -->
	<div class="card fleet-col-card">
		<div class="detail-header header-blue"><Truck size={15} /> Active Fleet</div>
		<div class="card-pad">
			<div class="filter-row">
				<FieldSelect bind:value={pairingFilter} options={PAIRING_OPTIONS} compact />
				<FieldSelect bind:value={statusFilter} options={STATUS_OPTIONS} compact />
				{#if ($catalog.vehicleGroup ?? []).length}
					<FieldSelect bind:value={groupFilter} options={GROUP_OPTIONS} compact />
				{/if}
			</div>
			<div class="table-wrap">
				<table class="fleet-table">
					<colgroup>
						<col style="width:24%" /><col style="width:24%" /><col style="width:18%" /><col style="width:34%" />
					</colgroup>
					<thead>
						<tr><th>Truck</th><th>Driver</th><th>Location</th><th>Action</th></tr>
					</thead>
					<tbody>
						{#if loading}
							<tr><td colspan="4"><div class="empty">Memuat…</div></td></tr>
						{:else if filteredTrucks.length === 0}
							<tr>
								<td colspan="4">
									<div class="empty"><div class="eic">🚛</div>Tidak ada truck yang cocok dengan filter ini.</div>
								</td>
							</tr>
						{/if}
						{#each truckRows as v (v.id)}
							<tr class:row-inactive={!isActive(v)}>
								<td>
									<div class="mono" style="font-weight:700;">{v.licensePlate}</div>
									<div style="font-size:12px; color:var(--on-surface-variant); margin-top:2px;">
										{typeLabel(v) || '—'}{#if groupName(v)} · <span class="tag-group">{groupName(v)}</span>{/if}
									</div>
								</td>
								<td>
									{#if assigning === v.id}
										<div class="pairing-row">
											<div class="pairing-autocomplete">
												<input
													bind:this={inputEl}
													type="text"
													class="pairing-input"
													placeholder="Ketik atau pilih nama driver"
													bind:value={query}
													oninput={showDropdown}
													onfocus={showDropdown}
													onblur={hideDropdown}
													onkeydown={(e) => e.key === 'Enter' && submitPairing()}
												/>
											</div>
											<div class="pairing-actions">
												<button class="btn btn-primary btn-sm" disabled={saving} onclick={submitPairing}>
													{saving ? 'Menyimpan…' : 'Submit'}
												</button>
												<button class="btn btn-text btn-sm" onclick={cancelPairing}>Batal</button>
											</div>
										</div>
									{:else if v.driver?.fullName}
										<span>{v.driver.fullName}</span>
									{:else}
										<span class="no-pairing">-</span>
									{/if}
								</td>
								<td>{locationOf(v)}</td>
								<td>
									<div class="action-cell">
										<button
											class="mini-icon-btn-dark"
											class:mini-icon-btn-active={assigning === v.id}
											title="Pairing driver"
											onclick={() => (assigning === v.id ? cancelPairing() : startPairing(v))}
											><Disc3 size={15} /></button
										>
										<a class="mini-icon-btn" title="Lihat detail" href="{basePath}/fleet/truck/{v.id}"
											><Search size={14} /></a
										>
										<a class="mini-icon-btn" title="Ubah data" href="{basePath}/fleet/truck/{v.id}?edit=1"
											><Pencil size={14} /></a
										>
										<button
											class="status-toggle-btn"
											class:status-on={isActive(v)}
											class:status-off={!isActive(v)}
											title={isActive(v)
												? 'Truck Aktif — klik untuk nonaktifkan'
												: 'Truck Non-aktif — klik untuk aktifkan'}
											disabled={saving}
											onclick={() => toggleActive(v)}><CircleDot size={15} /></button
										>
										<button class="mini-icon-btn-del" title="Hapus truck" onclick={() => (removingTruck = v)}
											><Trash2 size={14} /></button
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="status-legend">
				<span><span class="legend-dot" style="background:var(--success);"></span> Truck Aktif</span>
				<span><span class="legend-dot" style="background:var(--error);"></span> Truck Non-aktif</span>
			</div>
			{#if filteredTrucks.length}
				<Pagination totalItems={filteredTrucks.length} bind:page={truckPage} pageSize={PAGE_SIZE} />
			{/if}
		</div>
	</div>

	<!-- Driver List -->
	<div class="card fleet-col-card">
		<div class="detail-header header-blue">Driver List</div>
		<div class="card-pad">
			<div class="filter-row">
				<FieldSelect bind:value={driverFilter} options={DRIVER_OPTIONS} compact />
			</div>
			{#if assigning}
				<div class="suggest-filters">
					<div class="suggest-title">💡 Saran untuk keputusan pairing ({plateOf(assigning)}):</div>
					<div class="suggest-check-row">
						<label class="suggest-check"><input type="checkbox" bind:checked={sugFreqTruck} /> Paling Sering Pakai Truck Ini</label>
						<label class="suggest-check"><input type="checkbox" bind:checked={sugIdle} /> Paling Lama Tidak Beroperasi</label>
					</div>
				</div>
			{/if}
			<div class="table-wrap">
				<table class="fleet-table">
					<colgroup>
						<col style="width:28%" /><col style="width:22%" /><col style="width:16%" /><col style="width:18%" /><col style="width:16%" />
					</colgroup>
					<thead>
						<tr><th>Name</th><th>Phone Number</th><th>Status</th><th>Pairing Truck</th><th>Action</th></tr>
					</thead>
					<tbody>
						{#if loading}
							<tr><td colspan="5"><div class="empty">Memuat…</div></td></tr>
						{:else if filteredDrivers.length === 0}
							<tr>
								<td colspan="5">
									<div class="empty"><div class="eic">🔍</div>Tidak ada driver yang cocok dengan filter ini.</div>
								</td>
							</tr>
						{/if}
						{#each driverRows as d (d.id)}
							{@const t = truckOfDriver.get(d.id)}
							<tr>
								<td>
									<div class="row-avatar-name">
										{#if assigning}
											<button
												class="pairing-check"
												class:checked={query === d.fullName}
												title={query === d.fullName ? 'Klik untuk batalkan pilihan' : 'Pilih driver ini untuk pairing'}
												onclick={() => selectDriver(d)}
											>
												{#if query === d.fullName}<Check size={12} />{/if}
											</button>
										{/if}
										{d.fullName}
									</div>
									{#each tagsFor(d) as tag (tag.type)}
										<span class="suggest-tag" class:suggest-tag-freq={tag.type === 'freq'} class:suggest-tag-idle={tag.type === 'idle'}>{tag.text}</span>
									{/each}
								</td>
								<td class="mono">{d.phone ?? '—'}</td>
								<td>
									{#if d.userId}
										<span class="badge badge-active">Accepted</span>
									{:else}
										<span class="badge badge-wait">Pending</span>
									{/if}
								</td>
								<td>
									{#if t}<span class="pairing-ok">{t.licensePlate}</span>{:else}<span class="no-pairing">No Pairing</span>{/if}
								</td>
								<td>
									<div class="action-cell">
										<a class="mini-icon-btn" title="Lihat detail driver" href="{basePath}/fleet/driver/{d.id}"
											><Search size={14} /></a
										>
										<button class="mini-icon-btn-del" title="Hapus driver" onclick={() => (removingDriver = d)}
											><Trash2 size={14} /></button
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if filteredDrivers.length}
				<Pagination totalItems={filteredDrivers.length} bind:page={driverPage} pageSize={PAGE_SIZE} />
			{/if}
		</div>
	</div>
</div>

<!-- Driver autocomplete menu, portaled so the table's overflow can't clip it -->
<div class="pairing-dropdown" class:show={dropdownOpen && !!assigning} style={dropdownStyle} role="listbox">
	{#if matches.length === 0}
		<div class="pairing-option" style="color:var(--on-surface-variant); cursor:default; pointer-events:none;">Driver tidak ditemukan</div>
	{/if}
	{#each matches as d (d.id)}
		{@const t = truckOfDriver.get(d.id)}
		<div
			class="pairing-option"
			role="option"
			tabindex="-1"
			aria-selected={query === d.fullName}
			onmousedown={() => {
				query = d.fullName;
				dropdownOpen = false;
			}}
		>
			{d.fullName}<span class="po-hint">{t ? `(${t.licensePlate})` : '(belum terpairing)'}</span>
		</div>
	{/each}
</div>

<ConfirmModal
	open={!!deactivating}
	title="Nonaktifkan Truck?"
	message={`Truck <b>${deactivating?.licensePlate ?? ''}</b> akan dinonaktifkan dan tidak dapat ditugaskan untuk pengiriman baru sampai diaktifkan kembali. Lanjutkan?`}
	confirmLabel="Ya, Nonaktifkan"
	busy={saving}
	onConfirm={() => deactivating && setStatus(deactivating, 'inactive')}
	onClose={() => (deactivating = null)}
/>

<ConfirmModal
	open={!!removingTruck}
	title="Hapus Truck?"
	message={`Truck <b>${removingTruck?.licensePlate ?? ''}</b> akan dihapus permanen dari daftar armada. Jika truck ini sedang terpasang dengan driver, pairing-nya akan otomatis dilepas. Tindakan ini tidak dapat dibatalkan.`}
	confirmLabel="Ya, Hapus"
	busy={saving}
	onConfirm={removeTruck}
	onClose={() => (removingTruck = null)}
/>

<ConfirmModal
	open={!!removingDriver}
	title="Hapus Driver?"
	message={`Driver <b>${removingDriver?.fullName ?? ''}</b> akan dihapus. Truck yang terpasang dengannya akan dilepas.`}
	confirmLabel="Ya, Hapus"
	busy={saving}
	onConfirm={removeDriver}
	onClose={() => (removingDriver = null)}
/>

<style>
	.tag-group {
		display: inline-block;
		padding: 0 6px;
		border-radius: 999px;
		background: var(--surface-container-high, #eef0f4);
		color: var(--on-surface, #1b1c1e);
		font-size: 11px;
	}
	.detail-header {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}
	.fleet-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}
	.fleet-table th {
		text-align: left;
		font-size: 11px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--on-surface-variant);
		padding: 10px 12px;
		border-bottom: 1px solid var(--outline-variant);
		background: var(--surface-alt);
	}
	.fleet-table td {
		padding: 10px 12px;
		border-bottom: 1px solid var(--outline-variant);
		vertical-align: middle;
	}
	.fleet-table tr:last-child td {
		border-bottom: none;
	}
	.fleet-table tr.row-inactive td:first-child {
		opacity: 0.6;
	}
	.fleet-table .empty {
		padding: 22px 8px;
	}
	/* Two pills on one row, as the prototype's FilterDropdown. */
	.filter-row :global(.field-select) {
		width: auto;
		flex: 1 1 0;
		min-width: 0;
	}
	.action-cell {
		display: flex;
		gap: 4px;
		flex-wrap: nowrap;
	}
	.action-cell :global(.mini-icon-btn),
	.action-cell :global(.mini-icon-btn-dark),
	.action-cell :global(.mini-icon-btn-del),
	.action-cell :global(.status-toggle-btn) {
		width: 28px;
		height: 28px;
	}
	.action-cell a {
		text-decoration: none;
	}
	@media (max-width: 1100px) {
		.fleet-columns {
			grid-template-columns: 1fr;
		}
	}
</style>
