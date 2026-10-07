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
	import { X, Pencil } from 'lucide-svelte';
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
	import { agreementTypeOptions, BILLING_SPLIT_OPTIONS } from '$lib/revamp/agreementType.js';
	import { fieldConfigActions, isEnabled, type FieldConfig } from '$lib/stores/fieldconfig';
	import { computeUangSangu, seedTripAllowance } from '$lib/revamp/uangSangu.js';
	import { formatIDR } from '$lib/revamp/currency.js';
	import WarehouseSearchField from '$lib/components/revamp/WarehouseSearchField.svelte';
	import WarehouseFormModal from '$lib/components/revamp/WarehouseFormModal.svelte';
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

	let customerOptions = $derived(customers.map((c) => ({ value: c.id, label: c.name })));
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
	/** The items under one cargo type, or all of them when none is chosen. */
	function cargoItemOptionsFor(cargoType: string) {
		const list = cargoType ? cargoItems.filter((it) => specificNama(it) === cargoType) : cargoItems;
		return list.map((it) => ({ value: it.name, label: it.name }));
	}

	function newRouteEntry(): AgreementRouteEntry {
		return { kota: '', level: 'kota', kecamatan: '' }; // level: 'kota' | 'kecamatan'
	}

	const form = $state({
		customerNama: '',
		// The customer's company id — the form keys on the id, never the name:
		// two clients can share a name, and a browser translator rewrites
		// the text on screen.
		customerId: '',
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

	let cargoItemOptions = $derived(cargoItemOptionsFor(form.cargoTypeSpecific));

	let isMultiShipment = $derived(form.agreementType === 'multi-shipment');
	function onAgreementTypeChange(val: string | string[]) {
		// A single-shipment agreement covers one lane, so the extra ones go —
		// both ends of each, because they are pairs.
		if (val !== 'multi-shipment') {
			form.initialRoutes = [form.initialRoutes[0] || newRouteEntry()];
			form.destinationRoutes = [form.destinationRoutes[0] || newRouteEntry()];
		}
		// The warehouse lanes needed the same trim and never had it: switching
		// multi-shipment back to single left the extra pairs in place, out of
		// sight once the + Tambah Shipment button went, and submitted them.
		// Multi-customer keeps its lanes — Customer 1 carries its own, and
		// several of them is the point.
		if (val === 'single-shipment') {
			loadingPoints = [loadingPoints[0] ?? ''];
			unloadingPoints = [unloadingPoints[0] ?? ''];
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
	/* ---------- Lanes, one per shipment ----------
	   Initial route k and destination route k are Shipment k+1 — the same
	   pairing an order made from this agreement uses for its points. The two
	   lists only ever change together: a lane with an origin and no
	   destination is not a lane, and an order could not be priced against it. */
	/* ---------- Lanes named by warehouse ----------
	   A contract may price the two buildings rather than the two cities. Same
	   pairing as the city lanes and as an order's points: index k of each
	   list is Shipment k+1, added and removed together. Stored on the
	   agreement's detail, which is where the configurable fields live. */
	let loadingPoints = $state<string[]>(['']);
	let unloadingPoints = $state<string[]>(['']);
	let warehouses = $state<any[]>([]);
	let warehouseLaneCount = $derived(Math.max(loadingPoints.length, unloadingPoints.length, 1));
	function addWarehouseLane() {
		loadingPoints.push('');
		unloadingPoints.push('');
	}
	function removeWarehouseLane(k: number) {
		if (warehouseLaneCount <= 1) return;
		loadingPoints.splice(k, 1);
		unloadingPoints.splice(k, 1);
	}

	/* ---------- Several customers under one contract ----------
	   The contract's own customer is the first; these are the others. Each
	   carries its own lanes, because the whole point is that they are
	   different customers with different warehouses, and its own cargo.

	   An order placed against such a contract covers all of them at once —
	   one order, one truck, several customers' goods — which is why the
	   customers live on the contract rather than each having their own. */
	type ExtraCustomer = {
		customerId: string;
		customerName: string;
		cargoTypeId: string;
		cargoItemId: string;
		loadingPoints: string[];
		unloadingPoints: string[];
	};
	function newExtraCustomer(): ExtraCustomer {
		return {
			customerId: '',
			customerName: '',
			cargoTypeId: '',
			cargoItemId: '',
			loadingPoints: [''],
			unloadingPoints: ['']
		};
	}
	let extraCustomers = $state<ExtraCustomer[]>([]);
	/** How one agreed price is divided between those customers. By tonnage is
	 *  the default because it is the one that survives an uneven load. */
	let billingSplit = $state('proportional');
	let isMultiCustomer = $derived(form.agreementType === 'multi-customer');
	function addExtraCustomer() {
		extraCustomers.push(newExtraCustomer());
	}
	function removeExtraCustomer(i: number) {
		extraCustomers.splice(i, 1);
	}
	function addExtraLane(c: ExtraCustomer) {
		c.loadingPoints.push('');
		c.unloadingPoints.push('');
	}
	function removeExtraLane(c: ExtraCustomer, k: number) {
		if (c.loadingPoints.length <= 1) return;
		c.loadingPoints.splice(k, 1);
		c.unloadingPoints.splice(k, 1);
	}
	/** Switching away from Multi Customer drops the extra customers: a
	 *  contract that is not multi-customer has exactly one. */
	$effect(() => {
		if (!isMultiCustomer && extraCustomers.length) extraCustomers = [];
	});

	let agreementFields = $state<FieldConfig[] | null>(null);
	let lanesByWarehouse = $derived(isEnabled(agreementFields, 'lanes.loadingPoints'));
	let multiCustomerEnabled = $derived(isEnabled(agreementFields, 'multiCustomers'));
	let typeOptions = $derived(agreementTypeOptions(multiCustomerEnabled));

	/* ---------- The allowance this contract agrees ----------
	   A contract may fix the driver's allowance instead of leaving it to each
	   order: one figure for the lane, split into what is paid before leaving
	   and what follows reconciliation.

	   Computed by the SAME function an order uses, fed the distance between
	   the two warehouses named above. One computation, so the figure agreed
	   here and the figure an order would have worked out cannot drift apart
	   — which matters, because the whole point is that the order stops
	   computing and reports this instead. */
	let tripAllowance = $state<any>(seedTripAllowance());
	let laneKm = $state(0);
	let laneHours = $state(0);
	let allowanceUpfrontPercent = $state(60);
	let allowanceEnabled = $derived(isEnabled(agreementFields, 'allowance.upfrontPercent'));

	/* ---------- What the allowance is made of ----------
	   A single total is a figure to take on trust. The contract is agreeing a
	   sum the orders under it may not overrule, so it shows the arithmetic:
	   each component, how it was worked out, and a way to correct it where the
	   configured rate does not fit this lane.

	   Fuel and meals come from the same computeUangSangu an order uses, so the
	   contract and the orders under it cannot drift apart. Lodging is worked
	   out here rather than taken from that function, which only bills it after
	   the trip from actual nights — a contract has no actuals, so it estimates
	   from the ETA, rounded DOWN: a journey of under a day owes no night. */
	let allowanceOverrides = $state<Record<string, number | null>>({});
	let allowanceExtras = $state<{ label: string; amount: number | string }[]>([]);

	function overrideOr(key: string, computed: number) {
		const o = allowanceOverrides[key];
		return o === undefined || o === null ? computed : Number(o) || 0;
	}

	let allowanceComponents = $derived.by(() => {
		if (!laneKm) return [];
		const synthetic = { detail: { tripEstimate: { jarakKm: laneKm, etaJam: laneHours } } };
		const u = computeUangSangu(synthetic, tripAllowance);
		const nights = Math.floor((Number(laneHours) || 0) / 24);
		const perNight = Number(tripAllowance?.lodging?.nominalPerNight) || 0;
		const rows = [
			{ key: 'bbm', label: 'Uang Bahan Bakar', basis: u.bbm.formula, computed: Math.round(u.bbm.value) },
			{
				key: 'uangMakan',
				label: 'Uang Makan',
				basis: u.uangMakan.formula,
				computed: Math.round(u.uangMakan.value)
			},
			{
				key: 'lodging',
				label: 'Uang Penginapan',
				basis: `${nights} malam × ${formatIDR(perNight)} (ETA ${laneHours} Jam ÷ 24, dibulatkan ke bawah)`,
				computed: nights * perNight
			}
		];
		return rows.map((r) => ({
			...r,
			amount: overrideOr(r.key, r.computed),
			edited: allowanceOverrides[r.key] !== undefined && allowanceOverrides[r.key] !== null
		}));
	});

	let allowanceExtraTotal = $derived(allowanceExtras.reduce((sum, e) => sum + (Number(e.amount) || 0), 0));
	let allowanceTotal = $derived(
		allowanceComponents.reduce((sum, c) => sum + c.amount, 0) + allowanceExtraTotal
	);

	/** Which row is open for editing; the pencil opens it, Selesai closes it. */
	let editingAllowanceKey = $state('');
	function editAllowanceComponent(key: string, current: number) {
		if (allowanceOverrides[key] === undefined || allowanceOverrides[key] === null) {
			allowanceOverrides = { ...allowanceOverrides, [key]: current };
		}
		editingAllowanceKey = key;
	}
	/** Back to the configured rate — the override is removed, not zeroed. */
	function resetAllowanceComponent(key: string) {
		const next = { ...allowanceOverrides };
		delete next[key];
		allowanceOverrides = next;
		if (editingAllowanceKey === key) editingAllowanceKey = '';
	}
	function addAllowanceExtra() {
		allowanceExtras = [...allowanceExtras, { label: '', amount: '' }];
	}
	function removeAllowanceExtra(i: number) {
		allowanceExtras = allowanceExtras.filter((_, k) => k !== i);
	}
	let allowanceUpfront = $derived(
		Math.round((allowanceTotal * (Number(allowanceUpfrontPercent) || 0)) / 100)
	);
	let allowanceFinal = $derived(allowanceTotal - allowanceUpfront);

	/** Distance and time for the contract's first lane, from the real road
	 *  route between its two warehouses. Re-asked whenever either end moves. */
	$effect(() => {
		const from = loadingPoints[0];
		const to = unloadingPoints[0];
		if (!allowanceEnabled || !from || !to) {
			laneKm = 0;
			laneHours = 0;
			return;
		}
		const a = warehouses.find((w: any) => w.id === from);
		const b = warehouses.find((w: any) => w.id === to);
		const pointOf = (w: any) =>
			w && Number(w.longitude) && Number(w.latitude) ? [Number(w.longitude), Number(w.latitude)] : null;
		const pa = pointOf(a);
		const pb = pointOf(b);
		if (!pa || !pb) return;
		api
			.post(ENDPOINTS.routing.route, { points: [pa, pb], profile: 'truck', includeTolls: false })
			.then((r) => {
				const route = r.data?.data?.route ?? r.data?.data ?? {};
				laneKm = Math.round(((Number(route.distanceMeters) || 0) / 1000) * 10) / 10;
				laneHours = Math.round(((Number(route.durationSeconds) || 0) / 3600) * 10) / 10;
			})
			.catch(() => {
				/* no route: the card says the distance is not known yet */
			});
	});

	let routeShipmentCount = $derived(Math.max(form.initialRoutes.length, form.destinationRoutes.length, 1));
	function addShipmentRoute() {
		form.initialRoutes.push(newRouteEntry());
		form.destinationRoutes.push(newRouteEntry());
	}
	function removeShipmentRoute(k: number) {
		if (routeShipmentCount <= 1) return;
		form.initialRoutes.splice(k, 1);
		form.destinationRoutes.splice(k, 1);
	}

	function routeDisplayValue(r: AgreementRouteEntry) {
		return r.level === 'kecamatan' && r.kecamatan ? r.kecamatan : r.kota;
	}

	/* ---------- The lanes, when the form never asked for cities ----------
	   A contract priced warehouse to warehouse — and every multi-customer
	   contract, where each customer carries its own lanes in its own card —
	   never shows the Initial/Destination Route fields. The agreement still
	   records which cities it runs between, so they are read off the chosen
	   warehouses rather than left blank. */

	/* ---------- Whose warehouses a lane may pick from ----------
	   A transporter keeps its customers' warehouses in its own register, and
	   MyWarehouse groups them per customer. A lane on this contract runs
	   between THIS customer's sites, so those are what the picker offers:
	   offering the whole register let a planner pick another customer's gate,
	   which is wrong on its own and, on a contract covering several
	   customers, a quiet disclosure of who else the transporter hauls for.

	   Gudang Sendiri — the company's own sites — are NOT mixed in. They were
	   at first, on the reasoning that an own depot serves everyone, and the
	   result was a customer's list padded with eight sites that are nothing
	   to do with them.

	   The exception is a customer with no warehouses of its own, which is
	   every customer of a company that keeps all its sites under Gudang
	   Sendiri. Returning nothing there would leave such a company unable to
	   name a lane at all, so the own sites stand in. That is a fact about the
	   data, not a branch for one customer: a register organised per customer
	   behaves one way, a flat one the other, and neither asks who it is for.

	   Own sites carry no customerCompanyId: the API omits the field when it
	   is empty, so the test is its absence, not a comparison against ''. */
	function warehousesFor(customerId: string, ...selected: string[]) {
		const own = warehouses.filter((w: any) => !w.customerCompanyId);
		const theirs = customerId ? warehouses.filter((w: any) => w.customerCompanyId === customerId) : [];
		const base = !customerId ? own : theirs.length ? theirs : own;
		// Whatever is already chosen stays in the list even if it falls outside
		// the scope — a contract written before this scoping, or one that
		// names a Gudang Sendiri. The picker names a warehouse by finding its
		// id in the list it was handed, so dropping it would leave a filled
		// field looking empty while still submitting the id behind it.
		const have = new Set(base.map((w: any) => w.id));
		// flatMap rather than map+filter(Boolean): the latter leaves `undefined`
		// in the type, and the picker's prop does not accept it.
		const kept = selected.flatMap((id) => {
			if (!id || have.has(id)) return [];
			const w = warehouses.find((x: any) => x.id === id);
			return w ? [w] : [];
		});
		return kept.length ? [...base, ...kept] : base;
	}

	/* Changing who the contract is for invalidates lanes chosen for someone
	   else: those warehouse ids belong to the previous customer and are no
	   longer offered, so the picker would show a stale label over a value that
	   would still be submitted. The lanes are blanked, keeping their count, so
	   a multi-shipment contract does not collapse to one on a mis-click.

	   Only a user's own pick reaches here — FieldSelect emits on selection,
	   not on assignment — so loading an agreement for editing is unaffected. */
	function onContractCustomerChange() {
		loadingPoints = loadingPoints.map(() => '');
		unloadingPoints = unloadingPoints.map(() => '');
	}
	function onExtraCustomerChange(c: ExtraCustomer) {
		// The picker binds the NAME, because that is what the card shows. The
		// id is what every reader needs — which customers a contract covers,
		// whose warehouses a lane may use — and resolving it from a name later
		// fails the moment a customer is renamed. So it is recorded here, at
		// the one moment both are known.
		c.customerId = customerIdOf(c.customerName);
		c.loadingPoints = c.loadingPoints.map(() => '');
		c.unloadingPoints = c.unloadingPoints.map(() => '');
	}

	/* ---------- Register a warehouse without leaving the contract ----------
	   A lane needs a site that is not in the register yet, and sending the
	   planner to My Warehouse means losing a half-filled contract. The same
	   modal My Warehouse uses opens here, and the site it creates is selected
	   into the lane that asked for it — and belongs to that lane's customer,
	   so it appears in the same scoped list the picker offers. */
	let showWarehouseModal = $state(false);
	let warehouseTargetCustomerId = $state('');
	let warehouseTargetCustomerName = $state('');
	let applyCreatedWarehouse: ((id: string) => void) | null = null;

	function openCreateWarehouse(customerId: string, apply: (id: string) => void) {
		warehouseTargetCustomerId = customerId;
		warehouseTargetCustomerName = customers.find((c: any) => c.id === customerId)?.name ?? '';
		applyCreatedWarehouse = apply;
		showWarehouseModal = true;
	}
	function onWarehouseSaved(w: any) {
		// Into the local register first, or the picker cannot name what the
		// planner just created until the page is reloaded.
		warehouses = [...warehouses, { ...w, customerCompanyId: warehouseTargetCustomerId || undefined }];
		applyCreatedWarehouse?.(w.id);
		applyCreatedWarehouse = null;
	}

	/** Every customer id this contract covers: its own, plus each further
	 *  customer on a multi-customer contract. Deduped, blanks dropped. */
	function coveredCustomerIds(primaryId: string): string[] {
		const ids = [primaryId];
		if (multiCustomerEnabled && isMultiCustomer) {
			for (const c of extraCustomers) {
				ids.push(c.customerId || customerIdOf(c.customerName));
			}
		}
		return [...new Set(ids.filter(Boolean))];
	}

	/** An extra customer is chosen by name, so its id comes from the list. */
	function customerIdOf(name: string) {
		return customers.find((c: any) => c.name === name)?.id ?? '';
	}

	/** Which city a warehouse stands in, '' when it is not known. */
	function warehouseCity(id: string): string {
		return String(warehouses.find((w: any) => w.id === id)?.city ?? '').trim();
	}

	/** True when the two city fields are not on the form at all. */
	/* True when this form's lanes are WAREHOUSES rather than cities.
	   Two ways that happens: the company prices every contract by warehouse
	   (lanes.loadingPoints), or this is a multi-customer contract, where each
	   customer names its own two warehouses whatever the company's usual
	   style. Keeping them apart matters: a company can switch warehouse lanes
	   off for its ordinary contracts and still write multi-customer ones. */
	let lanesAreWarehouses = $derived(lanesByWarehouse || (multiCustomerEnabled && isMultiCustomer));

	/** Every warehouse lane the contract covers: the contract's own, plus
	 *  each further customer's when it covers several. */
	function warehouseLanePairs(): { from: string; to: string }[] {
		const out: { from: string; to: string }[] = [];
		for (let k = 0; k < warehouseLaneCount; k++) {
			out.push({ from: loadingPoints[k] || '', to: unloadingPoints[k] || '' });
		}
		if (multiCustomerEnabled && isMultiCustomer) {
			for (const c of extraCustomers) {
				for (let k = 0; k < c.loadingPoints.length; k++) {
					out.push({ from: c.loadingPoints[k] || '', to: c.unloadingPoints[k] || '' });
				}
			}
		}
		return out;
	}

	/** The distinct cities on one end of those lanes, in the order chosen. */
	function warehouseCitySummary(end: 'from' | 'to'): string {
		const seen: string[] = [];
		for (const lane of warehouseLanePairs()) {
			const city = warehouseCity(lane[end]);
			if (city && !seen.includes(city)) seen.push(city);
		}
		return seen.join(' + ');
	}

	let kotaAsalSummary = $derived(
		lanesAreWarehouses
			? warehouseCitySummary('from')
			: form.initialRoutes.map(routeDisplayValue).filter(Boolean).join(' + ')
	);
	let kotaTujuanSummary = $derived(
		lanesAreWarehouses
			? warehouseCitySummary('to')
			: form.destinationRoutes.map(routeDisplayValue).filter(Boolean).join(' + ')
	);

	let hargaDisplay = $state('');

	/* The contract's own bottom line: what is left of the agreed price once
	   the driver is paid. Negative is not an error and is not hidden — a lane
	   priced below what it costs to drive is exactly what this is for. */
	let marginProfit = $derived((Number(parseThousands(hargaDisplay)) || 0) - allowanceTotal);

	function onHargaInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		hargaDisplay = formatThousands(el.value);
		// Written back to the element as well: when the typed text was all
		// letters the formatted value is the same "" as before, Svelte sees no
		// change, and the letters would stay on screen.
		el.value = hargaDisplay;
	}

	/** Number inputs still take e, E, + and -; a load or a price never does. */
	function numericOnly(e: KeyboardEvent) {
		if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
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
		form.customerId = a.shipperCompanyId || '';
		form.agreementType = a.agreementType || '';
		// Prefer the initialRoutes/destinationRoutes arrays; fall back to the
		// flat kotaAsal/kotaTujuan fields for agreements saved without them.
		if (Array.isArray(a.multiCustomers) && a.multiCustomers.length) {
			extraCustomers = a.multiCustomers.map((c: any) => ({
				customerId: c.customerId ?? '',
				customerName: c.customerName ?? '',
				cargoTypeId: c.cargoTypeId ?? '',
				cargoItemId: c.cargoItemId ?? '',
				loadingPoints: Array.isArray(c.loadingPoints) && c.loadingPoints.length ? [...c.loadingPoints] : [''],
				unloadingPoints:
					Array.isArray(c.unloadingPoints) && c.unloadingPoints.length ? [...c.unloadingPoints] : ['']
			}));
		}
		if (typeof a.billingSplit === 'string') billingSplit = a.billingSplit;
		const savedAllowance = a.allowance as { upfrontPercent?: number } | undefined;
		if (savedAllowance?.upfrontPercent != null) {
			allowanceUpfrontPercent = Number(savedAllowance.upfrontPercent);
		}
		if (Array.isArray(a.loadingPoints) && a.loadingPoints.length) {
			loadingPoints = [...a.loadingPoints];
			unloadingPoints = Array.isArray(a.unloadingPoints) ? [...a.unloadingPoints] : [];
			// The two are a pair, and a contract saved with an uneven number
			// would otherwise lose its last lane's other end.
			while (unloadingPoints.length < loadingPoints.length) unloadingPoints.push('');
		}
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

	/* ---------- What this company has agreed to configure ----------
	   The same answer the create endpoint validates against, so a form built
	   from it cannot produce a submission the server then refuses. A company
	   that has configured nothing sees exactly the form it saw before: every
	   field below is hidden by default. */

	onMount(async () => {
		void fieldConfigActions.load('agreement').then(async (f) => {
			agreementFields = f;
			// Fetched when the company prices lanes by warehouse, and when it
			// writes contracts covering several customers — those name their
			// lanes by warehouse in each customer's own card whatever the
			// company's usual lane style. For everyone else this list is
			// never needed.
			if (isEnabled(f, 'lanes.loadingPoints') || isEnabled(f, 'multiCustomers')) {
				try {
					warehouses = (await api.get(ENDPOINTS.warehouses.list)).data?.data ?? [];
				} catch {
					/* the pickers stay empty and say so */
				}
			}
		});
		const loads: Promise<unknown>[] = [
			api
				.get(ENDPOINTS.shippers.list)
				.then((r) => {
					customers = Array.isArray(r.data?.data) ? r.data.data : [];
					// Opened from a customer's row on MyAgreement: start with them.
					const pre = new URLSearchParams(window.location.search).get('customer');
					if (pre && !editing && !form.customerId) {
						const c = customers.find((x) => x.id === pre);
						if (c) {
							form.customerId = c.id;
							form.customerNama = c.name;
						}
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

	let selectedCustomer = $derived(customers.find((c) => c.id === form.customerId) || null);

	function validate() {
		if (!form.customerId) return 'Customer Name wajib dipilih';
		if (!form.agreementType) return 'Type Agreement wajib dipilih';
		if (multiCustomerEnabled && isMultiCustomer) {
			if (!extraCustomers.length) {
				return 'Multi Customer perlu minimal satu customer tambahan — atau ganti Type Agreement';
			}
			for (const [i, c] of extraCustomers.entries()) {
				const at = ` pada Customer ${i + 2}`;
				if (!c.customerName) return `Customer Name${at} wajib dipilih`;
				for (let k = 0; k < c.loadingPoints.length; k++) {
					const lane = c.loadingPoints.length > 1 ? ` Shipment ${k + 1}` : '';
					if (!c.loadingPoints[k]) return `Loading Point${lane}${at} wajib dipilih`;
					if (!c.unloadingPoints[k]) return `Unloading Point${lane}${at} wajib dipilih`;
				}
			}
			if (!billingSplit) return 'Pembagian Tagihan wajib dipilih';
		}
		if (lanesAreWarehouses) {
			// The city lanes are not on the form here, so holding the contract
			// to them would refuse it for a field nobody can see. On a
			// multi-customer contract that is true whatever the company's lane
			// style: Customer 1 names warehouses in its own card.
			for (let k = 0; k < warehouseLaneCount; k++) {
				const at = warehouseLaneCount > 1 ? ` pada Shipment ${k + 1}` : '';
				if (!loadingPoints[k]) return `Loading Point${at} wajib dipilih`;
				if (!unloadingPoints[k]) return `Unloading Point${at} wajib dipilih`;
			}
		} else if (form.initialRoutes.some((r) => !r.kota) || form.destinationRoutes.some((r) => !r.kota)) {
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
				customerNama: selectedCustomer?.name || form.customerNama,
				agreementType: form.agreementType,
				// Sent only by a company that prices lanes by warehouse. Absent
				// otherwise, so nothing changes for a contract priced city to
				// city — and the server stores what it is given.
				// The warehouses this contract names. Sent whenever the lanes ARE
				// warehouses — a company that prices by warehouse, or any
				// multi-customer contract, where Customer 1's own lanes live in
				// these two fields. Reading the company flag alone dropped them
				// from every multi-customer contract written by a company that
				// prices its ordinary ones city to city.
				...(lanesAreWarehouses
					? {
							loadingPoints: loadingPoints.filter(Boolean),
							unloadingPoints: unloadingPoints.filter(Boolean)
						}
					: {}),
				// The allowance the contract agrees, stored as the three figures
				// rather than the percentage alone: amending the percentage
				// later must not silently restate what was already paid.
				...(allowanceEnabled && allowanceTotal > 0
					? {
							allowance: {
								total: allowanceTotal,
								upfrontPercent: Number(allowanceUpfrontPercent) || 0,
								upfront: allowanceUpfront,
								final: allowanceFinal,
								// The arithmetic travels with the figure. Without it the
								// agreement document can only state a total, and a total
								// nobody can check is a total nobody can dispute.
								components: [
									...allowanceComponents.map((c) => ({
										key: c.key,
										label: c.label,
										basis: c.edited ? 'Diubah manual' : c.basis,
										amount: c.amount,
										edited: c.edited
									})),
									...allowanceExtras
										.filter((e) => e.label.trim() && Number(e.amount) > 0)
										.map((e) => ({
											key: 'extra',
											label: e.label.trim(),
											basis: 'Komponen biaya tambahan',
											amount: Number(e.amount) || 0,
											edited: true
										}))
								]
							}
						}
					: {}),
				// The other customers this contract covers, and how one agreed
				// price is divided between them. Absent unless the contract
				// says it covers several.
				...(multiCustomerEnabled && isMultiCustomer
					? {
							multiCustomers: extraCustomers.map((c) => ({
								customerId: c.customerId,
								customerName: c.customerName,
								cargoTypeId: c.cargoTypeId,
								cargoItemId: c.cargoItemId,
								loadingPoints: c.loadingPoints.filter(Boolean),
								unloadingPoints: c.unloadingPoints.filter(Boolean)
							})),
							billingSplit
						}
					: {}),
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
			// One rate per lane, not one rate holding every lane.
			//
			// This used to send the joined summary ("KOTA A + KOTA B") as the
			// city, which overflowed the column and answered 500, and — worse
			// when it fitted — meant an order could never match the agreement
			// by lane, because no lane is called "A + B". A multi-shipment
			// agreement covers each origin against each destination at the
			// one price it names.
			const rates = [];
			if (lanesAreWarehouses) {
				// The two cities were never asked for, so each lane's pair is
				// the pair of warehouses chosen for it — lane k's origin with
				// lane k's destination, not every origin against every
				// destination, because these lanes are named, not combined.
				// A lane repeated across customers prices once.
				const seen = new Set<string>();
				for (const lane of warehouseLanePairs()) {
					const originCityId = warehouseCity(lane.from);
					const destinationCityId = warehouseCity(lane.to);
					if (!originCityId || !destinationCityId) continue;
					const key = `${originCityId}\u0000${destinationCityId}`;
					if (seen.has(key)) continue;
					seen.add(key);
					rates.push({
						customerCompanyId,
						originCityId,
						destinationCityId,
						originDistrictId: '',
						destinationDistrictId: '',
						pricingTypeId: payload.pricingType,
						truckTypeId: '',
						price: String(payload.tarif)
					});
				}
			} else {
				for (const o of form.initialRoutes) {
					for (const d of form.destinationRoutes) {
						if (!o.kota || !d.kota) continue;
						rates.push({
							customerCompanyId,
							originCityId: o.kota,
							destinationCityId: d.kota,
							originDistrictId: o.level === 'kecamatan' ? o.kecamatan || '' : '',
							destinationDistrictId: d.level === 'kecamatan' ? d.kecamatan || '' : '',
							pricingTypeId: payload.pricingType,
							truckTypeId: '',
							price: String(payload.tarif)
						});
					}
				}
			}
			if (rates.length === 0) {
				toast(
					lanesAreWarehouses
						? 'Warehouse yang dipilih belum punya data kota — lengkapi dulu di Master Data > Warehouse'
						: 'Pilih minimal satu rute asal dan satu rute tujuan'
				);
				return;
			}
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
					// Every customer this contract covers, not only the first.
					// The agreement is one bargain over several clients, and a
					// client it covers but does not name cannot find it.
					customers: coveredCustomerIds(customerCompanyId).map((companyId) => ({ companyId })),
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
	<!-- Highest in the hierarchy, and asked first: the type decides what the
	     rest of the form even is — one customer with one lane, one customer
	     with several, or several customers each with their own. Asking it
	     inside the first card made it look like one field among many. -->
	<div class="agreement-type-pick">
		<FieldSelect
			bind:value={form.agreementType}
			options={typeOptions}
			placeholder="Pilih tipe agreement"
			onchange={onAgreementTypeChange}
		/>
	</div>
</div>

<!-- Nothing below means anything until the type is chosen, so until it is
     the form says so rather than offering fields whose shape may change. -->
{#if !form.agreementType}
	<div class="card card-pad">
		<p class="hint" style="margin:0;">Pilih Type Agreement di atas untuk mulai mengisi.</p>
	</div>
{/if}

<!-- A contract covering several customers has nothing to say at this level:
     the customer, its cargo and its lanes are all answered inside that
     customer's own card below, so this card would either repeat them or
     stand empty. It is the contract's own card, not the form's frame. -->
{#if !(multiCustomerEnabled && isMultiCustomer)}
	<div class="card card-pad" class:form-locked={!form.agreementType}>
		<div class="field">
			<label>Customer Name <span class="req">*</span></label>
			<FieldSelect
				bind:value={form.customerId}
				options={customerOptions}
				placeholder="Pilih customer"
				onchange={onContractCustomerChange}
			/>
		</div>
		{#if lanesByWarehouse}
			<!-- This contract names the two warehouses, not the two cities. Same
		     pairing as the city lanes below: index k of each list is one
		     shipment's lane, added and removed together. -->
			{#each { length: warehouseLaneCount } as _l, k (k)}
				<!-- Only a multi-shipment contract numbers its lanes. The test
				     used to be the COMPANY's multi-customer flag, which is not
				     an agreement type: a company allowed to write
				     multi-customer contracts had "Shipment 1" and a + Tambah
				     Shipment button on its SINGLE shipment agreements, which
				     is the multi-shipment form under another name. A
				     multi-customer contract never reaches here — its lanes
				     live in each customer's own card. -->
				{#if isMultiShipment}
					<div class="route-shipment-head">
						<span class="route-shipment-title">Shipment {k + 1}</span>
						{#if warehouseLaneCount > 1}
							<button type="button" class="route-shipment-remove" onclick={() => removeWarehouseLane(k)}
								>Hapus</button
							>
						{/if}
					</div>
				{/if}
				<div class="two-col">
					<div class="field">
						<label>Loading Point <span class="req">*</span></label>
						<div class="warehouse-pick-row">
							<WarehouseSearchField
								bind:value={loadingPoints[k]}
								warehouses={warehousesFor(form.customerId, loadingPoints[k])}
								placeholder="Cari alamat atau nama warehouse..."
							/>
							<button
								type="button"
								class="mini-icon-btn"
								title="Tambah warehouse baru"
								aria-label="Tambah warehouse untuk Loading Point"
								onclick={() => openCreateWarehouse(form.customerId, (id) => (loadingPoints[k] = id))}
								><span class="icon-wrap"><Pencil size={16} /></span></button
							>
						</div>
					</div>
					<div class="field">
						<label>Unloading Point <span class="req">*</span></label>
						<div class="warehouse-pick-row">
							<WarehouseSearchField
								bind:value={unloadingPoints[k]}
								warehouses={warehousesFor(form.customerId, unloadingPoints[k])}
								placeholder="Cari alamat atau nama warehouse..."
							/>
							<button
								type="button"
								class="mini-icon-btn"
								title="Tambah warehouse baru"
								aria-label="Tambah warehouse untuk Unloading Point"
								onclick={() => openCreateWarehouse(form.customerId, (id) => (unloadingPoints[k] = id))}
								><span class="icon-wrap"><Pencil size={16} /></span></button
							>
						</div>
					</div>
				</div>
			{/each}
			{#if isMultiShipment}
				<button
					type="button"
					class="btn btn-outline btn-sm"
					style="margin-top:14px;"
					onclick={addWarehouseLane}>+ Tambah Shipment</button
				>
			{/if}
		{:else}
			<!-- A shipment is a lane: initial route k with destination route k is
	     Shipment k+1, the same pairing an order made from this agreement
	     uses for its points. Kept at city or kecamatan level — the agreement
	     names the lane, the order names the warehouses on it. -->
			{#each { length: routeShipmentCount } as _s, k (k)}
				{#if isMultiShipment}
					<div class="route-shipment-head">
						<span class="route-shipment-title">Shipment {k + 1}</span>
						{#if routeShipmentCount > 1}
							<button type="button" class="route-shipment-remove" onclick={() => removeShipmentRoute(k)}
								>Hapus</button
							>
						{/if}
					</div>
				{/if}
				<div class="two-col">
					{#each [{ side: 'initial', label: 'Initial Route', place: 'asal' }, { side: 'destination', label: 'Destination Route', place: 'tujuan' }] as col (col.side)}
						{@const r = (col.side === 'initial' ? form.initialRoutes : form.destinationRoutes)[k]}
						<div class="field">
							<label>{col.label} <span class="req">*</span></label>
							{#if r}
								<div class="route-entry">
									<div class="route-field-row">
										<div class="route-field-select">
											<FieldSelect
												value={r.kota}
												onchange={(v) => onRouteKotaChange(r, v)}
												options={INDONESIAN_CITY_OPTIONS}
												placeholder={`Cari kota/kabupaten ${col.place}...`}
												searchable
											/>
										</div>
										<button type="button" class="btn btn-outline btn-sm" onclick={() => toggleRouteLevel(r)}>
											{r.level === 'kecamatan' ? '− Kecamatan' : '+ Kecamatan'}
										</button>
									</div>
									{#if r.level === 'kecamatan'}
										{#if kecamatanOptionsFor(r.kota).length}
											<FieldSelect
												bind:value={r.kecamatan}
												options={kecamatanOptionsFor(r.kota)}
												placeholder={`Cari kecamatan ${col.place}...`}
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
							{/if}
						</div>
					{/each}
				</div>
			{/each}
			<!-- Only a multi-shipment agreement covers more than one lane. -->
			{#if isMultiShipment}
				<button
					type="button"
					class="btn btn-outline btn-sm"
					style="margin-top:14px;"
					onclick={addShipmentRoute}>+ Tambah Shipment</button
				>
			{/if}
		{/if}
	</div>
{/if}

<!-- Each customer names its own cargo.
     On a contract covering several, "what is being carried" is a different
     answer per customer — one ships bottled water, another spare parts — so
     the cargo belongs inside the customer's own card rather than once at the
     top of the contract. The contract's own customer is Customer 1 and reads
     the agreement's fields; the others carry theirs on their own record. -->
{#if multiCustomerEnabled && isMultiCustomer}
	<div class="card card-pad" style="margin-top:16px;">
		<div class="route-shipment-head">
			<span class="route-shipment-title">Customer 1</span>
		</div>
		<div class="three-col">
			<div class="field">
				<label>Customer Name <span class="req">*</span></label>
				<FieldSelect
					bind:value={form.customerId}
					options={customerOptions}
					placeholder="Pilih customer"
					searchable
					onchange={onContractCustomerChange}
				/>
			</div>
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
			</div>
		</div>

		<!-- This customer's own lanes, in this customer's own card. A
		     shipment belongs to the customer whose goods it carries; listing
		     them apart from the customer is what made it look as though they
		     were shared. -->
		{#each { length: warehouseLaneCount } as _l, k (k)}
			<div class="route-shipment-head">
				<span class="route-shipment-title">Shipment {k + 1}</span>
				{#if warehouseLaneCount > 1}
					<button type="button" class="route-shipment-remove" onclick={() => removeWarehouseLane(k)}
						>Hapus</button
					>
				{/if}
			</div>
			<div class="two-col">
				<div class="field">
					<label>Loading Point <span class="req">*</span></label>
					<div class="warehouse-pick-row">
						<WarehouseSearchField
							bind:value={loadingPoints[k]}
							warehouses={warehousesFor(form.customerId, loadingPoints[k])}
							placeholder="Cari alamat atau nama warehouse..."
						/>
						<button
							type="button"
							class="mini-icon-btn"
							title="Tambah warehouse baru"
							aria-label="Tambah warehouse untuk Loading Point"
							onclick={() => openCreateWarehouse(form.customerId, (id) => (loadingPoints[k] = id))}
							><span class="icon-wrap"><Pencil size={16} /></span></button
						>
					</div>
				</div>
				<div class="field">
					<label>Unloading Point <span class="req">*</span></label>
					<div class="warehouse-pick-row">
						<WarehouseSearchField
							bind:value={unloadingPoints[k]}
							warehouses={warehousesFor(form.customerId, unloadingPoints[k])}
							placeholder="Cari alamat atau nama warehouse..."
						/>
						<button
							type="button"
							class="mini-icon-btn"
							title="Tambah warehouse baru"
							aria-label="Tambah warehouse untuk Unloading Point"
							onclick={() => openCreateWarehouse(form.customerId, (id) => (unloadingPoints[k] = id))}
							><span class="icon-wrap"><Pencil size={16} /></span></button
						>
					</div>
				</div>
			</div>
		{/each}
		<button type="button" class="btn btn-outline btn-sm" onclick={addWarehouseLane}>+ Tambah Shipment</button>
	</div>
{/if}

{#if multiCustomerEnabled && isMultiCustomer}
	{#each extraCustomers as c, i (i)}
		<div class="card card-pad" style="margin-top:16px;">
			<div class="route-shipment-head">
				<span class="route-shipment-title">Customer {i + 2}</span>
				<button type="button" class="route-shipment-remove" onclick={() => removeExtraCustomer(i)}
					>Hapus</button
				>
			</div>
			<div class="three-col">
				<div class="field">
					<label>Customer Name <span class="req">*</span></label>
					<FieldSelect
						bind:value={c.customerName}
						options={customers.map((cu: any) => ({ value: cu.name, label: cu.name }))}
						placeholder="Pilih customer"
						searchable
						onchange={() => onExtraCustomerChange(c)}
					/>
				</div>
				<div class="field">
					<label>Cargo Type</label>
					<FieldSelect
						bind:value={c.cargoTypeId}
						options={cargoSpecificOptions}
						placeholder="Pilih Cargo Type"
					/>
				</div>
				<div class="field">
					<label>Cargo Item</label>
					<FieldSelect
						bind:value={c.cargoItemId}
						options={cargoItemOptionsFor(c.cargoTypeId)}
						placeholder="Pilih Cargo Item"
					/>
				</div>
			</div>

			{#each { length: Math.max(c.loadingPoints.length, 1) } as _l, k (k)}
				<div class="route-shipment-head">
					<span class="route-shipment-title">Shipment {k + 1}</span>
					{#if c.loadingPoints.length > 1}
						<button type="button" class="route-shipment-remove" onclick={() => removeExtraLane(c, k)}
							>Hapus</button
						>
					{/if}
				</div>
				<div class="two-col">
					<div class="field">
						<label>Loading Point <span class="req">*</span></label>
						<div class="warehouse-pick-row">
							<WarehouseSearchField
								bind:value={c.loadingPoints[k]}
								warehouses={warehousesFor(c.customerId || customerIdOf(c.customerName), c.loadingPoints[k])}
								placeholder="Cari alamat atau nama warehouse..."
							/>
							<button
								type="button"
								class="mini-icon-btn"
								title="Tambah warehouse baru"
								aria-label="Tambah warehouse untuk Loading Point"
								onclick={() =>
									openCreateWarehouse(
										c.customerId || customerIdOf(c.customerName),
										(id) => (c.loadingPoints[k] = id)
									)}><span class="icon-wrap"><Pencil size={16} /></span></button
							>
						</div>
					</div>
					<div class="field">
						<label>Unloading Point <span class="req">*</span></label>
						<div class="warehouse-pick-row">
							<WarehouseSearchField
								bind:value={c.unloadingPoints[k]}
								warehouses={warehousesFor(c.customerId || customerIdOf(c.customerName), c.unloadingPoints[k])}
								placeholder="Cari alamat atau nama warehouse..."
							/>
							<button
								type="button"
								class="mini-icon-btn"
								title="Tambah warehouse baru"
								aria-label="Tambah warehouse untuk Unloading Point"
								onclick={() =>
									openCreateWarehouse(
										c.customerId || customerIdOf(c.customerName),
										(id) => (c.unloadingPoints[k] = id)
									)}><span class="icon-wrap"><Pencil size={16} /></span></button
							>
						</div>
					</div>
				</div>
			{/each}
			<button type="button" class="btn btn-outline btn-sm" onclick={() => addExtraLane(c)}
				>+ Tambah Shipment</button
			>
		</div>
	{/each}
	<button type="button" class="btn btn-outline btn-sm" style="margin-top:16px;" onclick={addExtraCustomer}
		>+ Tambah Customer</button
	>
	<div class="card card-pad" style="margin-top:16px;">
		<div class="field" style="margin-bottom:0;">
			<label>Pembagian Tagihan <span class="req">*</span></label>
			<FieldSelect bind:value={billingSplit} options={BILLING_SPLIT_OPTIONS} placeholder="Pilih pembagian" />
			<span class="hint" style="display:block; margin-top:6px;"
				>Bagaimana satu harga agreement dibagi ke invoice tiap customer. Disimpan pada agreement; pemecahan
				invoice-nya belum dijalankan.</span
			>
		</div>
	</div>
{/if}

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
	<!-- On a contract covering several customers this pair lives in Customer
	     1's own card, where the other customers' cargo is: two inputs for one
	     answer would be two places to change it and one to forget. -->
	{#if !(multiCustomerEnabled && isMultiCustomer)}
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
	{/if}

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
			Jenis truck pilihan untuk agreement ini — tampil sebagai acuan planner saat menugaskan truck ke order
			dari agreement ini.
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
				step="0.01"
				onkeydown={numericOnly}
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
				step="0.01"
				onkeydown={numericOnly}
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

<!-- Last, because it is the only part of the contract that is computed
     rather than typed: it needs the warehouses chosen above before there is a
     distance to compute from, and putting it higher would show an empty card
     for most of the time somebody spends on this page.

     The allowance this contract agrees, instead of each order working one
     out. Computed by the same function an order uses, from the real road
     distance between the two warehouses named above, so the figure agreed
     here and the figure it replaces cannot drift apart. -->
{#if allowanceEnabled && lanesAreWarehouses}
	<div class="card card-pad" style="margin-top:16px;">
		<div class="route-shipment-head">
			<span class="route-shipment-title">Uang Sangu Driver</span>
			{#if laneKm}<span class="hint">{laneKm} km · ETA {laneHours} jam</span>{/if}
		</div>
		{#if !laneKm}
			<p class="hint" style="margin:0;">
				Pilih Loading Point dan Unloading Point terlebih dahulu — jarak dihitung dari rute jalan antara
				keduanya.
			</p>
		{:else}
			<!-- The arithmetic, not just the answer. Each row says how it was
			     worked out, and can be corrected where the configured rate does
			     not fit this lane; correcting one leaves the others computed. -->
			<div class="allowance-breakdown">
				{#each allowanceComponents as c (c.key)}
					<div class="allowance-row">
						<div class="allowance-row-main">
							<span class="allowance-row-label">{c.label}</span>
							<span class="allowance-row-basis">
								{c.edited ? 'Diubah manual — nilai kontrak' : c.basis}
							</span>
						</div>
						{#if editingAllowanceKey === c.key}
							<input
								class="allowance-row-input"
								type="number"
								min="0"
								bind:value={allowanceOverrides[c.key]}
							/>
							<button type="button" class="btn btn-text btn-sm" onclick={() => (editingAllowanceKey = '')}
								>Selesai</button
							>
							<button type="button" class="btn btn-text btn-sm" onclick={() => resetAllowanceComponent(c.key)}
								>Hitung ulang</button
							>
						{:else}
							<span class="allowance-row-amount">{formatIDR(c.amount)}</span>
							<button
								type="button"
								class="allowance-row-edit"
								title="Ubah nilai"
								aria-label={`Ubah ${c.label}`}
								onclick={() => editAllowanceComponent(c.key, c.computed)}><Pencil size={13} /></button
							>
						{/if}
					</div>
				{/each}

				{#each allowanceExtras as e, i (i)}
					<div class="allowance-row">
						<input
							class="allowance-extra-label"
							type="text"
							placeholder="Nama komponen biaya"
							bind:value={e.label}
						/>
						<input class="allowance-row-input" type="number" min="0" placeholder="0" bind:value={e.amount} />
						<button
							type="button"
							class="allowance-row-edit"
							aria-label="Hapus komponen"
							onclick={() => removeAllowanceExtra(i)}><X size={13} /></button
						>
					</div>
				{/each}

				<button type="button" class="btn btn-text btn-sm allowance-add" onclick={addAllowanceExtra}
					>+ Tambah Komponen Biaya</button
				>

				<div class="allowance-row allowance-subtotal">
					<span class="allowance-row-label">Subtotal Uang Sangu</span>
					<span class="allowance-row-amount">{formatIDR(allowanceTotal)}</span>
				</div>
			</div>

			<div class="two-col" style="margin-top:16px;">
				<div class="field">
					<label>Total Uang Sangu</label>
					<input type="text" readonly value={formatIDR(allowanceTotal)} />
				</div>
				<div class="field">
					<label>Uang Sangu Driver Awal (%)</label>
					<input type="number" min="0" max="100" bind:value={allowanceUpfrontPercent} />
				</div>
			</div>
			<div class="two-col" style="margin-bottom:0;">
				<div class="field" style="margin-bottom:0;">
					<label>Uang Sangu Awal</label>
					<input type="text" readonly value={formatIDR(allowanceUpfront)} />
				</div>
				<div class="field" style="margin-bottom:0;">
					<label>Uang Sangu Akhir</label>
					<input type="text" readonly value={formatIDR(allowanceFinal)} />
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- What the contract leaves once the driver is paid. Shown next to the
     allowance because that is the figure it is subtracted from, and shown
     even when negative: a lane priced below what it costs to drive is the
     thing this number exists to reveal. -->
{#if allowanceEnabled && lanesAreWarehouses && laneKm}
	<div class="card card-pad margin-profit-card" style="margin-top:16px;">
		<span class="margin-profit-label">Margin Profit</span>
		<span class="margin-profit-value" class:negative={marginProfit < 0}>{formatIDR(marginProfit)}</span>
		<span class="hint">Harga perjanjian − Uang Sangu Driver</span>
	</div>
{/if}

<WarehouseFormModal
	bind:show={showWarehouseModal}
	customerCompanyId={warehouseTargetCustomerId}
	customerName={warehouseTargetCustomerName}
	onSaved={onWarehouseSaved}
/>

<div style="display:flex; justify-content:flex-end; gap:12px; margin-top:8px;">
	<button class="btn btn-outline" onclick={cancel}>Batal</button>
	<button class="btn btn-primary" disabled={saving} onclick={submit}>
		{saving ? 'Menyimpan...' : editing ? 'Simpan Renewal' : 'Simpan Agreement'}
	</button>
</div>
