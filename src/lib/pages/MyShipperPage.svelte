<script lang="ts">
	import { onMount } from 'svelte';
	import { Warehouse as WarehouseIcon, MapPin, Phone, Plus } from 'lucide-svelte';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		Button,
		Card,
		DataTable,
		EmptyState,
		Input,
		Modal,
		MapView,
		PageHeader,
		Spinner,
		type Column,
		type MapMarker
	} from '$lib/components/ui';

	/**
	 * My Shipper — the old app's two side-by-side panels: the company's
	 * warehouses, and the PIC responsible for each.
	 *
	 * The PIC panel lists the company's warehouse PICs from /users, which now
	 * carries each member's product role. Warehouses also record a picName and
	 * picPhone directly, so both are shown: the account, and the contact written
	 * on the warehouse.
	 */
	let { basePath, title = 'My Shipper' }: { basePath: string; title?: string } = $props();

	/** Company members whose TMS role is warehousePic. */
	let picUsers = $state<any[]>([]);

	onMount(async () => {
		warehouseActions.getAll({ pageSize: 100 });
		try {
			const res = await api.get(ENDPOINTS.users.list, { page: 0, pageSize: 200 });
			picUsers = (res.data.data ?? []).filter(
				(u: any) => (u.role ?? '').toLowerCase() === 'warehousepic'
			);
		} catch {
			picUsers = [];
		}
	});

	let warehouses = $derived($warehouseStore.warehouses);

	let filteredWarehouses = $derived(
		warehouses.filter((w) => {
			const q = warehouseSearch.trim().toLowerCase();
			if (!q) return true;
			return `${w.name ?? ''} ${w.city ?? ''} ${w.address ?? ''}`.toLowerCase().includes(q);
		})
	);

	let markers = $derived<MapMarker[]>(
		warehouses
			.filter((w) => w.location?.coordinates?.length === 2)
			.map((w) => ({
				id: w.id,
				lng: w.location!.coordinates[0],
				lat: w.location!.coordinates[1],
				color: '#12C7EF',
				title: w.name ?? 'Warehouse',
				subtitle: w.address ?? ''
			}))
	);

	const warehouseColumns: Column[] = [
		{ key: 'name', label: 'Name' },
		// City rather than the full address: the console lists these by city,
		// and a full address wraps to three lines in a half-width panel.
		{ key: 'city', label: 'Kota', format: (row) => row.city ?? row.cityId ?? '-' },
		{ key: 'picName', label: 'Main PIC', format: (row) => row.picName ?? '-' },
		{
			key: 'geofenceRadius',
			label: 'Geofence',
			align: 'right',
			format: (row) => (row.geofenceRadius ? `${row.geofenceRadius} m` : '-')
		}
	];

	/** Search terms, applied in the browser: both lists are already loaded. */
	let warehouseSearch = $state('');
	let picSearch = $state('');

	let showForm = $state(false);
	let saving = $state(false);
	let formError = $state('');

	let form = $state({
		name: '',
		city: '',
		district: '',
		address: '',
		picName: '',
		picPhone: '',
		geofenceRadiusMeters: ''
	});

	/**
	 * The picked point, as [longitude, latitude].
	 *
	 * GeoJSON order throughout — the map, the API and the routing service all
	 * use it — even though the two inputs below are labelled the way people say
	 * them. Keeping one order internally is what stops a transposition, which
	 * puts an Indonesian site in the Indian Ocean and usually surfaces much
	 * later as a routing failure.
	 */
	let picked = $state<[number, number] | null>(null);

	let pickedMarkers = $derived<MapMarker[]>(
		picked
			? [{ id: 'picked', lng: picked[0], lat: picked[1], color: '#12C7EF', title: form.name || 'New site' }]
			: []
	);

	function openCreate() {
		form = { name: '', city: '', district: '', address: '', picName: '', picPhone: '', geofenceRadiusMeters: '' };
		picked = null;
		formError = '';
		showForm = true;
	}

	async function saveWarehouse() {
		formError = '';
		saving = true;

		const payload: Record<string, unknown> = { name: form.name.trim() };
		for (const key of ['city', 'district', 'address', 'picName', 'picPhone'] as const) {
			if (form[key].trim()) payload[key] = form[key].trim();
		}
		if (form.geofenceRadiusMeters.trim()) {
			payload.geofenceRadiusMeters = Number(form.geofenceRadiusMeters);
		}
		// Sent only as a pair. Half a coordinate is not a location, and the
		// service refuses it rather than storing a latitude with no longitude.
		if (picked) {
			payload.longitude = picked[0];
			payload.latitude = picked[1];
		}

		const result = await warehouseActions.create(payload);
		saving = false;

		if (result.ok) {
			showForm = false;
			await warehouseActions.getAll({ pageSize: 100 });
		} else {
			formError = result.message;
		}
	}

	const picColumns: Column[] = [
		{ key: 'fullName', label: 'PIC' },
		{ key: 'phone', label: 'Phone' },
		{ key: 'source', label: 'From' }
	];

	/**
	 * PIC accounts first, then any warehouse contact that is not one of them —
	 * the warehouse record often names someone with no login.
	 */
	let pics = $derived([
		...picUsers.map((u) => ({
			id: u.id,
			fullName: u.fullName ?? u.username ?? u.email,
			phone: u.phone ?? '',
			source: 'User account'
		})),
		...warehouses
			.filter((w) => w.picName && !picUsers.some((u) => u.fullName === w.picName))
			.map((w) => ({
				id: `wh-${w.id}`,
				fullName: w.picName ?? '',
				phone: w.picPhone ?? '',
				source: w.name ?? 'Warehouse'
			}))
	]);

	let filteredPics = $derived(
		pics.filter((p) => {
			const q = picSearch.trim().toLowerCase();
			if (!q) return true;
			return `${p.fullName} ${p.phone}`.toLowerCase().includes(q);
		})
	);
</script>

<div class="space-y-gutter">
	<PageHeader title="Master Data — MyWarehouse" icon={WarehouseIcon} subtitle="{warehouses.length} warehouses">
		{#snippet actions()}
			<!-- Both are disabled, and visibly so, rather than absent. Master
			     data serves sites read-only today: creating one means the
			     coordinate, the geofence radius and the PIC link, none of which
			     a generic writer should invent. Hiding the buttons would make
			     the gap look like a design choice instead of unfinished work. -->
			<Button variant="outline" onclick={openCreate}>
				<Plus size={14} /> Tambah Warehouse
			</Button>
			<!-- Still disabled: a warehouse PIC is a USER account, which means
			     an invitation and a role, not a row on this screen. -->
			<Button variant="outline" disabled title="A warehouse PIC is a user account — invite them from Collaboration">
				<Plus size={14} /> Tambah PIC Warehouse
			</Button>
		{/snippet}
	</PageHeader>

	{#if $warehouseStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$warehouseStore.error}</p>
	{/if}

	{#if $warehouseStore.loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else if warehouses.length === 0}
		<Card><EmptyState message="No warehouses yet" hint="Add a loading or unloading point to get started." /></Card>
	{:else}
		<Card title="Locations" padded={false}>
			<div class="px-6 pb-6 pt-4">
				<MapView {markers} fitToMarkers class="h-[360px]" />
			</div>
		</Card>

		<div class="grid grid-cols-1 gap-gutter xl:grid-cols-2">
			<Card title="Active Warehouse" header="accent" padded={false}>
				<div class="border-b border-line-card px-5 py-4">
					<label for="wh-search" class="form-label">Search Warehouse by</label>
					<Input id="wh-search" bind:value={warehouseSearch} placeholder="Cari nama gudang atau kota…" />
				</div>
				<DataTable
					columns={warehouseColumns}
					data={filteredWarehouses}
					totalRows={filteredWarehouses.length}
					pageSize={filteredWarehouses.length || 1}
					emptyMessage="No warehouses"
				>
					{#snippet cell(row: any, column: Column, text: string)}
						{#if column.key === 'name'}
							<div class="flex items-center gap-2">
								<MapPin size={14} class="shrink-0 text-cyan" />
								<span class="font-medium text-ink">{text}</span>
							</div>
						{:else}
							{text}
						{/if}
					{/snippet}
				</DataTable>
			</Card>

			<Card title="PIC Warehouse List" header="accent" padded={false}>
				<div class="border-b border-line-card px-5 py-4">
					<label for="pic-search" class="form-label">Search PIC by</label>
					<Input id="pic-search" bind:value={picSearch} placeholder="Cari nama atau nomor telepon PIC…" />
				</div>
				<DataTable
					columns={picColumns}
					data={filteredPics}
					totalRows={filteredPics.length}
					pageSize={filteredPics.length || 1}
					emptyMessage="No PIC for this company"
				>
					{#snippet cell(row: any, column: Column, text: string)}
						{#if column.key === 'phone' && row.phone}
							<a href="tel:{row.phone}" class="flex items-center gap-1.5 text-cyan hover:underline">
								<Phone size={12} /> {row.phone}
							</a>
						{:else}
							{text}
						{/if}
					{/snippet}
				</DataTable>
			</Card>
		</div>
	{/if}
</div>

<Modal open={showForm} size="lg" title="Tambah Warehouse" onClose={() => (showForm = false)}>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<label for="w-name" class="form-label">
				Nama Warehouse <span class="req">*</span>
			</label>
			<Input id="w-name" bind:value={form.name} placeholder="cth. Gudang Priok" />
		</div>
		<div>
			<label for="w-city" class="form-label">Kota</label>
			<Input id="w-city" bind:value={form.city} placeholder="cth. Kota Jakarta Utara" />
		</div>

		<div class="md:col-span-2">
			<p class="mb-1 text-xs text-muted">Titik Lokasi di Peta</p>
			<MapView markers={pickedMarkers} onPick={(c) => (picked = c)} height="260px" />
			<p class="mt-1 text-xs text-muted">
				Klik peta untuk menentukan titik lokasi. Tanpa titik lokasi, warehouse tetap
				tersimpan — tetapi rute dan jarak tidak bisa dihitung sampai titiknya diisi.
			</p>
		</div>

		<div>
			<label for="w-lat" class="form-label">Latitude</label>
			<Input id="w-lat" value={picked ? picked[1].toFixed(6) : ''} placeholder="Belum ditentukan" readonly />
		</div>
		<div>
			<label for="w-lon" class="form-label">Longitude</label>
			<Input id="w-lon" value={picked ? picked[0].toFixed(6) : ''} placeholder="Belum ditentukan" readonly />
		</div>

		<div class="md:col-span-2">
			<label for="w-address" class="form-label">Alamat Lengkap</label>
			<Input id="w-address" bind:value={form.address} placeholder="Jl. Yos Sudarso No.88, Kec. Tanjung Priok…" />
		</div>

		<div>
			<label for="w-district" class="form-label">Kecamatan</label>
			<Input id="w-district" bind:value={form.district} placeholder="cth. Tanjung Priok" />
		</div>
		<div>
			<label for="w-geofence" class="form-label">Radius Geofence (m)</label>
			<Input id="w-geofence" type="number" bind:value={form.geofenceRadiusMeters} placeholder="200" />
			<p class="mt-1 text-xs text-muted">
				Seberapa dekat dihitung "tiba". Kosongkan untuk memakai 200 m.
			</p>
		</div>

		<div>
			<label for="w-pic" class="form-label">Nama PIC</label>
			<Input id="w-pic" bind:value={form.picName} placeholder="cth. Slamet Riyanto" />
		</div>
		<div>
			<label for="w-picphone" class="form-label">Telepon PIC</label>
			<Input id="w-picphone" bind:value={form.picPhone} placeholder="cth. 081298761001" />
		</div>

		{#if formError}
			<p class="md:col-span-2 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
				{formError}
			</p>
		{/if}

		<div class="md:col-span-2 flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showForm = false)}>Batal</Button>
			<Button onclick={saveWarehouse} loading={saving} disabled={!form.name.trim()}>Simpan</Button>
		</div>
	</div>
</Modal>
