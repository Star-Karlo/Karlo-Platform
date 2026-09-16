<script lang="ts">
	/**
	 * MyWarehouse — warehouses grouped by the customer they belong to.
	 *
	 * Same shape as My Cargo: the customer on the left, its loading and
	 * unloading points on the right, every action on this page. A
	 * transporter registers its customers' sites here so the Input Order
	 * wizard can pick them; the company's own yards live under "Gudang
	 * Sendiri".
	 */
	import { onMount } from 'svelte';
	import { Warehouse, Plus, Pencil, Trash2, MapPin, Search } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		Button,
		DataTable,
		Field,
		FormGrid,
		Input,
		MapView,
		Modal,
		PageHeader,
		type Column,
		type MapMarker
	} from '$lib/components/ui';

	let { title = 'MyWarehouse' }: { title?: string } = $props();

	type Customer = { id: string; name: string; abbreviation?: string };
	type Site = {
		id: string;
		name: string;
		city?: string;
		district?: string;
		address?: string;
		picName?: string;
		picPhone?: string;
		latitude?: number;
		longitude?: number;
		location?: { coordinates?: [number, number] };
		geofenceRadiusMeters?: number;
		customerCompanyId?: string;
	};

	const OWN = 'own';
	let customers = $state<Customer[]>([]);
	let selected = $state<string>(OWN);
	let sites = $state<Site[]>([]);
	let counts = $state<Record<string, number>>({});
	let loading = $state(true);
	let loadingSites = $state(false);
	let error = $state('');
	let search = $state('');

	async function loadCustomers() {
		loading = true;
		try {
			const res = await api.get(ENDPOINTS.shippers.list);
			customers = res.data?.data ?? [];
			// One count per customer, so the list reads like a register.
			const all = await api.get(ENDPOINTS.warehouses.list, { pageSize: 500 });
			const c: Record<string, number> = {};
			for (const s of all.data?.data ?? []) {
				const k = s.customerCompanyId || OWN;
				c[k] = (c[k] ?? 0) + 1;
			}
			counts = c;
			await select(selected);
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load customers.';
		} finally {
			loading = false;
		}
	}

	async function select(id: string) {
		selected = id;
		loadingSites = true;
		try {
			const res = await api.get(ENDPOINTS.warehouses.list, {
				pageSize: 200,
				filtered: JSON.stringify([{ id: 'customerCompanyId', value: id }])
			});
			sites = res.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load warehouses.';
		} finally {
			loadingSites = false;
		}
	}
	onMount(loadCustomers);

	const selectedName = $derived(
		selected === OWN ? 'Gudang Sendiri' : (customers.find((c) => c.id === selected)?.name ?? '')
	);
	const visible = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return q
			? sites.filter((s) => [s.name, s.city, s.address].some((v) => (v ?? '').toLowerCase().includes(q)))
			: sites;
	});
	const coords = (s: Site): [number, number] | null =>
		s.longitude != null && s.latitude != null
			? [s.longitude, s.latitude]
			: s.location?.coordinates
				? [s.location.coordinates[0], s.location.coordinates[1]]
				: null;
	const markers = $derived(
		visible.flatMap((s) => {
			const c = coords(s);
			return c ? [{ id: s.id, lng: c[0], lat: c[1], title: s.name } as MapMarker] : [];
		})
	);

	// --- Form ------------------------------------------------------------------
	let showForm = $state(false);
	let editing = $state<Site | null>(null);
	let saving = $state(false);
	let picked = $state<[number, number] | null>(null);
	let confirming = $state<Site | null>(null);
	function blank() {
		return {
			name: '',
			city: '',
			district: '',
			address: '',
			picName: '',
			picPhone: '',
			geofenceRadiusMeters: ''
		};
	}
	let form = $state(blank());
	const pickedMarkers = $derived(
		picked
			? [
					{
						id: 'picked',
						lng: picked[0],
						lat: picked[1],
						color: '#12C7EF',
						title: form.name || 'Titik lokasi'
					} as MapMarker
				]
			: []
	);

	function openCreate() {
		editing = null;
		form = blank();
		picked = null;
		error = '';
		showForm = true;
	}
	function openEdit(s: Site) {
		editing = s;
		form = {
			name: s.name ?? '',
			city: s.city ?? '',
			district: s.district ?? '',
			address: s.address ?? '',
			picName: s.picName ?? '',
			picPhone: s.picPhone ?? '',
			geofenceRadiusMeters: s.geofenceRadiusMeters != null ? String(s.geofenceRadiusMeters) : ''
		};
		picked = coords(s);
		error = '';
		showForm = true;
	}
	async function save() {
		if (!form.name.trim()) {
			error = 'Nama Warehouse wajib diisi';
			return;
		}
		saving = true;
		error = '';
		try {
			const payload: Record<string, unknown> = {
				name: form.name.trim(),
				siteType: 'warehouse',
				customerCompanyId: selected === OWN ? '' : selected
			};
			for (const key of ['city', 'district', 'address', 'picName', 'picPhone'] as const) {
				if (form[key].trim()) payload[key] = form[key].trim();
			}
			if (form.geofenceRadiusMeters.trim()) payload.geofenceRadiusMeters = Number(form.geofenceRadiusMeters);
			if (picked) {
				payload.longitude = picked[0];
				payload.latitude = picked[1];
			}
			if (editing) await api.put(ENDPOINTS.warehouses.update(editing.id), payload);
			else await api.post(ENDPOINTS.warehouses.create, payload);
			showForm = false;
			await loadCustomers();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save the warehouse.';
		} finally {
			saving = false;
		}
	}
	async function remove() {
		if (!confirming) return;
		try {
			await api.delete(ENDPOINTS.warehouses.remove(confirming.id));
			confirming = null;
			await loadCustomers();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not delete the warehouse.';
		}
	}

	const columns: Column[] = [
		{ key: 'name', label: 'Nama Warehouse' },
		{ key: 'city', label: 'Kota', format: (r) => r.city ?? '—' },
		{ key: 'address', label: 'Alamat', format: (r) => r.address ?? '—' },
		{
			key: 'pic',
			label: 'PIC',
			format: (r) => (r.picName ? `${r.picName}${r.picPhone ? ` · ${r.picPhone}` : ''}` : '—')
		},
		{ key: 'geo', label: 'Titik', format: (r) => (coords(r) ? 'Ada' : 'Belum') },
		{ key: 'actions', label: '', align: 'right' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={Warehouse}
		subtitle="Warehouse per customer: titik muat dan bongkar milik tiap customer, di samping gudang Anda sendiri."
	/>

	{#if error && !showForm}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	<div class="cargo-layout">
		<aside class="cargo-types">
			<div class="cargo-types-head">Customer</div>
			{#if loading}
				<p class="px-4 py-3 text-xs text-muted">Loading…</p>
			{:else}
				<ul>
					<li>
						<button
							type="button"
							class="cargo-type-row"
							class:active={selected === OWN}
							onclick={() => select(OWN)}
						>
							<span class="truncate">Gudang Sendiri</span>
							<span class="cargo-count">{counts[OWN] ?? 0}</span>
						</button>
					</li>
					{#each customers as c (c.id)}
						<li>
							<button
								type="button"
								class="cargo-type-row"
								class:active={selected === c.id}
								onclick={() => select(c.id)}
							>
								<span class="truncate">{c.name}</span>
								<span class="cargo-count">{counts[c.id] ?? 0}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<a class="cargo-type-add" href="./customer-list"><Plus size={14} /> Tambah Customer</a>
		</aside>

		<section class="cargo-items">
			<header class="cargo-items-head">
				<div>
					<h2>{selectedName}</h2>
					<p>{sites.length} warehouse{selected === OWN ? ' · milik perusahaan Anda' : ''}</p>
				</div>
				<div class="flex items-center gap-2">
					<div class="fleet-search-input" style="width:240px;">
						<Search size={14} /><input
							class="form-input"
							placeholder="Cari nama, kota, alamat"
							bind:value={search}
						/>
					</div>
					<Button onclick={openCreate}><Plus size={14} /> Tambah Warehouse</Button>
				</div>
			</header>
			{#if markers.length}
				<div class="px-4 pt-4"><MapView {markers} fitToMarkers height="280px" /></div>
			{/if}
			<DataTable
				{columns}
				data={visible}
				totalRows={visible.length}
				loading={loadingSites}
				emptyMessage="Belum ada warehouse untuk {selectedName}"
				pageSize={200}
			>
				{#snippet cell(row: any, column: Column, text: string)}
					{#if column.key === 'name'}
						<span class="flex items-center gap-2"
							><MapPin size={14} class="shrink-0 text-cyan" /><span class="font-medium text-ink"
								>{row.name}</span
							></span
						>
					{:else if column.key === 'actions'}
						<div class="action-cell" style="justify-content:flex-end;">
							<button type="button" class="frozen-icon-btn" title="Edit" onclick={() => openEdit(row)}
								><Pencil size={14} /></button
							>
							<button type="button" class="frozen-icon-btn" title="Hapus" onclick={() => (confirming = row)}
								><Trash2 size={14} /></button
							>
						</div>
					{:else}
						{text}
					{/if}
				{/snippet}
			</DataTable>
		</section>
	</div>
</div>

<Modal
	open={showForm}
	size="lg"
	title={editing ? `Edit ${editing.name}` : `Tambah Warehouse — ${selectedName}`}
	onClose={() => (showForm = false)}
>
	<FormGrid>
		<Field label="Nama Warehouse" id="w-name" required
			><Input id="w-name" bind:value={form.name} placeholder="cth. Gudang Priok" /></Field
		>
		<Field label="Kota" id="w-city"
			><Input id="w-city" bind:value={form.city} placeholder="cth. Kota Jakarta Utara" /></Field
		>
		<div class="md:col-span-2">
			<p class="mb-1 text-xs text-muted">Titik Lokasi di Peta</p>
			<MapView markers={pickedMarkers} onPick={(c) => (picked = c)} height="260px" />
			<p class="mt-1 text-xs text-muted">
				Klik peta untuk menentukan titik lokasi. Tanpa titik lokasi, warehouse tetap tersimpan — tetapi rute
				dan jarak tidak bisa dihitung sampai titiknya diisi.
			</p>
		</div>
		<Field label="Latitude" id="w-lat"
			><Input
				id="w-lat"
				value={picked ? String(picked[1]) : ''}
				readonly
				placeholder="Belum ditentukan"
			/></Field
		>
		<Field label="Longitude" id="w-lon"
			><Input
				id="w-lon"
				value={picked ? String(picked[0]) : ''}
				readonly
				placeholder="Belum ditentukan"
			/></Field
		>
		<Field label="Alamat Lengkap" id="w-address" wide
			><Input id="w-address" bind:value={form.address} /></Field
		>
		<Field label="Kecamatan" id="w-district"><Input id="w-district" bind:value={form.district} /></Field>
		<Field label="Radius Geofence (m)" id="w-geo" help="Default 200 m bila kosong."
			><Input id="w-geo" type="number" bind:value={form.geofenceRadiusMeters} /></Field
		>
		<Field label="Nama PIC" id="w-pic"><Input id="w-pic" bind:value={form.picName} /></Field>
		<Field label="Telepon PIC" id="w-picphone"><Input id="w-picphone" bind:value={form.picPhone} /></Field>
	</FormGrid>
	{#if error}<div class="note-banner note-banner-error" role="alert">
			<span>⛔</span>
			<div>{error}</div>
		</div>{/if}
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showForm = false)}>Batal</button>
		<Button onclick={save} loading={saving}>{editing ? 'Simpan' : 'Simpan Warehouse'}</Button>
	{/snippet}
</Modal>

<Modal open={confirming !== null} size="sm" title="Hapus warehouse" onClose={() => (confirming = null)}>
	<p class="text-sm">Hapus <b>{confirming?.name}</b>? Order yang sudah memakainya tetap tersimpan.</p>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (confirming = null)}>Batal</button>
		<Button variant="danger" onclick={remove}>Hapus</Button>
	{/snippet}
</Modal>

<style>
	.cargo-layout {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: var(--gutter, 16px);
		align-items: start;
	}
	@media (max-width: 860px) {
		.cargo-layout {
			grid-template-columns: 1fr;
		}
	}
	.cargo-types {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
		overflow: hidden;
	}
	.cargo-types-head {
		padding: 12px 16px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--on-surface-variant, #6b7280);
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
	}
	.cargo-types ul {
		list-style: none;
		margin: 0;
		padding: 6px;
		display: grid;
		gap: 2px;
	}
	.cargo-type-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 0;
		background: transparent;
		border-radius: 8px;
		font-size: 13px;
		color: var(--on-surface, #111);
		cursor: pointer;
		text-align: left;
	}
	.cargo-type-row:hover {
		background: var(--surface-container, #f3f4f6);
	}
	.cargo-type-row.active {
		background: var(--primary-container, #e0ecff);
		color: var(--on-primary-container, #1e3a8a);
		font-weight: 600;
	}
	.cargo-count {
		font-size: 11px;
		color: var(--on-surface-variant, #6b7280);
		font-variant-numeric: tabular-nums;
	}
	.cargo-type-add {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: 0;
		border-top: 1px solid var(--outline-variant, #e5e7eb);
		background: transparent;
		font-size: 13px;
		color: var(--primary, #2563eb);
		cursor: pointer;
		text-decoration: none;
	}
	.cargo-items {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
		overflow: hidden;
	}
	.cargo-items-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
		flex-wrap: wrap;
	}
	.cargo-items-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.cargo-items-head p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--on-surface-variant, #6b7280);
	}
	.fleet-search-input {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.fleet-search-input input {
		flex: 1;
	}
</style>
