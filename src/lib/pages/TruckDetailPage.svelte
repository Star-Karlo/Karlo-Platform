<script lang="ts">
	/**
	 * Truck Detail / Edit Truck — the prototype's TruckDetailView.vue against
	 * GET/PUT /vehicles/{id}. The register's own columns (plate, colour,
	 * brand, type) come first; every prototype-only field — hull number,
	 * axle, cargo types, STNK/KIR numbers and periods, dimensions, capacity —
	 * lives in the vehicle's free-form `attributes`, which the service
	 * merges on update.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		Ruler,
		RectangleHorizontal,
		MapPin,
		Disc3,
		Truck,
		Package,
		FileText,
		Calendar,
		Tag,
		Paintbrush,
		Box,
		Weight,
		Container,
		User
	} from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { truckIllustrationSVG } from '$lib/revamp/truckIllustration.js';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';

	let {
		basePath = '/t',
		id,
		editMode = false
	}: { basePath?: string; id: string; editMode?: boolean } = $props();

	const FIELDS = [
		'noLambung',
		'plate',
		'location',
		'axle',
		'type',
		'cargoType',
		'noStnk',
		'stnkFrom',
		'stnkTo',
		'noKir',
		'kirFrom',
		'kirTo',
		'brand',
		'color',
		'dimP',
		'dimL',
		'dimT',
		'maxWeight',
		'maxVolume'
	] as const;
	type Field = (typeof FIELDS)[number];

	let truck = $state<Record<Field, string> | null>(null);
	let loaded = $state(false);
	let form = $state<Record<Field, string>>(
		Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>
	);
	let brandNames = $state<Record<string, string>>({});
	// Driver pairing, editable here as well as on My Fleet. Same field FMS shows.
	let drivers = $state<{ id: string; fullName: string; status?: string }[]>([]);
	let currentDriverId = $state('');
	let savedDriverId = $state('');
	let driverOptions = $derived([
		{ value: '', label: '— Tanpa driver —' },
		...drivers.map((d) => ({ value: d.id, label: d.fullName + (d.status && d.status !== 'active' ? ` (${d.status})` : '') }))
	]);
	let driverName = $derived(drivers.find((d) => d.id === savedDriverId)?.fullName ?? '');

	function fromVehicle(v: any): Record<Field, string> {
		const a = v.attributes ?? {};
		const str = (x: unknown) => (x == null ? '' : String(x));
		return {
			noLambung: str(a.noLambung),
			plate: str(v.licensePlate),
			location: str(a.location),
			axle: str(a.axle),
			type: str(a.type ?? a.fmsVehicleType),
			cargoType: str(a.cargoType),
			noStnk: str(a.noStnk),
			stnkFrom: str(a.stnkFrom),
			stnkTo: str(a.stnkTo),
			noKir: str(a.noKir),
			kirFrom: str(a.kirFrom),
			kirTo: str(a.kirTo),
			brand: str(a.brand || brandNames[v.brandId ?? ''] || ''),
			color: str(v.color),
			dimP: str(a.dimP),
			dimL: str(a.dimL),
			dimT: str(a.dimT),
			maxWeight: str(a.maxWeight),
			maxVolume: str(a.maxVolume)
		};
	}

	async function load() {
		try {
			const [v, brands, ds] = await Promise.allSettled([
				api.get(ENDPOINTS.vehicles.one(id)),
				api.get('/catalog/brand', { pageSize: 200 }),
				api.get(ENDPOINTS.drivers.list, { pageSize: 500 })
			]);
			if (ds.status === 'fulfilled') drivers = ds.value.data?.data ?? [];
			if (brands.status === 'fulfilled') {
				const rows: any[] = brands.value.data?.data?.items ?? brands.value.data?.data ?? [];
				brandNames = Object.fromEntries(rows.map((b: any) => [b.id, b.name]));
			}
			if (v.status === 'fulfilled') {
				const raw = v.value.data?.data ?? {};
				truck = fromVehicle(raw);
				form = { ...truck };
				savedDriverId = raw.currentDriverId ?? '';
				currentDriverId = savedDriverId;
			}
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat data truck');
		} finally {
			loaded = true;
		}
	}
	onMount(load);

	function val(field: Field) {
		return truck?.[field] || '-';
	}
	function cargoChips() {
		return String(val('cargoType')).split('\n').filter(Boolean);
	}

	function backToFleet() {
		goto(`${basePath}/fleet/truck-list`);
	}

	async function save() {
		const attributes: Record<string, string> = {};
		for (const f of FIELDS) {
			if (f === 'plate' || f === 'color') continue;
			attributes[f] = form[f];
		}
		try {
			await api.put(ENDPOINTS.vehicles.update(id), {
				licensePlate: form.plate.trim(),
				color: form.color.trim(),
				currentDriverId: currentDriverId || null,
				attributes
			});
			toast('Data truck ' + form.plate + ' berhasil diperbarui');
			backToFleet();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memperbarui data truck');
		}
	}
</script>

<button class="btn btn-text back-btn" onclick={backToFleet}>&larr; Kembali ke My Fleet</button>
<div class="page-head">
	<div><h1>{editMode ? 'Edit Truck' : 'Truck Detail'}</h1></div>
</div>

{#if loaded && !truck}
	<div class="card card-pad"><div class="empty">Truck tidak ditemukan.</div></div>
{:else if truck}
	<div class="detail-grid">
		<div class="detail-col">
			<!-- Info Kendaraan -->
			<div class="card detail-card">
				<div class="detail-header header-blue">Info Kendaraan</div>
				<div class="card-pad">
					<div class="dfield-row">
						<div class="dfield">
							<div class="dfield-icon icon-blue"><Ruler size={16} /></div>
							<div class="dfield-body">
								<div class="dfield-label">No Lambung Truk</div>
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.noLambung}
										/>{:else}{val('noLambung')}{/if}
								</div>
							</div>
						</div>
						<div class="dfield">
							<div class="dfield-icon icon-blue"><RectangleHorizontal size={16} /></div>
							<div class="dfield-body">
								<div class="dfield-label">No Plat Polisi Truk</div>
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.plate}
										/>{:else}{val('plate')}{/if}
								</div>
							</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><MapPin size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Lokasi Truk Sekarang</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.location}
									/>{:else}{val('location')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Disc3 size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Axle Truk</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.axle}
									/>{:else}{val('axle')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Truck size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Truck Type</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.type}
									/>{:else}{val('type')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield" style="margin-bottom:0;">
						<div class="dfield-icon icon-blue"><Package size={16} /></div>
						<div class="dfield-body" style="width:100%;">
							<div class="dfield-label">Cargo Type</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}
									<textarea
										class="pairing-input"
										style="width:100%; min-height:70px; resize:vertical;"
										bind:value={form.cargoType}></textarea>
								{:else}
									{#each cargoChips() as c, i (i)}<span class="cargo-chip">{c}</span>{/each}
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Driver -->
			<div class="card detail-card">
				<div class="detail-header header-blue">Driver</div>
				<div class="card-pad">
					<div class="dfield-row">
						<div class="dfield">
							<div class="dfield-icon icon-blue"><User size={16} /></div>
							<div class="dfield-body">
								<div class="dfield-label">Driver Terpasang</div>
								{#if editMode}
									<FieldSelect bind:value={currentDriverId} options={driverOptions} searchable placeholder="Pilih driver" />
									<div class="hint" style="margin-top:6px;">Satu driver per truck. Pairing yang sama tampil di FMS.</div>
								{:else}
									<div class="detail-value">{driverName || '-'}</div>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Fisik Kendaraan -->
			<div class="card detail-card">
				<div class="detail-header header-blue">Fisik Kendaraan</div>
				<div class="card-pad">
					<div class="doc-label">Foto Truck (Tampak Depan)</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="truck-illustration">{@html truckIllustrationSVG('front')}</div>
					<div class="divider"></div>
					<div class="doc-label">Foto Truck (Tampak Belakang)</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="truck-illustration">{@html truckIllustrationSVG('back')}</div>
					<div class="divider"></div>
					<div class="doc-label">Foto Truck (Tampak Kanan)</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="truck-illustration">{@html truckIllustrationSVG('right')}</div>
					<div class="divider"></div>
					<div class="doc-label" style="margin-top:0;">Foto Truck (Tampak Kiri)</div>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="truck-illustration" style="margin-bottom:0;">{@html truckIllustrationSVG('left')}</div>
				</div>
			</div>
		</div>

		<div class="detail-col">
			<!-- Surat Kendaraan -->
			<div class="card detail-card">
				<div class="detail-header header-blue">Surat Kendaraan</div>
				<div class="card-pad">
					<div class="doc-label">Foto STNK</div>
					<div class="doc-photo-placeholder ph-blue">
						<FileText size={22} />
						<span>Belum ada foto diunggah</span>
					</div>
					<div class="dfield" style="margin-top:16px;">
						<div class="dfield-icon icon-blue"><FileText size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">No STNK</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.noStnk}
									/>{:else}{val('noStnk')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Calendar size={16} /></div>
						<div class="dfield-body" style="width:100%;">
							<div class="dfield-label">Periode Aktif STNK</div>
							<div class="date-range">
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.stnkFrom}
										/>{:else}{val('stnkFrom')}{/if}
								</div>
								<span class="dr-arrow">&#8594;</span>
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.stnkTo}
										/>{:else}{val('stnkTo')}{/if}
								</div>
							</div>
						</div>
					</div>
					<div class="divider"></div>
					<div class="doc-label">Foto KIR BED</div>
					<div class="doc-photo-placeholder ph-blue">
						<FileText size={22} />
						<span>Belum ada foto diunggah</span>
					</div>
					<div class="dfield" style="margin-top:16px;">
						<div class="dfield-icon icon-blue"><FileText size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">No KIR BED</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.noKir}
									/>{:else}{val('noKir')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield" style="margin-bottom:0;">
						<div class="dfield-icon icon-blue"><Calendar size={16} /></div>
						<div class="dfield-body" style="width:100%;">
							<div class="dfield-label">Periode Aktif KIR BED</div>
							<div class="date-range">
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.kirFrom}
										/>{:else}{val('kirFrom')}{/if}
								</div>
								<span class="dr-arrow">&#8594;</span>
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.kirTo}
										/>{:else}{val('kirTo')}{/if}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Detail Kendaraan -->
			<div class="card detail-card">
				<div class="detail-header header-blue">Detail Kendaraan</div>
				<div class="card-pad">
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Tag size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Brand</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.brand}
									/>{:else}{val('brand')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield-row">
						<div class="dfield">
							<div class="dfield-icon icon-blue"><Paintbrush size={16} /></div>
							<div class="dfield-body">
								<div class="dfield-label">Color Truk Terkini</div>
								<div class="detail-value" class:editing={editMode}>
									{#if editMode}<input
											type="text"
											class="pairing-input"
											style="width:100%;"
											bind:value={form.color}
										/>{:else}{val('color')}{/if}
								</div>
							</div>
						</div>
						<div class="dfield">
							<div class="dfield-icon icon-blue"><Box size={16} /></div>
							<div class="dfield-body" style="width:100%;">
								<div class="dfield-label">Dimensions (M) — P &times; L &times; T</div>
								<div class="dim-row">
									<div class="detail-value" class:editing={editMode}>
										{#if editMode}<input
												type="text"
												class="pairing-input"
												style="width:100%;"
												bind:value={form.dimP}
											/>{:else}{val('dimP')}{/if}
									</div>
									<span class="dr-arrow">&times;</span>
									<div class="detail-value" class:editing={editMode}>
										{#if editMode}<input
												type="text"
												class="pairing-input"
												style="width:100%;"
												bind:value={form.dimL}
											/>{:else}{val('dimL')}{/if}
									</div>
									<span class="dr-arrow">&times;</span>
									<div class="detail-value" class:editing={editMode}>
										{#if editMode}<input
												type="text"
												class="pairing-input"
												style="width:100%;"
												bind:value={form.dimT}
											/>{:else}{val('dimT')}{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Weight size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Max Cargo's Weight (Kg)</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.maxWeight}
									/>{:else}{val('maxWeight')}{/if}
							</div>
						</div>
					</div>
					<div class="dfield" style="margin-bottom:0;">
						<div class="dfield-icon icon-blue"><Container size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Max Cargo Volume (M&sup3;)</div>
							<div class="detail-value" class:editing={editMode}>
								{#if editMode}<input
										type="text"
										class="pairing-input"
										style="width:100%;"
										bind:value={form.maxVolume}
									/>{:else}{val('maxVolume')}{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="detail-actions">
		<button class="btn btn-outline" onclick={backToFleet}>Back</button>
		{#if editMode}<button class="btn btn-primary" onclick={save}>Update</button>{/if}
	</div>
{/if}
