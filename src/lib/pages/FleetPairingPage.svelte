<script lang="ts">
	/**
	 * Data Armada — trucks and drivers side by side, paired on one page.
	 *
	 * The review's point: a planner pairing a truck needs to see both lists
	 * at once — which trucks have nobody, which drivers are free — and to
	 * assign without leaving the table. Suggestions come from the order
	 * history (business-service): who has driven this truck most, who has
	 * been off the road longest. Master data holds the pairing itself.
	 */
	import { onMount } from 'svelte';
	import { Truck, Users, Plus, Search, Check, Link2Off, Pencil, Trash2 } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { Button, Modal, PageHeader, Select, StatusBadge } from '$lib/components/ui';
	import { formatDate } from '$lib/utils/format';

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
		attributes?: Record<string, any>;
		tracker?: { deviceId?: string } | null;
		unitYear?: number | null;
	};
	type Driver = { id: string; fullName: string; phone?: string; status?: string; userId?: string };
	type Activity = { driverId: string; truckId: string; trips: number; lastActiveAt?: string };

	let vehicles = $state<Vehicle[]>([]);
	let drivers = $state<Driver[]>([]);
	let activity = $state<Activity[]>([]);
	let loading = $state(true);
	let error = $state('');
	let notice = $state('');

	// Filters
	let truckSearch = $state('');
	let truckFilter = $state('unpaired'); // unpaired | all
	let truckStatus = $state('active');
	let driverSearch = $state('');
	let driverFilter = $state('unpaired'); // unpaired | all
	let suggestMostUsed = $state(false);
	let suggestLongestIdle = $state(false);

	// Inline assign state
	let assigning = $state<string | null>(null); // vehicle id
	let chosenDriver = $state('');
	let saving = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const [v, d] = await Promise.all([
				api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
				api.get(ENDPOINTS.drivers.list, { pageSize: 500 })
			]);
			vehicles = v.data?.data ?? [];
			drivers = d.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load the fleet.';
		} finally {
			loading = false;
		}
		// Suggestions are a nicety: their absence must not empty the page.
		try {
			const a = await api.get('/fleet/driver-activity');
			activity = a.data?.data ?? [];
		} catch {
			activity = [];
		}
	}
	onMount(load);

	const pairedDriverIds = $derived(
		new Set(vehicles.map((v) => v.currentDriverId).filter(Boolean) as string[])
	);
	const truckOfDriver = $derived(
		new Map(vehicles.filter((v) => v.currentDriverId).map((v) => [v.currentDriverId as string, v]))
	);

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

	const filteredTrucks = $derived.by(() => {
		const q = truckSearch.trim().toLowerCase();
		return vehicles.filter((v) => {
			if (truckFilter === 'unpaired' && v.currentDriverId) return false;
			if (truckStatus && (v.status ?? 'active') !== truckStatus) return false;
			if (q && !(v.licensePlate ?? '').toLowerCase().includes(q) && !typeLabel(v).toLowerCase().includes(q))
				return false;
			return true;
		});
	});

	const filteredDrivers = $derived.by(() => {
		const q = driverSearch.trim().toLowerCase();
		let list = drivers.filter((d) => {
			if (driverFilter === 'unpaired' && pairedDriverIds.has(d.id)) return false;
			if (q && !(d.fullName ?? '').toLowerCase().includes(q) && !(d.phone ?? '').includes(q)) return false;
			return true;
		});
		// Suggestion ordering. "Most used this truck" needs a truck in hand —
		// the one being assigned — otherwise it is a no-op.
		if (suggestMostUsed && assigning) {
			list = [...list].sort((a, b) => tripsWith(b.id, assigning) - tripsWith(a.id, assigning));
		} else if (suggestLongestIdle) {
			list = [...list].sort((a, b) => ((lastActive.get(a.id) ?? '') < (lastActive.get(b.id) ?? '') ? -1 : 1));
		}
		return list;
	});

	const driverOptions = $derived(
		filteredDrivers.map((d) => ({
			value: d.id,
			label: `${d.fullName}${assigning && tripsWith(d.id, assigning) ? ` · ${tripsWith(d.id, assigning)} trip` : ''}${pairedDriverIds.has(d.id) ? ' (paired)' : ''}`
		}))
	);

	function typeLabel(v: Vehicle) {
		return v.truckHead?.name ?? v.truckBody?.name ?? v.attributes?.truckTypeName ?? '';
	}

	function startAssign(v: Vehicle) {
		assigning = v.id;
		chosenDriver = '';
		notice = '';
	}
	function pickDriver(d: Driver) {
		if (!assigning) {
			// Clicking a driver first: start with the first unpaired truck.
			const t = filteredTrucks.find((v) => !v.currentDriverId);
			if (!t) return;
			assigning = t.id;
		}
		chosenDriver = d.id;
	}
	async function submitAssign() {
		if (!assigning || !chosenDriver) return;
		await setDriver(assigning, chosenDriver);
		assigning = null;
		chosenDriver = '';
	}
	// The truck list's own actions live here now: this page IS the fleet
	// register (review A.3 — trucks and drivers on one page).
	let confirmingDelete = $state<Vehicle | null>(null);
	async function removeTruck() {
		if (!confirmingDelete) return;
		saving = true;
		try {
			await api.delete(ENDPOINTS.vehicles.remove(confirmingDelete.id));
			notice = `${confirmingDelete.licensePlate} dihapus dari armada.`;
			confirmingDelete = null;
			await load();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not remove the truck.';
		} finally {
			saving = false;
		}
	}

	async function setDriver(vehicleId: string, driverId: string) {
		saving = true;
		error = '';
		try {
			await api.put(ENDPOINTS.vehicles.one(vehicleId), { currentDriverId: driverId });
			const plate = vehicles.find((v) => v.id === vehicleId)?.licensePlate;
			notice = driverId
				? `${plate} paired with ${drivers.find((d) => d.id === driverId)?.fullName ?? 'driver'}.`
				: `${plate} unpaired.`;
			await load();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save the pairing.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader
		title="My Fleet"
		icon={Truck}
		subtitle="Pair trucks with drivers. Filter to what still needs a pairing, pick from the list on the right, submit in the row."
	>
		{#snippet actions()}
			<Button variant="outline" href="{basePath}/fleet/truck-list/create"><Plus size={14} /> Add Truck</Button
			>
			<Button variant="outline" href="{basePath}/drivers"><Plus size={14} /> Add Driver</Button>
		{/snippet}
	</PageHeader>

	{#if error}<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>{/if}
	{#if notice}<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>{/if}

	<div class="fleet-search">
		<label class="form-label" for="ts">Search Truck by</label>
		<label class="form-label" for="ds">Search Driver by</label>
		<div class="fleet-search-input">
			<Search size={14} /><input
				id="ts"
				class="form-input"
				placeholder="Cari plat nomor atau tipe truck"
				bind:value={truckSearch}
			/>
		</div>
		<div class="fleet-search-input">
			<Search size={14} /><input
				id="ds"
				class="form-input"
				placeholder="Cari nama atau nomor telepon driver"
				bind:value={driverSearch}
			/>
		</div>
	</div>

	<div class="fleet-grid">
		<section class="fleet-panel">
			<header class="fleet-panel-head">
				<Truck size={15} /> Active Fleet <span class="fleet-count">{filteredTrucks.length}</span>
			</header>
			<div class="fleet-filters">
				<Select
					bind:value={truckFilter}
					options={[
						{ value: 'unpaired', label: 'Belum ada driver' },
						{ value: 'all', label: 'Semua truck' }
					]}
				/>
				<Select
					bind:value={truckStatus}
					options={[
						{ value: 'active', label: 'Truck aktif' },
						{ value: 'inactive', label: 'Truck non-aktif' },
						{ value: '', label: 'Semua status' }
					]}
				/>
			</div>
			<div class="fleet-table-wrap">
				<table class="fleet-table">
					<thead
						><tr><th>Truck</th><th>Driver</th><th>Device</th><th>Status</th><th class="right">Action</th></tr
						></thead
					>
					<tbody>
						{#if loading}
							<tr><td colspan="5" class="muted">Loading…</td></tr>
						{:else if filteredTrucks.length === 0}
							<tr><td colspan="5" class="muted">No trucks match.</td></tr>
						{/if}
						{#each filteredTrucks as v (v.id)}
							<tr class:assigning={assigning === v.id}>
								<td
									><div class="plate">{v.licensePlate}</div>
									<div class="sub">{typeLabel(v) || '—'}</div></td
								>
								<td>
									{#if assigning === v.id}
										<div class="assign-inline">
											<Select
												bind:value={chosenDriver}
												options={driverOptions}
												placeholder="Ketik atau pilih nama driver"
											/>
											<div class="assign-actions">
												<Button onclick={submitAssign} loading={saving} disabled={!chosenDriver}
													>Submit</Button
												>
												<button
													type="button"
													class="btn btn-outline btn-sm"
													onclick={() => {
														assigning = null;
														chosenDriver = '';
													}}>Batal</button
												>
											</div>
										</div>
									{:else}
										{v.driver?.fullName ?? '—'}
									{/if}
								</td>
								<td class="sub"
									>{v.tracker?.deviceId ?? '—'}{#if v.unitYear}
										· {v.unitYear}{/if}</td
								>
								<td><StatusBadge statusCode={v.status ?? 'active'} label={v.status ?? 'active'} /></td>
								<td class="right">
									<div class="action-cell" style="justify-content:flex-end;">
										{#if v.currentDriverId}
											<button
												type="button"
												class="frozen-icon-btn"
												title="Lepas pairing"
												onclick={() => setDriver(v.id, '')}><Link2Off size={14} /></button
											>
										{:else if assigning !== v.id}
											<button
												type="button"
												class="frozen-icon-btn"
												title="Assign driver"
												onclick={() => startAssign(v)}><Check size={14} /></button
											>
										{/if}
										<button
											type="button"
											class="frozen-icon-btn"
											title="Hapus truck"
											onclick={() => (confirmingDelete = v)}><Trash2 size={14} /></button
										>
										<a class="frozen-icon-btn" title="Lihat detail" href="{basePath}/fleet/truck/{v.id}"
											><Search size={14} /></a
										>
										<a class="frozen-icon-btn" title="Ubah data" href="{basePath}/fleet/truck/{v.id}?edit=1"
											><Pencil size={14} /></a
										>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="fleet-panel">
			<header class="fleet-panel-head">
				<Users size={15} /> Driver List <span class="fleet-count">{filteredDrivers.length}</span>
			</header>
			<div class="fleet-filters">
				<Select
					bind:value={driverFilter}
					options={[
						{ value: 'unpaired', label: 'Belum terpairing' },
						{ value: 'all', label: 'Semua driver' }
					]}
				/>
			</div>
			<div class="fleet-suggest">
				<span>Saran untuk keputusan pairing:</span>
				<label
					><input
						type="checkbox"
						bind:checked={suggestMostUsed}
						onchange={() => {
							if (suggestMostUsed) suggestLongestIdle = false;
						}}
					/> Paling sering pakai truck ini</label
				>
				<label
					><input
						type="checkbox"
						bind:checked={suggestLongestIdle}
						onchange={() => {
							if (suggestLongestIdle) suggestMostUsed = false;
						}}
					/> Paling lama tidak beroperasional</label
				>
			</div>
			<div class="fleet-table-wrap">
				<table class="fleet-table">
					<thead
						><tr
							><th></th><th>Name</th><th>Phone</th><th>Status</th><th>Pairing truck</th><th>Last trip</th></tr
						></thead
					>
					<tbody>
						{#if loading}
							<tr><td colspan="6" class="muted">Loading…</td></tr>
						{:else if filteredDrivers.length === 0}
							<tr><td colspan="6" class="muted">No drivers match.</td></tr>
						{/if}
						{#each filteredDrivers as d (d.id)}
							{@const t = truckOfDriver.get(d.id)}
							<tr class:chosen={chosenDriver === d.id}>
								<td
									><input
										type="radio"
										name="pick-driver"
										checked={chosenDriver === d.id}
										disabled={pairedDriverIds.has(d.id)}
										onchange={() => pickDriver(d)}
										aria-label="Pilih {d.fullName}"
									/></td
								>
								<td
									><a class="plate" href="{basePath}/fleet/driver/{d.id}">{d.fullName}</a
									>{#if assigning && tripsWith(d.id, assigning)}<span class="sub">
											· {tripsWith(d.id, assigning)} trip dengan truck ini</span
										>{/if}</td
								>
								<td>{d.phone ?? '—'}</td>
								<td><StatusBadge statusCode={d.status ?? 'active'} label={d.status ?? 'active'} /></td>
								<td
									>{#if t}<span class="plate">{t.licensePlate}</span>{:else}<span class="no-pair"
											>No Pairing</span
										>{/if}</td
								>
								<td class="sub">{lastActive.get(d.id) ? formatDate(lastActive.get(d.id)!) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	</div>
</div>

<Modal
	open={confirmingDelete !== null}
	size="sm"
	title="Hapus truck"
	onClose={() => (confirmingDelete = null)}
>
	<p class="text-sm">
		Hapus <b>{confirmingDelete?.licensePlate}</b> dari armada? Riwayat order tetap tersimpan.
	</p>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (confirmingDelete = null)}>Batal</button>
		<Button variant="danger" onclick={removeTruck} loading={saving}>Hapus</Button>
	{/snippet}
</Modal>

<style>
	.fleet-search {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 16px;
	}
	.fleet-search-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.fleet-search-input input {
		flex: 1;
	}
	.fleet-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
	}
	@media (max-width: 1100px) {
		.fleet-grid,
		.fleet-search {
			grid-template-columns: 1fr;
		}
	}
	.fleet-panel {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
		overflow: hidden;
	}
	.fleet-panel-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		background: var(--primary, #1d4ed8);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
	}
	.fleet-count {
		margin-left: auto;
		font-size: 11px;
		opacity: 0.85;
		font-variant-numeric: tabular-nums;
	}
	.fleet-filters {
		display: flex;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
		flex-wrap: wrap;
	}
	.fleet-filters :global(select) {
		min-width: 180px;
	}
	.fleet-suggest {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		padding: 8px 14px;
		font-size: 12px;
		background: var(--surface-container, #f3f6fb);
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
	}
	.fleet-suggest span {
		color: var(--on-surface-variant, #6b7280);
	}
	.fleet-suggest label {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.fleet-table-wrap {
		overflow-x: auto;
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
		color: var(--on-surface-variant, #6b7280);
		padding: 8px 12px;
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
	}
	.fleet-table td {
		padding: 8px 12px;
		border-bottom: 1px solid var(--outline-variant, #eef0f4);
		vertical-align: middle;
	}
	.fleet-table tr.assigning td {
		background: var(--primary-container, #eef4ff);
	}
	.fleet-table tr.chosen td {
		background: var(--primary-container, #eef4ff);
	}
	.right {
		text-align: right;
	}
	.muted {
		color: var(--on-surface-variant, #6b7280);
		font-size: 12px;
		padding: 18px 12px;
	}
	.plate {
		font-weight: 600;
	}
	.sub {
		font-size: 11px;
		color: var(--on-surface-variant, #6b7280);
	}
	.no-pair {
		color: var(--danger, #dc2626);
		font-size: 12px;
	}
	.assign-inline {
		display: grid;
		gap: 6px;
		min-width: 220px;
	}
	.assign-actions {
		display: flex;
		gap: 6px;
	}
</style>
