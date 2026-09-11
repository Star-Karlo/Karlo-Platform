<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Handshake, ArrowLeft, Plus, Trash2 } from 'lucide-svelte';
	import { agreementActions, agreementStore } from '$lib/stores/agreements';
	import { asOptions, catalog, loadCatalogs } from '$lib/stores/catalog';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		Button,
		Card,
		Field,
		FileField,
		FormGrid,
		Input,
		PageHeader,
		Select,
		Spinner,
		TruckMatrix
	} from '$lib/components/ui';
	import { fieldConfigActions, isEnabled, isRequired } from '$lib/stores/fieldconfig';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import type { FieldConfig } from '$lib/stores/fieldconfig';
	import type { UploadedFile } from '$lib/utils/upload';

	/**
	 * Create an agreement.
	 *
	 * The service models an agreement as a header (counterparty, validity,
	 * payment terms) plus one or more **rates** — each a priced lane of
	 * origin city, destination city, truck type and pricing type. The old
	 * single-route form could not express that, so this one takes rate rows.
	 *
	 * The caller is always the shipper side, which is why there is no
	 * to-transporter / to-shipper toggle: the service derives the shipper from
	 * the token.
	 *
	 * Description, item name, terms and the load range go into `detail`, a
	 * free-form object. The truck-type x body matrix from the old form is
	 * deliberately absent — if it governs which vehicles may serve a rate it
	 * belongs on the rate as real columns, not encoded into a blob nothing can
	 * query.
	 */
	let { basePath, title = 'Create Agreement' }: { basePath: string; title?: string } = $props();

	/**
	 * What this company's agreement form asks for.
	 *
	 * The same answer the create endpoint validates against, from the same
	 * server-side method — so this form cannot build a submission the service
	 * then refuses for a field reason.
	 */
	let fields = $state<FieldConfig[]>([]);
	/**
	 * Kecamatan-level lanes. Off for most companies: they price city to city,
	 * and a field everyone must skip is a field everyone learns to ignore.
	 */
	let useDistricts = $derived(
		isEnabled(fields, 'route.originDistrictId') || isEnabled(fields, 'route.destinationDistrictId')
	);

	/**
	 * The body-and-size grid, for companies that price per combination.
	 *
	 * Off unless the company enabled it: most agreements name a truck type or
	 * leave it open, and a grid of seventy checkboxes on every form is a grid
	 * everyone learns to skip.
	 */
	let useMatrix = $derived(isEnabled(fields, 'truckMatrix'));

	/**
	 * Which lanes have their kecamatan revealed.
	 *
	 * Per lane rather than page-wide: an agreement usually prices most lanes by
	 * city and one or two more finely, and showing four extra selects on every
	 * row for the sake of one is how a form becomes something people skim past.
	 */
	let districtRows = $state<Set<number>>(new Set());

	function toggleDistrictRow(i: number) {
		const next = new Set(districtRows);
		next.has(i) ? next.delete(i) : next.add(i);
		districtRows = next;
	}
	let matrix = $state<string[]>([]);

	/**
	 * Contract duration, which DERIVES the end date rather than asking for it.
	 *
	 * Typing both a start and an end invites them to disagree with the term
	 * everyone actually negotiated ("twelve months"). Choosing months and
	 * computing the end keeps the two consistent, and the computed date is
	 * shown so nobody has to trust it blind.
	 */
	/**
	 * Whether this caller has to be ASKED who the transporter is.
	 *
	 * Only Karlo staff do. A transporter creating its own agreement is the
	 * transporter — offering it a dropdown containing one entry, itself, is a
	 * question with a known answer and a chance to get it wrong. A shipper
	 * still picks, because for them the transporter is the counterparty.
	 */
	let ownCompanyId = $derived($actingFor.companyId || $authStore.user?.companyId || '');
	let callerIsTransporter = $derived(
		!$authStore.user?.isPlatformStaff &&
			($actingFor.companyRole || $authStore.user?.companyRole) === 'transporter'
	);
	let choosesTransporter = $derived(!callerIsTransporter);

	// Filled in rather than asked for. Kept in an effect so it survives the
	// identity arriving after first render, and so switching the acting-for
	// client re-points it.
	$effect(() => {
		if (callerIsTransporter && ownCompanyId) form.transporterCompanyId = ownCompanyId;
	});

	/**
	 * Currencies, fixed rather than read from master data.
	 *
	 * Five is the whole list the business trades in, and it does not change
	 * with a company's catalogue. IDR is pre-selected because essentially
	 * every contract is in it.
	 */
	const CURRENCIES = [
		{ value: 'IDR', label: 'IDR — Rupiah' },
		{ value: 'USD', label: 'USD — US Dollar' },
		{ value: 'EUR', label: 'EUR — Euro' },
		{ value: 'MYR', label: 'MYR — Ringgit' },
		{ value: 'SGD', label: 'SGD — Singapore Dollar' }
	];

	let paymentTermDays = $state('');
	let incomeTax = $state('');
	let durationUnit = $state('month');
	let durationCount = $state('');

	const DURATION_UNITS = [
		{ value: 'month', label: 'Bulanan' },
		{ value: 'year', label: 'Tahunan' }
	];

	let derivedUntil = $derived.by(() => {
		const count = Number(durationCount);
		if (!form.validFrom || !count) return '';
		const start = new Date(form.validFrom);
		if (Number.isNaN(start.getTime())) return '';
		const end = new Date(start);
		if (durationUnit === 'year') end.setFullYear(end.getFullYear() + count);
		else end.setMonth(end.getMonth() + count);
		// A day before the anniversary: a twelve-month term starting 1 Jan ends
		// 31 Dec, not 1 Jan of the next year, which would overlap its renewal.
		end.setDate(end.getDate() - 1);
		return end.toISOString().slice(0, 10);
	});

	// The derived date IS the submitted one. Keeping a separate editable field
	// would let the two drift, and the stored agreement would then disagree
	// with the term printed on it.
	$effect(() => {
		if (derivedUntil) form.validUntil = derivedUntil;
	});
	let bodies = $state<{ id: string; label: string }[]>([]);
	let truckClasses = $state<{ id: string; label: string }[]>([]);

	let warehouseOptions = $state<{ value: string; label: string }[]>([]);

	async function loadWarehouses() {
		try {
			const res = await api.get(ENDPOINTS.warehouses.list, { pageSize: 200 });
			warehouseOptions = (res.data?.data ?? []).map((w: any) => ({
				value: w.id,
				label: w.city ? `${w.name} — ${w.city}` : w.name
			}));
		} catch {
			warehouseOptions = [];
		}
	}

	async function loadMatrixAxes() {
		try {
			const [b, c] = await Promise.all([
				api.get(ENDPOINTS.catalog.list('truckBody'), { pageSize: 200 }),
				api.get(ENDPOINTS.catalog.list('truckClass'), { pageSize: 200 })
			]);
			bodies = (b.data?.data ?? []).map((e: any) => ({
				id: e.id,
				label: e.name,
				// From master data, so a company that uploads a picture for its
				// own body kind gets it here without a code change.
				imageKey: e.attributes?.imageKey
			}));
			// Sorted by the catalogue's own sortOrder: these have a natural
			// order — smallest to largest — that alphabetical sorting destroys.
			truckClasses = (c.data?.data ?? [])
				.map((e: any) => ({
					id: e.id,
					label: e.name,
					sort: Number(e.attributes?.sortOrder ?? 0)
				}))
				.sort((x: any, y: any) => x.sort - y.sort)
				.map(({ id, label }: any) => ({ id, label }));
		} catch {
			bodies = [];
			truckClasses = [];
		}
	}

	/**
	 * The clients this agreement covers.
	 *
	 * A transporter signs one contract covering several of its clients; forcing
	 * one agreement each means the same terms typed repeatedly, and a price
	 * change touching N documents instead of one.
	 *
	 * The counterparty is always covered and is added by the server, so it does
	 * not appear here — listing it would invite somebody to remove it.
	 */
	let clientOptions = $state<{ value: string; label: string }[]>([]);

	interface RateRow {
		// Which client this lane prices for. Empty means every customer the
		// agreement covers, which is the ordinary case.
		customerCompanyId: string;

		// A warehouse pair is the only lane that can be MEASURED: a city pair
		// has no coordinates to route between, so it carries a price and no
		// distance.
		originWarehouseId: string;
		destinationWarehouseId: string;

		originCityId: string;
		destinationCityId: string;
		originDistrictId: string;
		destinationDistrictId: string;
		truckTypeId: string;
		pricingTypeId: string;
		price: string;
		minQuantity: string;
		leadTimeHours: string;
	}

	function blankRate(): RateRow {
		return {
			customerCompanyId: '',
			originWarehouseId: '',
			destinationWarehouseId: '',
			originCityId: '',
			destinationCityId: '',
			originDistrictId: '',
			destinationDistrictId: '',
			truckTypeId: '',
			pricingTypeId: '',
			price: '',
			minQuantity: '',
			leadTimeHours: ''
		};
	}

	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let form = $state({
		transporterCompanyId: '',
		validFrom: '',
		validUntil: '',
		paymentTypeId: '',
		currencyId: 'IDR',
		description: '',
		itemTypeId: '',
		cargoTypeId: '',
		minLoadKg: '',
		maxLoadKg: '',
		terms: '',
		// Single or multiple shipment. It decides whether one order under this
		// agreement can split into child shipments, so it belongs on the
		// agreement rather than being chosen per order.
		agreementType: ''
	});

	const AGREEMENT_TYPES = [
		{ value: 'single', label: 'Single Shipment' },
		{ value: 'multi', label: 'Multi Shipment' }
	];

	let rates = $state<RateRow[]>([blankRate()]);

	/**
	 * The clients this agreement covers, read off the priced lanes.
	 *
	 * Deliberately not a field of its own: a customer is covered because a
	 * lane is priced for them. Two lists would drift, and the interesting
	 * failure — a customer covered but unpriced — is silent.
	 */
	let coveredCustomers = $derived([
		...new Set(rates.map((r) => r.customerCompanyId).filter((id): id is string => !!id))
	]);

	/** The signed agreement, stored as a key on `detail`. */
	let document_ = $state<UploadedFile | null>(null);

	/**
	 * Counterparties, gathered from agreements this company already has.
	 *
	 * There is no endpoint that lists companies you could trade with, so a
	 * genuinely new counterparty cannot be selected here yet — its id has to be
	 * pasted. Flagged rather than hidden.
	 */
	let counterparties = $state<{ value: string; label: string }[]>([]);
	let manualCompany = $state(false);

	/**
	 * Something the form needs failed to load. Shown, and the form is shown
	 * anyway: a select with no options is a visible, recoverable state, while
	 * a spinner that never ends tells nobody anything.
	 */
	let degraded = $state('');

	onMount(async () => {
		try {
			// The configuration first: it decides whether the kecamatan selects
			// exist at all, and therefore whether the district list is worth
			// fetching. Kecamatan is an order of magnitude larger than kota, so a
			// company that prices city to city should never pay for it.
			fields = await fieldConfigActions.load('agreement');
		} catch {
			degraded = 'Form configuration could not be loaded; every field is shown as optional.';
		}

		const kinds: Parameters<typeof loadCatalogs>[0] = [
			'kota', 'truckType', 'pricingType', 'paymentType', 'currency', 'itemType', 'cargoType'
		];
		if (useDistricts) kinds.push('district');
		try {
			// Bounded: when master data is unreachable every catalogue call hangs
			// to the HTTP timeout, and awaiting them in sequence turned one dead
			// dependency into a thirty-second spinner.
			await Promise.race([
				loadCatalogs(kinds),
				new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
			]);
		} catch {
			degraded = 'Master data is not responding; the dropdowns may be empty.';
		}
		if (useMatrix) {
			try {
				await loadMatrixAxes();
			} catch {
				degraded = 'Master data is not responding; the truck matrix is unavailable.';
			}
		}

		// The transporter's own clients — the same list the Customer List
		// screen shows, because these ARE companies rather than master data.
		try {
			const res = await api.get(ENDPOINTS.shippers.list);
			clientOptions = (res.data?.data ?? []).map((c: any) => ({
				value: c.id,
				label: c.abbreviation ? `${c.name} (${c.abbreviation})` : c.name
			}));
		} catch {
			clientOptions = [];
		}

		try {
			await loadWarehouses();
		} catch {
			degraded = 'Master data is not responding; warehouses are unavailable.';
		}
		try {
			const res = await api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 100 });
			const seen = new Map<string, string>();
			for (const a of res.data.data ?? []) {
				if (a.transporterCompanyId) {
					seen.set(a.transporterCompanyId, a.transporterCompanyName ?? a.transporterCompanyId);
				}
			}
			counterparties = [...seen].map(([value, label]) => ({ value, label }));
		} catch {
			counterparties = [];
		}
		loading = false;
	});

	function addRate() {
		rates = [...rates, blankRate()];
	}

	function removeRate(index: number) {
		rates = rates.filter((_, i) => i !== index);
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';

		if (!form.transporterCompanyId.trim()) {
			error = callerIsTransporter
				? 'Your account is not attached to a company, so this agreement has no transporter.'
				: 'Choose the transporter this agreement is with.';
			return;
		}
		if (!form.validFrom || !form.validUntil) {
			error = 'An agreement needs a validity period.';
			return;
		}
		const usable = rates.filter((r) => r.originCityId && r.destinationCityId && r.price);
		if (usable.length === 0) {
			error = 'Add at least one rate with an origin, a destination and a price.';
			return;
		}

		saving = true;
		try {
			await agreementActions.create({
				transporterCompanyId: form.transporterCompanyId,
				agreementType: form.agreementType || undefined,
				// The service wants RFC3339; a date input gives a plain date.
				validFrom: new Date(form.validFrom).toISOString(),
				validUntil: new Date(form.validUntil).toISOString(),
				paymentTypeId: form.paymentTypeId || undefined,
				currencyId: form.currencyId || undefined,
				// Derived from the lanes rather than collected separately. A
				// customer is covered by this agreement precisely because a
				// lane is priced for them, so asking twice only created two
				// lists that could disagree.
				customers: coveredCustomers.map((companyId) => ({ companyId })),
				rates: usable.map((r, i) => ({
					originCityId: r.originCityId,
					destinationCityId: r.destinationCityId,
					// Sent only when the company routes below city level. A
					// hidden field carrying a value is REFUSED by the service,
					// not ignored — silently dropping it would look identical
					// to saving it from here.
					customerCompanyId: r.customerCompanyId || undefined,
					originWarehouseId: r.originWarehouseId || undefined,
					destinationWarehouseId: r.destinationWarehouseId || undefined,
					originDistrictId: districtRows.has(i) ? r.originDistrictId || undefined : undefined,
					destinationDistrictId: districtRows.has(i)
						? r.destinationDistrictId || undefined
						: undefined,
					truckTypeId: r.truckTypeId || undefined,
					pricingTypeId: r.pricingTypeId || undefined,
					price: r.price,
					minQuantity: r.minQuantity ? Number(r.minQuantity) : undefined,
					leadTimeHours: r.leadTimeHours ? Number(r.leadTimeHours) : undefined
				})),
				// Free-form until these become real columns.
				detail: {
					// Stored as `bodyId:classId` pairs. The PAIR is the unit —
					// storing the two axes separately would multiply out to
					// combinations nobody agreed to.
					truckMatrix: useMatrix && matrix.length > 0 ? matrix : undefined,
					// Free-form for now, like the rest of `detail`. These become
					// real columns when the invoice starts computing from them.
					paymentTermDays: paymentTermDays ? Number(paymentTermDays) : undefined,
					incomeTaxIncluded: incomeTax ? incomeTax === 'include' : undefined,
					contractDuration: durationCount
						? { unit: durationUnit, count: Number(durationCount) }
						: undefined,
					description: form.description || undefined,
					itemTypeId: form.itemTypeId || undefined,
					cargoTypeId: form.cargoTypeId || undefined,
					minLoadKg: form.minLoadKg || undefined,
					maxLoadKg: form.maxLoadKg || undefined,
					terms: form.terms || undefined,
					// Stored as a key; a signed URL would expire on the record.
					document: document_ ?? undefined
				}
			} as any);
			goto(basePath);
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not create this agreement.';
			saving = false;
		}
	}
</script>

<PageHeader {title} icon={Handshake}>
	{#snippet actions()}
		<Button variant="ghost" href={basePath}><ArrowLeft size={14} /> Kembali</Button>
	{/snippet}
</PageHeader>

{#if $authStore.user?.isPlatformStaff && !$actingFor.companyId}
	<!-- Staff who forget to pick a client would file this under Karlo's own
	     company, which ships nothing. Said before the form rather than after
	     the save, when it is a record to unpick. -->
	<div class="note-banner" role="status">
		<span>⚠️</span>
		<div>
			You are acting as <b>Karlo</b>, not a client. This agreement would be recorded against
			Karlo's own company. Choose a client in the bar above to record it on their behalf.
		</div>
	</div>
{:else if $actingFor.companyId}
	<div class="note-banner" role="status">
		<span>🏢</span>
		<div>
			Recording this agreement for <b>{$actingFor.companyName}</b>. Their form configuration
			decides which fields are required below.
		</div>
	</div>
{/if}

{#if error}
	<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{error}</div></div>
{/if}
{#if degraded}
	<div class="note-banner" role="status"><span>⚠️</span><div>{degraded}</div></div>
{/if}

{#if loading}
	<div class="flex justify-center py-16"><Spinner size={32} /></div>
{:else}
	<form onsubmit={submit}>
		<div class="card card-pad" style="margin-top:16px;">
			<FormGrid>
				{#if !choosesTransporter}
					<!-- Not a question for a transporter: it is itself. Shown as a
					     read-only statement so the record's other party is still
					     visible, rather than silently assumed. -->
					<Field label="Transporter" id="transporter" wide>
						<Input
							id="transporter"
							value={$actingFor.companyName || $authStore.user?.companyName || 'Your company'}
							readonly
						/>
						<span class="hint">Recorded against your own company.</span>
					</Field>
				{:else}
				<Field label="Transporter" id="transporter" required wide>
					{#if counterparties.length > 0 && !manualCompany}
						<Select
							id="transporter"
							bind:value={form.transporterCompanyId}
							options={counterparties}
							placeholder="Pilih transporter"
						/>
						<button type="button" class="btn btn-text btn-sm" onclick={() => (manualCompany = true)}>
							Enter a company id instead
						</button>
					{:else}
						<Input
							id="transporter"
							bind:value={form.transporterCompanyId}
							placeholder="Transporter company id (uuid)"
						/>
						<span class="hint">
							No endpoint lists companies you could trade with yet, so a new counterparty has
							to be identified by id.
						</span>
					{/if}
				</Field>
				{/if}

				{#if isEnabled(fields, 'agreementType')}
					<Field
						label="Type Agreement"
						id="agreementType"
						required={isRequired(fields, 'agreementType')}
						wide
						help="A multi-shipment agreement lets one order split into child shipments, each with its own driver and status."
					>
						<Select
							id="agreementType"
							bind:value={form.agreementType}
							options={AGREEMENT_TYPES}
							placeholder="Pilih tipe agreement"
						/>
					</Field>
				{/if}

				<Field label="Tanggal Mulai" id="validFrom" required>
					<Input id="validFrom" type="date" bind:value={form.validFrom} />
				</Field>

				<Field
					label="Contract Duration"
					id="duration"
					required
					help="Tanggal berakhir otomatis: {derivedUntil || '-'}"
				>
					<div class="route-field-row">
						<div class="route-field-select">
							<Select id="duration" bind:value={durationUnit} options={DURATION_UNITS} placeholder="Bulanan" />
						</div>
						<div style="width:130px; flex-shrink:0;">
							<Input
								type="number"
								bind:value={durationCount}
								placeholder={durationUnit === 'year' ? 'Jumlah tahun' : 'Jumlah bulan'}
							/>
						</div>
					</div>
				</Field>

				<!-- Payment type is not asked for. Every agreement settles in full
				     on one invoice, so a dropdown with one real answer was a
				     required-looking field that taught people to skip fields. The
				     value is still SENT, so the record and the invoice logic are
				     unchanged; bring the control back here if staged terms
				     become a real product. -->
				<Field label="Currency" id="currencyId">
					<Select
						id="currencyId"
						bind:value={form.currencyId}
						options={CURRENCIES}
						placeholder="IDR — Rupiah"
					/>
				</Field>
			</FormGrid>
		</div>

		<div class="section-title"><h2>Rute &amp; Harga</h2></div>
		<div class="card card-pad">
			<p class="hint" style="margin-bottom:14px;">
				Each row prices one lane. A lane may name two cities, two kecamatan, or two warehouses —
				the more specific pair wins. Only a warehouse pair can be measured: a city has no
				coordinates to route between, so those lanes carry a price and no distance.
			</p>

			{#each rates as rate, i}
				<div class="lane-card">
					<div class="lane-card-head">
						<span>Rate {i + 1}</span>
						{#if rates.length > 1}
							<button
								type="button"
								class="mini-icon-btn-del"
								aria-label="Hapus rate {i + 1}"
								onclick={() => removeRate(i)}
							>
								<Trash2 size={14} />
							</button>
						{/if}
					</div>

					<Field
						label="Customer"
						id="ratecust-{i}"
						required
						help="Choosing a customer here is what adds them to this agreement."
					>
						<Select
							id="ratecust-{i}"
							bind:value={rate.customerCompanyId}
							options={clientOptions}
							placeholder="Pilih customer"
						/>
					</Field>

					<FormGrid>
						<Field label="Initial Route" id="from-{i}" required>
							<div class="route-field-row">
								<div class="route-field-select">
									<Select
										id="from-{i}"
										bind:value={rate.originCityId}
										options={asOptions($catalog.kota)}
										placeholder="Cari kota/kabupaten asal…"
									/>
								</div>
								<!-- Kecamatan is revealed per lane rather than being a page-wide
								     switch: an agreement often prices most lanes by city and one
								     or two more finely. -->
								{#if useDistricts}
									<button type="button" class="btn btn-outline btn-sm" onclick={() => toggleDistrictRow(i)}>
										{districtRows.has(i) ? '− Kecamatan' : '+ Kecamatan'}
									</button>
								{/if}
							</div>
							{#if useDistricts && districtRows.has(i)}
								<div style="margin-top:8px;">
									<Select
										id="fromkec-{i}"
										bind:value={rate.originDistrictId}
										options={asOptions($catalog.district)}
										placeholder="Cari kecamatan asal…"
									/>
								</div>
							{/if}
						</Field>

						<Field label="Destination Route" id="to-{i}" required>
							<div class="route-field-row">
								<div class="route-field-select">
									<Select
										id="to-{i}"
										bind:value={rate.destinationCityId}
										options={asOptions($catalog.kota)}
										placeholder="Cari kota/kabupaten tujuan…"
									/>
								</div>
								{#if useDistricts}
									<button type="button" class="btn btn-outline btn-sm" onclick={() => toggleDistrictRow(i)}>
										{districtRows.has(i) ? '− Kecamatan' : '+ Kecamatan'}
									</button>
								{/if}
							</div>
							{#if useDistricts && districtRows.has(i)}
								<div style="margin-top:8px;">
									<Select
										id="tokec-{i}"
										bind:value={rate.destinationDistrictId}
										options={asOptions($catalog.district)}
										placeholder="Cari kecamatan tujuan…"
									/>
								</div>
							{/if}
						</Field>

						<Field label="Loading Point" id="fromwh-{i}" help="Optional — a warehouse pair is what makes the distance measurable.">
							<Select
								id="fromwh-{i}"
								bind:value={rate.originWarehouseId}
								options={warehouseOptions}
								placeholder="Pilih warehouse muat"
							/>
						</Field>
						<Field label="Unloading Point" id="towh-{i}">
							<Select
								id="towh-{i}"
								bind:value={rate.destinationWarehouseId}
								options={warehouseOptions}
								placeholder="Pilih warehouse bongkar"
							/>
						</Field>
					</FormGrid>

					<FormGrid cols={3}>
						<Field label="Truck Type" id="tt-{i}">
							<Select id="tt-{i}" bind:value={rate.truckTypeId} options={asOptions($catalog.truckType)} placeholder="Semua" />
						</Field>
						<Field label="Pricing Type" id="pt-{i}">
							<Select id="pt-{i}" bind:value={rate.pricingTypeId} options={asOptions($catalog.pricingType)} placeholder="Pilih tipe harga" />
						</Field>
						<Field label="Harga (Rp)" id="price-{i}">
							<Input id="price-{i}" type="number" bind:value={rate.price} placeholder="0" />
						</Field>
					</FormGrid>

					<FormGrid>
						<Field label="Minimum Quantity" id="minq-{i}">
							<Input id="minq-{i}" type="number" bind:value={rate.minQuantity} placeholder="0" />
						</Field>
						<Field label="Lead Time (jam)" id="lead-{i}" class="!mb-0">
							<Input id="lead-{i}" type="number" bind:value={rate.leadTimeHours} placeholder="0" />
						</Field>
					</FormGrid>

					<!-- Said before saving, because it explains why some lanes will show a
					     distance afterwards and others will not. -->
					<p class="hint" style="margin-top:10px;">
						{#if rate.originWarehouseId && rate.destinationWarehouseId}
							Warehouse lane — the road distance is measured from MAPID when this is saved.
						{:else}
							City or kecamatan lane — no coordinates to measure between, so no distance. Name
							two warehouses to get one.
						{/if}
					</p>
				</div>
			{/each}

			<button type="button" class="btn btn-outline btn-sm" onclick={addRate}>
				<Plus size={14} /> Tambah Rate
			</button>
		</div>

		{#if useMatrix}
			<div class="section-title"><h2>Type of Truck Sesuai Muatan</h2></div>
			<div class="card card-pad">
				<p class="hint" style="margin-bottom:12px;">
					Tick the body-and-size combinations this agreement covers. Both axes come from Master
					Data — add a body or a class there and it appears here.
				</p>
				<TruckMatrix {bodies} classes={truckClasses} bind:selected={matrix} />
			</div>
		{/if}

		<div class="section-title"><h2>Detail Muatan</h2></div>
		<div class="card card-pad">
			<FormGrid>
				<Field label="Cargo Type" id="cargoTypeId">
					<Select id="cargoTypeId" bind:value={form.cargoTypeId} options={asOptions($catalog.cargoType)} placeholder="Pilih cargo type" />
				</Field>
				<Field
					label="Cargo Item"
					id="itemTypeId"
					help="Belum ada di daftar? Tambah lewat menu Master Data → Items."
				>
					<Select id="itemTypeId" bind:value={form.itemTypeId} options={asOptions($catalog.itemType)} placeholder="Pilih item" />
				</Field>
			</FormGrid>

			<Field label="Description" id="description">
				<textarea
					id="description"
					bind:value={form.description}
					rows="4"
					placeholder="cth. Termasuk biaya tol &amp; asuransi"
				></textarea>
			</Field>

			<FormGrid>
				{#if isEnabled(fields, 'minLoad')}
					<Field label="Minimum Load (Kg)" id="minLoadKg">
						<Input id="minLoadKg" type="number" bind:value={form.minLoadKg} placeholder="0" />
					</Field>
				{/if}
				{#if isEnabled(fields, 'maxLoad')}
					<Field label="Maximum Load (Kg)" id="maxLoadKg">
						<Input id="maxLoadKg" type="number" bind:value={form.maxLoadKg} placeholder="0" />
					</Field>
				{/if}
				{#if isEnabled(fields, 'paymentTermDays')}
					<Field label="Payment Type (TOP)" id="top" help="Days from invoice to payment.">
						<Input id="top" type="number" bind:value={paymentTermDays} placeholder="cth. 60" />
					</Field>
				{/if}
				{#if isEnabled(fields, 'incomeTaxIncluded')}
					<Field label="Income Tax (PPh 23)" id="tax">
						<Select
							id="tax"
							bind:value={incomeTax}
							options={[
								{ value: 'include', label: 'Include — price already carries PPh 23' },
								{ value: 'exclude', label: 'Exclude — PPh 23 added on the invoice' }
							]}
							placeholder="Pilih status income tax"
						/>
					</Field>
				{/if}
			</FormGrid>

			<Field label="Terms and Condition" id="terms">
				<textarea
					id="terms"
					bind:value={form.terms}
					rows="4"
					placeholder="Tuliskan syarat dan ketentuan perjanjian di sini…"
				></textarea>
			</Field>

			<FileField
				bind:value={document_}
				purpose="agreementDocument"
				label="Upload Agreement Document"
				hint="PDF atau JPG saja"
				accept="application/pdf,image/jpeg"
			/>
		</div>

		<div style="display:flex; justify-content:flex-end; gap:12px; margin:18px 0 8px;">
			<Button variant="outline" href={basePath}>Batal</Button>
			<Button type="submit" variant="primary" loading={saving}>Simpan Agreement</Button>
		</div>
	</form>
{/if}
