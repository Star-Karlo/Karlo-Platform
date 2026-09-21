<script lang="ts">
	/**
	 * Port of Karlo-TMS-Revamp/src/views/AgreementFormView.vue — Tambah
	 * Agreement (no `id`) and Renewal Agreement (`id` of the version being
	 * renewed).
	 *
	 * Customers are the transporter's shippers (GET /shippers); the term fields
	 * the prototype kept on the Firestore doc go to `detail`. The AGR number is
	 * minted by the server, but the customer still needs an abbreviation for it.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { X } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { formatThousands, parseThousands } from '$lib/revamp/currency.js';
	import { fileToCompressedDataUrl } from '$lib/revamp/imageUpload.js';
	import { fileToDataUrl } from '$lib/revamp/documentUpload.js';
	import { PRICING_TYPE_OPTIONS } from '$lib/revamp/pricingType.js';
	import { PAYMENT_TYPE_OPTIONS, INCOME_TAX_OPTIONS } from '$lib/revamp/paymentType.js';
	import { INDONESIAN_CITY_OPTIONS } from '$lib/revamp/indonesianCities.js';
	import { kecamatanOptionsFor } from '$lib/revamp/kecamatanData.js';
	import { AGREEMENT_TYPE_OPTIONS } from '$lib/revamp/agreementType.js';
	import { toAgreementRow, type AgreementRow, type AgreementRouteEntry } from '$lib/revamp/agreementView';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import TruckTypeMatrixRevamp from '$lib/components/revamp/TruckTypeMatrixRevamp.svelte';
	import { TRUCK_BODY_TYPES, TRUCK_SIZES, truckTypeKey } from '$lib/revamp/truckTypes.js';
	import { MAX_TRUCK_OPTIONS, describeTruckOption } from '$lib/revamp/truckOptions.js';

	let { basePath = '/t', id = null }: { basePath?: string; id?: string | null } = $props();

	interface Customer {
		id: string;
		name: string;
		abbreviation?: string | null;
	}
	interface CargoType {
		id: string;
		name: string;
	}
	interface CargoItem {
		id: string;
		name: string;
		cargoTypeId?: string;
		parentId?: string;
		attributes?: { truckTypeMatrix?: string[] } | null;
	}

	let editing = $derived(!!id);
	let existing = $state<AgreementRow | null>(null);

	let customers = $state<Customer[]>([]);
	let truckTypeNames = $state<string[]>([]);
	let cargoTypes = $state<CargoType[]>([]);
	let cargoItems = $state<CargoItem[]>([]);
	let cargoItemsLoaded = $state(false);

	let customerOptions = $derived(customers.map((c) => ({ value: c.name, label: c.name })));
	// Truck Options: the (max 5) truck types the planner may assign to orders
	// under this agreement, chosen from the types the cargo item allows.
	// "Body|Size" keys, the same vocabulary the matrix and Allocate use.
	let truckOptionChoices = $derived.by(() => {
		const keys = form.truckTypeMatrix.length
			? form.truckTypeMatrix
			: TRUCK_BODY_TYPES.flatMap((b: string) => TRUCK_SIZES.map((sz: string) => truckTypeKey(b, sz)));
		return keys.map((k: string) => ({ value: k, label: describeTruckOption(k).label }));
	});
	function onTruckOptionsChange(v: string | string[]) {
		const arr = Array.isArray(v) ? v : [];
		if (arr.length > MAX_TRUCK_OPTIONS) {
			toast(`Maksimal ${MAX_TRUCK_OPTIONS} Truck Options per agreement`);
			form.truckOptions = arr.slice(0, MAX_TRUCK_OPTIONS);
		}
	}
	const DURATION_TYPE_OPTIONS = [
		{ value: 'monthly', label: 'Bulanan' },
		{ value: 'yearly', label: 'Tahunan' }
	];

	/** The catalog returns an item's parent under attributes.cargoTypeId. */
	function parentIdOf(it: CargoItem) {
		return it.cargoTypeId || it.parentId || (it as any).attributes?.cargoTypeId || '';
	}
	function specificNama(it: CargoItem) {
		const parent = cargoTypes.find((t) => t.id === parentIdOf(it));
		return parent?.name || '';
	}
	let cargoSpecificOptions = $derived(cargoTypes.map((s) => ({ value: s.name, label: s.name })));
	let cargoItemOptions = $derived.by(() => {
		const list = form.cargoTypeSpecific
			? cargoItems.filter((it) => specificNama(it) === form.cargoTypeSpecific)
			: cargoItems;
		return list.map((it) => ({ value: it.name, label: it.name }));
	});

	function newRouteEntry(): AgreementRouteEntry {
		return { kota: '', level: 'kota', kecamatan: '' }; // level: 'kota' | 'kecamatan'
	}

	const form = $state({
		customerNama: '',
		agreementType: '',
		initialRoutes: [newRouteEntry()] as AgreementRouteEntry[],
		destinationRoutes: [newRouteEntry()] as AgreementRouteEntry[],
		tanggalMulai: '',
		durationType: 'monthly',
		durationValue: '' as string | number,
		deskripsi: '',
		cargoTypeSpecific: '',
		namaBarang: '',
		truckTypeMatrix: [] as string[],
		pricingType: '',
		tonaseMin: '',
		tonaseMax: '',
		paymentType: '',
		incomeTaxStatus: '',
		truckTypeOptional: [] as string[],
		truckOptions: [] as string[],
		termsAndCondition: '',
		documentData: '',
		documentName: '',
		documentType: ''
	});

	function toggleRouteLevel(entry: AgreementRouteEntry) {
		entry.level = entry.level === 'kecamatan' ? 'kota' : 'kecamatan';
		entry.kecamatan = '';
	}
	function onRouteKotaChange(entry: AgreementRouteEntry, value: string | string[]) {
		const v = Array.isArray(value) ? value[0] || '' : value;
		entry.kota = v;
		const stillValid = kecamatanOptionsFor(v).some((o: { value: string }) => o.value === entry.kecamatan);
		if (!stillValid) entry.kecamatan = '';
	}

	let isMultiShipment = $derived(form.agreementType === 'multi-shipment');
	function onAgreementTypeChange(val: string | string[]) {
		if (val !== 'multi-shipment') {
			form.initialRoutes = [form.initialRoutes[0] || newRouteEntry()];
			form.destinationRoutes = [form.destinationRoutes[0] || newRouteEntry()];
		}
	}

	// Per-Truk is a flat price regardless of load, so Minimum/Maximum Load
	// don't apply — the fields stay visible (disabled) rather than hidden, but
	// any value entered before switching to Per-Truk is cleared.
	let isPerTruk = $derived(form.pricingType === 'per-truk');
	function onPricingTypeChange(val: string | string[]) {
		if (val === 'per-truk') {
			form.tonaseMin = '';
			form.tonaseMax = '';
		}
	}
	function addInitialRoute() {
		form.initialRoutes.push(newRouteEntry());
	}
	function removeInitialRoute(i: number) {
		if (form.initialRoutes.length <= 1) return;
		form.initialRoutes.splice(i, 1);
	}
	function addDestinationRoute() {
		form.destinationRoutes.push(newRouteEntry());
	}
	function removeDestinationRoute(i: number) {
		if (form.destinationRoutes.length <= 1) return;
		form.destinationRoutes.splice(i, 1);
	}

	function routeDisplayValue(r: AgreementRouteEntry) {
		return r.level === 'kecamatan' && r.kecamatan ? r.kecamatan : r.kota;
	}
	let kotaAsalSummary = $derived(form.initialRoutes.map(routeDisplayValue).filter(Boolean).join(' + '));
	let kotaTujuanSummary = $derived(form.destinationRoutes.map(routeDisplayValue).filter(Boolean).join(' + '));

	let hargaDisplay = $state('');
	function onHargaInput(e: Event) {
		hargaDisplay = formatThousands((e.currentTarget as HTMLInputElement).value);
	}

	function onCargoTypeChange(val: string | string[]) {
		if (!cargoItemsLoaded) return;
		const stillValid = cargoItems.some((it) => it.name === form.namaBarang && specificNama(it) === val);
		if (!stillValid) form.namaBarang = '';
	}
	// Selecting a cargo item copies its truck type matrix onto the agreement
	// (re-evaluated when the catalogue arrives, like the prototype's watch on
	// [namaBarang, cargoItems]).
	$effect(() => {
		const item = cargoItems.find((it) => it.name === form.namaBarang);
		if (item) form.truckTypeMatrix = item.attributes?.truckTypeMatrix || [];
	});

	function applyExisting(a: AgreementRow) {
		form.customerNama = a.customerNama || '';
		form.agreementType = a.agreementType || '';
		// Prefer the initialRoutes/destinationRoutes arrays; fall back to the
		// flat kotaAsal/kotaTujuan fields for agreements saved without them.
		form.initialRoutes = a.initialRoutes?.length
			? a.initialRoutes.map((r) => ({
					kota: r.kota || '',
					level: r.level || 'kota',
					kecamatan: r.kecamatan || ''
				}))
			: [
					{
						kota: a.kotaAsal || '',
						level: (a.kotaAsalLevel as 'kota' | 'kecamatan') || 'kota',
						kecamatan: (a.kecamatanAsal as string) || ''
					}
				];
		form.destinationRoutes = a.destinationRoutes?.length
			? a.destinationRoutes.map((r) => ({
					kota: r.kota || '',
					level: r.level || 'kota',
					kecamatan: r.kecamatan || ''
				}))
			: [
					{
						kota: a.kotaTujuan || '',
						level: (a.kotaTujuanLevel as 'kota' | 'kecamatan') || 'kota',
						kecamatan: (a.kecamatanTujuan as string) || ''
					}
				];
		form.tanggalMulai = a.tanggalMulai || '';
		form.durationType = a.durationType || 'monthly';
		form.durationValue = a.durationValue ?? '';
		form.deskripsi = a.deskripsi || '';
		form.cargoTypeSpecific = a.cargoTypeSpecific || '';
		form.namaBarang = a.namaBarang || '';
		form.truckTypeMatrix = a.truckTypeMatrix || [];
		form.pricingType = a.pricingType || '';
		form.tonaseMin = a.tonaseMin || '';
		form.tonaseMax = a.tonaseMax || '';
		form.paymentType = a.paymentType || '';
		form.incomeTaxStatus = a.incomeTaxStatus || '';
		form.truckTypeOptional = Array.isArray(a.truckTypeOptional) ? a.truckTypeOptional : [];
		form.truckOptions = Array.isArray(a.truckOptions) ? a.truckOptions.slice(0, MAX_TRUCK_OPTIONS) : [];
		form.termsAndCondition = a.termsAndCondition || '';
		form.documentData = a.documentData || '';
		form.documentName = a.documentName || '';
		form.documentType = a.documentType || '';
		hargaDisplay = a.tarif ? formatThousands(String(a.tarif)) : '';
	}

	onMount(async () => {
		const loads: Promise<unknown>[] = [
			api
				.get(ENDPOINTS.shippers.list)
				.then((r) => {
					customers = Array.isArray(r.data?.data) ? r.data.data : [];
					// Opened from a customer's row on MyAgreement: start with them.
					const pre = new URLSearchParams(window.location.search).get('customer');
					if (pre && !editing && !form.customerNama) {
						const c = customers.find((x) => x.id === pre);
						if (c) form.customerNama = c.name;
					}
				})
				.catch(() => (customers = [])),
			api
				.get(ENDPOINTS.catalog.list('truckType'), { pageSize: 200 })
				.then(
					(r) =>
						(truckTypeNames = (Array.isArray(r.data?.data) ? r.data.data : []).map(
							(t: { name?: string }) => t.name || ''
						))
				)
				.catch(() => (truckTypeNames = [])),
			api
				.get(ENDPOINTS.catalog.list('cargoType'), { pageSize: 200 })
				.then((r) => (cargoTypes = Array.isArray(r.data?.data) ? r.data.data : []))
				.catch(() => (cargoTypes = [])),
			api
				.get(ENDPOINTS.catalog.list('item'), { pageSize: 500 })
				.then((r) => (cargoItems = Array.isArray(r.data?.data) ? r.data.data : []))
				.catch(() => (cargoItems = []))
				.finally(() => (cargoItemsLoaded = true))
		];
		if (id) {
			loads.push(
				api
					.get(ENDPOINTS.agreements.one(id))
					.then((r) => {
						existing = r.data?.data ? toAgreementRow(r.data.data) : null;
						if (existing) applyExisting(existing);
					})
					.catch(() => (existing = null))
			);
		}
		await Promise.all(loads);
	});

	let tanggalBerakhirComputed = $derived.by(() => {
		if (!form.tanggalMulai || !form.durationValue) return '';
		const d = new Date(form.tanggalMulai);
		if (form.durationType === 'yearly') d.setFullYear(d.getFullYear() + Number(form.durationValue));
		else d.setMonth(d.getMonth() + Number(form.durationValue));
		d.setDate(d.getDate() - 1);
		return d.toISOString().slice(0, 10);
	});

	let uploadingDoc = $state(false);
	async function onUploadDocument(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg';
		const isPdf = file.type === 'application/pdf';
		if (!isJpg && !isPdf) {
			toast('Format file harus PDF atau JPG');
			return;
		}
		uploadingDoc = true;
		try {
			if (isJpg) {
				form.documentData = await fileToCompressedDataUrl(file, 1400, 0.8);
			} else {
				form.documentData = await fileToDataUrl(file);
			}
			form.documentName = file.name;
			form.documentType = file.type;
		} catch (err) {
			toast((err as Error)?.message || 'Gagal mengunggah dokumen');
		} finally {
			uploadingDoc = false;
		}
	}
	function removeDocument() {
		form.documentData = '';
		form.documentName = '';
		form.documentType = '';
	}

	let saving = $state(false);

	let selectedCustomer = $derived(customers.find((c) => c.name === form.customerNama) || null);

	function validate() {
		if (!form.customerNama) return 'Customer Name wajib dipilih';
		if (!form.agreementType) return 'Type Agreement wajib dipilih';
		if (form.initialRoutes.some((r) => !r.kota) || form.destinationRoutes.some((r) => !r.kota)) {
			return 'Initial Route dan Destination Route wajib diisi';
		}
		if (!form.tanggalMulai || !form.durationValue) return 'Tanggal Mulai dan Contract Duration wajib diisi';
		// The No. Agreement format embeds the customer's abbreviation
		// (AGR-{transporter}-{customer}-{seq}), so a brand-new agreement can't be
		// numbered until that customer has one set in Customer List.
		if (!editing && !selectedCustomer?.abbreviation) {
			return 'Customer yang dipilih belum punya Kode Singkatan Perusahaan — lengkapi dulu di Master Data > Customer List';
		}
		// The server rejects a rate without a pricing type.
		if (!form.pricingType) return 'Pricing Type wajib dipilih';
		return null;
	}

	function isoAtMidnight(date: string) {
		return `${date}T00:00:00Z`;
	}

	async function submit() {
		const error = validate();
		if (error) {
			toast(error);
			return;
		}
		saving = true;
		try {
			const payload = {
				customerNama: form.customerNama,
				agreementType: form.agreementType,
				initialRoutes: form.initialRoutes.map((r) => ({
					kota: r.kota,
					level: r.level,
					kecamatan: r.level === 'kecamatan' ? r.kecamatan : ''
				})),
				destinationRoutes: form.destinationRoutes.map((r) => ({
					kota: r.kota,
					level: r.level,
					kecamatan: r.level === 'kecamatan' ? r.kecamatan : ''
				})),
				kotaAsal: kotaAsalSummary,
				kotaTujuan: kotaTujuanSummary,
				tanggalMulai: form.tanggalMulai,
				durationType: form.durationType,
				durationValue: Number(form.durationValue),
				tanggalBerakhir: tanggalBerakhirComputed,
				deskripsi: form.deskripsi.trim(),
				cargoTypeSpecific: form.cargoTypeSpecific.trim(),
				namaBarang: form.namaBarang.trim(),
				truckTypeMatrix: form.truckTypeMatrix,
				pricingType: form.pricingType,
				tarif: parseThousands(hargaDisplay),
				tonaseMin: isPerTruk ? '' : form.tonaseMin,
				tonaseMax: isPerTruk ? '' : form.tonaseMax,
				paymentType: form.paymentType,
				incomeTaxStatus: form.incomeTaxStatus,
				truckTypeOptional: form.truckTypeOptional,
				truckOptions: form.truckOptions.slice(0, MAX_TRUCK_OPTIONS),
				termsAndCondition: form.termsAndCondition.trim(),
				documentData: form.documentData,
				documentName: form.documentName,
				documentType: form.documentType
			};
			const customerCompanyId = selectedCustomer?.id || existing?.shipperCompanyId || '';
			const rates = [
				{
					customerCompanyId,
					originCityId: payload.kotaAsal,
					destinationCityId: payload.kotaTujuan,
					pricingTypeId: payload.pricingType,
					truckTypeId: '',
					price: String(payload.tarif)
				}
			];
			if (editing && id) {
				await api.post(ENDPOINTS.agreements.revise(id), {
					kind: 'renewal',
					note: '',
					validFrom: isoAtMidnight(payload.tanggalMulai),
					validUntil: isoAtMidnight(payload.tanggalBerakhir),
					paymentTypeId: payload.paymentType,
					currencyId: 'IDR',
					rates,
					detail: payload
				});
				toast('Agreement berhasil diperbarui (versi baru dibuat)');
			} else {
				await api.post(ENDPOINTS.agreements.create, {
					customerCompanyId,
					agreementType: payload.agreementType,
					validFrom: isoAtMidnight(payload.tanggalMulai),
					validUntil: isoAtMidnight(payload.tanggalBerakhir),
					paymentTypeId: payload.paymentType,
					currencyId: 'IDR',
					customers: [{ companyId: customerCompanyId }],
					rates,
					detail: payload
				});
				toast('Agreement baru berhasil ditambahkan');
			}
			goto(`${basePath}/agreement`);
		} catch (e) {
			toast((e as any)?.response?.data?.message || 'Gagal menyimpan agreement');
		} finally {
			saving = false;
		}
	}

	function cancel() {
		goto(`${basePath}/agreement`);
	}
</script>

<button class="btn btn-text back-btn" onclick={cancel}>&larr; Kembali ke Agreement</button>
<div class="page-head">
	<div>
		<h1>
			{editing ? 'Renewal Agreement' : 'Tambah Agreement'}{#if editing}<span
					class="hint"
					style="font-weight:500; margin-left:8px;"
					>— {existing?.idAgreement || ''} (akan menjadi Version {(existing?.version || 1) + 1})</span
				>{/if}
		</h1>
	</div>
</div>

<div class="card card-pad">
	<div class="two-col">
		<div class="field">
			<label>Customer Name <span class="req">*</span></label>
			<FieldSelect bind:value={form.customerNama} options={customerOptions} placeholder="Pilih customer" />
		</div>
		<div class="field">
			<label>Type Agreement <span class="req">*</span></label>
			<FieldSelect
				bind:value={form.agreementType}
				options={AGREEMENT_TYPE_OPTIONS}
				placeholder="Pilih tipe agreement"
				onchange={onAgreementTypeChange}
			/>
		</div>
	</div>
	<div class="two-col">
		<div class="field">
			<label>Initial Route <span class="req">*</span></label>
			{#each form.initialRoutes as r, i (i)}
				<div class="route-entry">
					<div class="route-field-row">
						<div class="route-field-select">
							<FieldSelect
								value={r.kota}
								onchange={(v) => onRouteKotaChange(r, v)}
								options={INDONESIAN_CITY_OPTIONS}
								placeholder={i === 0 ? 'Cari kota/kabupaten asal...' : `Cari kota/kabupaten asal ${i + 1}...`}
								searchable
							/>
						</div>
						<button type="button" class="btn btn-outline btn-sm" onclick={() => toggleRouteLevel(r)}>
							{r.level === 'kecamatan' ? '− Kecamatan' : '+ Kecamatan'}
						</button>
						{#if form.initialRoutes.length > 1}
							<button
								type="button"
								class="mini-icon-btn-del"
								title="Hapus rute ini"
								onclick={() => removeInitialRoute(i)}><span class="icon-wrap"><X size={15} /></span></button
							>
						{/if}
					</div>
					{#if r.level === 'kecamatan'}
						{#if kecamatanOptionsFor(r.kota).length}
							<FieldSelect
								bind:value={r.kecamatan}
								options={kecamatanOptionsFor(r.kota)}
								placeholder="Cari kecamatan asal..."
								style="margin-top:8px;"
								searchable
							/>
						{:else}
							<input
								type="text"
								bind:value={r.kecamatan}
								placeholder="cth. Kecamatan Coblong"
								style="margin-top:8px;"
							/>
							<span class="hint" style="display:block; margin-top:5px;"
								>Belum ada data kecamatan untuk wilayah ini, silakan ketik manual.</span
							>
						{/if}
					{/if}
				</div>
			{/each}
			{#if isMultiShipment}
				<button type="button" class="btn btn-outline btn-sm" onclick={addInitialRoute}>+ Rute</button>
			{/if}
		</div>
		<div class="field">
			<label>Destination Route <span class="req">*</span></label>
			{#each form.destinationRoutes as r, i (i)}
				<div class="route-entry">
					<div class="route-field-row">
						<div class="route-field-select">
							<FieldSelect
								value={r.kota}
								onchange={(v) => onRouteKotaChange(r, v)}
								options={INDONESIAN_CITY_OPTIONS}
								placeholder={i === 0
									? 'Cari kota/kabupaten tujuan...'
									: `Cari kota/kabupaten tujuan ${i + 1}...`}
								searchable
							/>
						</div>
						<button type="button" class="btn btn-outline btn-sm" onclick={() => toggleRouteLevel(r)}>
							{r.level === 'kecamatan' ? '− Kecamatan' : '+ Kecamatan'}
						</button>
						{#if form.destinationRoutes.length > 1}
							<button
								type="button"
								class="mini-icon-btn-del"
								title="Hapus rute ini"
								onclick={() => removeDestinationRoute(i)}
								><span class="icon-wrap"><X size={15} /></span></button
							>
						{/if}
					</div>
					{#if r.level === 'kecamatan'}
						{#if kecamatanOptionsFor(r.kota).length}
							<FieldSelect
								bind:value={r.kecamatan}
								options={kecamatanOptionsFor(r.kota)}
								placeholder="Cari kecamatan tujuan..."
								style="margin-top:8px;"
								searchable
							/>
						{:else}
							<input
								type="text"
								bind:value={r.kecamatan}
								placeholder="cth. Kecamatan Coblong"
								style="margin-top:8px;"
							/>
							<span class="hint" style="display:block; margin-top:5px;"
								>Belum ada data kecamatan untuk wilayah ini, silakan ketik manual.</span
							>
						{/if}
					{/if}
				</div>
			{/each}
			{#if isMultiShipment}
				<button type="button" class="btn btn-outline btn-sm" onclick={addDestinationRoute}>+ Rute</button>
			{/if}
		</div>
	</div>
</div>

<div class="card card-pad" style="margin-top:16px;">
	<div class="two-col">
		<div class="field">
			<label>Tanggal Mulai <span class="req">*</span></label>
			<input type="date" bind:value={form.tanggalMulai} />
		</div>
		<div class="field">
			<label>Contract Duration <span class="req">*</span></label>
			<div class="two-col" style="gap:16px;">
				<div class="field">
					<FieldSelect
						bind:value={form.durationType}
						options={DURATION_TYPE_OPTIONS}
						placeholder="Pilih tipe"
					/>
				</div>
				<div class="field" style="margin-bottom:0;">
					<input
						type="number"
						min="1"
						value={form.durationValue}
						oninput={(e) => (form.durationValue = (e.currentTarget as HTMLInputElement).value)}
						placeholder={form.durationType === 'yearly' ? 'Jumlah tahun' : 'Jumlah bulan'}
					/>
				</div>
			</div>
		</div>
	</div>
	<div class="hint" style="margin:-6px 0 16px;">
		Tanggal berakhir otomatis: <b>{tanggalBerakhirComputed || '-'}</b>
	</div>

	<div class="field">
		<label>Description</label>
		<textarea rows="5" bind:value={form.deskripsi} placeholder="cth. Termasuk biaya tol & asuransi"
		></textarea>
	</div>
	<div class="two-col">
		<div class="field">
			<label>Cargo Type</label>
			<FieldSelect
				bind:value={form.cargoTypeSpecific}
				options={cargoSpecificOptions}
				placeholder="Pilih Cargo Type"
				onchange={onCargoTypeChange}
			/>
		</div>
		<div class="field">
			<label>Cargo Item</label>
			<FieldSelect bind:value={form.namaBarang} options={cargoItemOptions} placeholder="Pilih Cargo Item" />
			<div class="hint" style="margin-top:6px;">
				Belum ada di daftar? Tambah lewat menu Master Data → MyCargo.
			</div>
		</div>
	</div>

	<div class="field">
		<label>Type of Truck Sesuai Muatan</label>
		<div class="hint" style="margin-bottom:8px;">
			Ditentukan otomatis oleh sistem berdasarkan Cargo Item yang dipilih.
		</div>
		<TruckTypeMatrixRevamp value={form.truckTypeMatrix} readonly />
	</div>

	<div class="field">
		<label>Truck Options (opsional, maks. {MAX_TRUCK_OPTIONS})</label>
		<div class="hint" style="margin-bottom:8px;">
			Jenis truck pilihan untuk agreement ini — tampil sebagai acuan planner saat menugaskan truck ke order dari agreement ini.
		</div>
		<FieldSelect
			bind:value={form.truckOptions}
			options={truckOptionChoices}
			placeholder="Pilih jenis truck (opsional)"
			multiple
			chipsBelow
			onchange={onTruckOptionsChange}
		/>
	</div>
	<div class="two-col">
		<div class="field">
			<label>Pricing Type</label>
			<FieldSelect
				bind:value={form.pricingType}
				options={PRICING_TYPE_OPTIONS}
				placeholder="Pilih tipe harga"
				onchange={onPricingTypeChange}
			/>
		</div>
		<div class="field">
			<label>Harga (Rp)</label>
			<input type="text" inputmode="numeric" value={hargaDisplay} oninput={onHargaInput} placeholder="0" />
		</div>
	</div>
	<div class="two-col">
		<div class="field">
			<label>Minimum Load</label>
			<input
				type="number"
				min="0"
				value={form.tonaseMin}
				oninput={(e) => (form.tonaseMin = (e.currentTarget as HTMLInputElement).value)}
				placeholder="0"
				disabled={isPerTruk}
			/>
		</div>
		<div class="field">
			<label>Maximum Load</label>
			<input
				type="number"
				min="0"
				value={form.tonaseMax}
				oninput={(e) => (form.tonaseMax = (e.currentTarget as HTMLInputElement).value)}
				placeholder="0"
				disabled={isPerTruk}
			/>
		</div>
	</div>
	<div class="two-col">
		<div class="field">
			<label>Payment Type (TOP)</label>
			<FieldSelect
				bind:value={form.paymentType}
				options={PAYMENT_TYPE_OPTIONS}
				placeholder="Pilih payment type"
			/>
		</div>
		<div class="field">
			<label>Income Tax</label>
			<FieldSelect
				bind:value={form.incomeTaxStatus}
				options={INCOME_TAX_OPTIONS}
				placeholder="Pilih status income tax"
			/>
		</div>
	</div>

	<div class="field">
		<label>Terms and Condition</label>
		<textarea
			rows="5"
			bind:value={form.termsAndCondition}
			placeholder="Tuliskan syarat dan ketentuan perjanjian di sini..."></textarea>
	</div>

	<div class="field" style="margin-bottom:0;">
		<label
			>Upload Agreement Document <span class="hint">(PDF atau JPG saja, maks. 700 KB untuk PDF)</span></label
		>

		{#if form.documentData}
			<div class="upload-doc-row">
				{#if form.documentType !== 'application/pdf'}
					<img src={form.documentData} class="upload-image-preview" alt="Preview dokumen" />
				{:else}
					<div class="upload-image-placeholder">📕</div>
				{/if}
				<div class="upload-image-actions">
					<div class="upload-doc-name">{form.documentName}</div>
					<a href={form.documentData} target="_blank" rel="noopener" class="upload-doc-view">Lihat Dokumen</a>
					<button type="button" class="upload-image-remove" onclick={removeDocument}>Hapus dokumen</button>
				</div>
			</div>
		{:else}
			<label
				class="btn btn-outline btn-sm"
				style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;"
			>
				{uploadingDoc ? 'Mengunggah...' : 'Upload Dokumen (PDF/JPG)'}
				<input
					type="file"
					accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg"
					class="upload-image-input"
					disabled={uploadingDoc}
					onchange={onUploadDocument}
				/>
			</label>
		{/if}
	</div>
</div>

<div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
	<button class="btn btn-outline" onclick={cancel}>Batal</button>
	<button class="btn btn-primary" disabled={saving} onclick={submit}>
		{saving ? 'Menyimpan...' : editing ? 'Simpan Renewal' : 'Simpan Agreement'}
	</button>
</div>
