<script lang="ts">
	/**
	 * Planner — Allocate. Port of Karlo-TMS-Revamp/src/views/PlannerAllocateView.vue
	 * on the console's real data.
	 *
	 * One screen: the fleet on a map (plate under every truck), the open
	 * orders / fleet catalog / transporter catalog in tabs beneath it, and a
	 * detail panel on the left that opens for the order or truck picked.
	 * Picking an order draws its haul; picking a truck on top of that draws
	 * the approach to the loading point and enables Assign. The LTL switch
	 * lets several orders be picked and put on one truck in one go.
	 *
	 * Data: orders (business), vehicles + drivers + warehouses (master data),
	 * /fleet/live + FMS's live view (positions), /orders/:id/routes and
	 * /routing/route (MAPID through the business service, cached 90 days),
	 * PUT /orders/:id/assign (the pairing itself). Toll fares and drag-to-reorder
	 * custom routes from the prototype are not here: the routing service
	 * reports toll segments but not fares, and via-points are a re-plan the
	 * `routing.advanced` entitlement gates.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		ChevronDown,
		Clock,
		Copy,
		MapPin,
		Phone,
		Search,
		Truck as TruckIcon,
		User,
		X
	} from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS, ORDER_STATUS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { TRUCK_MARKER } from '$lib/constants/assets';
	import { fetchLiveFleet, hasFix, plateKey, type LiveVehicle } from '$lib/fms/live';
	import { MapView, type MapLine, type MapMarker } from '$lib/components/ui';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';
	import Pagination from '$lib/components/revamp/Pagination.svelte';
	import { formatThousands } from '$lib/revamp/currency.js';
	import { haversineKm } from '$lib/revamp/geo.js';
	import { copyText } from '$lib/revamp/clipboard.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { shipmentTypeLabel } from '$lib/revamp/shipmentType.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { MAX_TRUCK_OPTIONS, describeTruckOption, truckOptionKeysOf } from '$lib/revamp/truckOptions.js';

	let { basePath, title: _title = 'Planner' }: { basePath: string; title?: string } = $props();

	// ---------------------------------------------------------------------
	// Types
	// ---------------------------------------------------------------------
	type Vehicle = {
		id: string;
		licensePlate: string;
		status?: string;
		isAvailable?: boolean;
		currentDriverId?: string | null;
		driver?: { id: string; fullName: string } | null;
		truckHead?: { name: string } | null;
		truckBody?: { name: string } | null;
		attributes?: Record<string, any>;
	};
	type Warehouse = {
		id: string;
		name?: string;
		city?: string;
		address?: string;
		picName?: string;
		picPhone?: string;
		latitude?: number | null;
		longitude?: number | null;
		location?: { coordinates?: [number, number] } | null;
	};
	type Position = {
		truckId: string;
		policeNumber: string;
		lat: number;
		lon: number;
		at: string;
		source: 'live' | 'lastDrop';
		city?: string;
	};
	type Stop = {
		type: 'muat' | 'bongkar';
		kota: string;
		label: string;
		alamat: string;
		pic?: string;
		telepon?: string;
		coords: [number, number] | null;
		shipmentLabel?: string;
	};
	type RouteSummary = { distanceKm: number | null; durationMin: number | null; geometry: [number, number][] };

	const TRUCK_STATUS_LIST = [
		{ key: 'available', label: 'Available', color: '#146C2E', icon: 'active' },
		{ key: 'planned', label: 'Planned', color: '#EAB308', icon: 'waitingDepartureOrder' },
		{ key: 'onduty', label: 'On Duty', color: '#0B57D0', icon: 'onDuty' },
		{ key: 'unavailable', label: 'Unavailable', color: '#B3261E', icon: 'inactive' },
		{ key: 'unpaired', label: 'Unpaired', color: '#5B5F67', icon: 'unpaired' }
	] as const;
	type TruckStatus = (typeof TRUCK_STATUS_LIST)[number]['key'];
	const TRUCK_STATUS_META = Object.fromEntries(TRUCK_STATUS_LIST.map((s) => [s.key, s])) as Record<
		TruckStatus,
		(typeof TRUCK_STATUS_LIST)[number]
	>;
	const AVERAGE_TRUCK_SPEED_KMH = 40;
	const ORDERS_PAGE_SIZE = 10;
	const FLEET_PAGE_SIZE = 10;
	const VENDOR_PAGE_SIZE = 10;
	const DEFAULT_PICKUP_RADIUS_KM = 50;

	// ---------------------------------------------------------------------
	// Data
	// ---------------------------------------------------------------------
	let orders = $state<any[]>([]);
	let busyOrders = $state<any[]>([]); // assigned / in transit — what makes a truck Planned or On Duty
	let vehicles = $state<Vehicle[]>([]);
	let warehouses = $state<Warehouse[]>([]);
	let positions = $state<Position[]>([]);
	let fmsFleet = $state<LiveVehicle[]>([]);
	let vendors = $state<any[]>([]);
	let activity = $state<{ driverId: string; truckId: string; trips: number; lastActiveAt?: string }[]>([]);
	let loading = $state(true);

	async function loadPositions() {
		const [fms, ours] = await Promise.allSettled([fetchLiveFleet(), api.get(ENDPOINTS.fleet.live)]);
		if (fms.status === 'fulfilled') fmsFleet = fms.value;
		if (ours.status === 'fulfilled') {
			const d = ours.value.data;
			positions = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
		}
	}
	async function loadOrders() {
		const [open, busy] = await Promise.allSettled([
			api.get(ENDPOINTS.orders.list, {
				page: 0,
				pageSize: 200,
				filtered: JSON.stringify([
					{ id: 'statusCode', value: [ORDER_STATUS.APPROVED, ORDER_STATUS.READY_TO_PLAN], type: 'in' }
				])
			}),
			api.get(ENDPOINTS.orders.list, {
				page: 0,
				pageSize: 200,
				filtered: JSON.stringify([
					{ id: 'statusCode', value: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.IN_TRANSIT], type: 'in' }
				])
			})
		]);
		if (open.status === 'fulfilled') orders = open.value.data?.data ?? [];
		if (busy.status === 'fulfilled') busyOrders = busy.value.data?.data ?? [];
	}
	async function loadAll() {
		loading = true;
		const [v, w, t, a] = await Promise.allSettled([
			api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
			api.get(ENDPOINTS.warehouses.list, { pageSize: 500 }),
			api.get('/transporters'),
			api.get(ENDPOINTS.fleet.driverActivity)
		]);
		if (v.status === 'fulfilled') vehicles = v.value.data?.data ?? [];
		if (w.status === 'fulfilled') warehouses = w.value.data?.data ?? [];
		if (t.status === 'fulfilled') vendors = t.value.data?.data ?? [];
		if (a.status === 'fulfilled') activity = a.value.data?.data ?? [];
		await Promise.all([loadOrders(), loadPositions()]);
		loading = false;
	}
	// Top bar clock — one shared 1 s tick.
	let nowMs = $state(Date.now());
	const pad2 = (n: number) => String(n).padStart(2, '0');
	const topbarClockLabel = $derived.by(() => {
		const d = new Date(nowMs);
		return `${pad2(d.getHours())}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}`;
	});
	// Top bar search — narrows the same trucks the status pills do (Fleet
	// Catalog rows and map markers both read filteredTrucks), by plate or driver.
	let truckSearchQuery = $state('');

	onMount(() => {
		void loadAll();
		const timer = setInterval(loadPositions, 60_000);
		const clock = setInterval(() => (nowMs = Date.now()), 1000);
		return () => {
			clearInterval(timer);
			clearInterval(clock);
		};
	});

	// ---------------------------------------------------------------------
	// Lookups
	// ---------------------------------------------------------------------
	const warehouseById = $derived(new Map(warehouses.map((w) => [w.id, w])));
	/** Master data serves latitude/longitude; the older GeoJSON shape is kept for safety. */
	function warehouseCoords(w: Warehouse | undefined | null): [number, number] | null {
		if (!w) return null;
		if (typeof w.longitude === 'number' && typeof w.latitude === 'number') return [w.longitude, w.latitude];
		const c = w.location?.coordinates;
		return c && c.length === 2 ? [c[0], c[1]] : null;
	}
	/** Best known position per vehicle id: FMS live fix first, then /fleet/live. */
	const positionOf = $derived.by(() => {
		const byPlate = new Map<string, { lat: number; lon: number; at?: string; city?: string; live: boolean }>();
		for (const p of positions) {
			byPlate.set(plateKey(p.policeNumber), { lat: p.lat, lon: p.lon, at: p.at, city: p.city, live: p.source === 'live' });
		}
		for (const v of fmsFleet) {
			if (!hasFix(v.position)) continue;
			const addr = [v.position.kecamatan, v.position.kota || v.position.kabupaten].filter(Boolean).join(', ');
			byPlate.set(plateKey(v.license_plate), {
				lat: v.position.lat,
				lon: v.position.lon,
				at: v.position.time ?? undefined,
				city: addr || undefined,
				live: true
			});
		}
		const m = new Map<string, { lat: number; lon: number; at?: string; city?: string; live: boolean }>();
		for (const t of vehicles) {
			const p = byPlate.get(plateKey(t.licensePlate));
			if (p) m.set(t.id, p);
		}
		return m;
	});
	const lastActiveOfTruck = $derived.by(() => {
		const m = new Map<string, string>();
		for (const a of activity) {
			const prev = m.get(a.truckId);
			if (a.lastActiveAt && (!prev || a.lastActiveAt > prev)) m.set(a.truckId, a.lastActiveAt);
		}
		return m;
	});
	const truckStatusSets = $derived.by(() => {
		const planned = new Set<string>();
		const onduty = new Set<string>();
		for (const o of busyOrders) {
			if (!o.truckId) continue;
			if (o.statusCode === ORDER_STATUS.IN_TRANSIT) onduty.add(o.truckId);
			else planned.add(o.truckId);
		}
		return { planned, onduty };
	});
	function truckStatusOf(t: Vehicle): TruckStatus {
		if ((t.status ?? 'active') === 'inactive') return 'unavailable';
		if (!t.currentDriverId) return 'unpaired';
		if (truckStatusSets.onduty.has(t.id)) return 'onduty';
		if (truckStatusSets.planned.has(t.id)) return 'planned';
		return 'available';
	}
	const truckStatusCounts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const s of TRUCK_STATUS_LIST) c[s.key] = 0;
		for (const t of vehicles) c[truckStatusOf(t)]++;
		return c;
	});
	function typeLabel(t: Vehicle) {
		return t.truckHead?.name ?? t.truckBody?.name ?? t.attributes?.truckTypeName ?? '-';
	}
	function truckLocation(t: Vehicle) {
		return positionOf.get(t.id)?.city || t.attributes?.location || t.attributes?.pool || '-';
	}
	function formatLastGpsUpdate(t: Vehicle) {
		const p = positionOf.get(t.id);
		if (!p?.at) return '-';
		return formatTimestampLabel(new Date(p.at));
	}
	function truckIdleDays(t: Vehicle): number | null {
		const at = lastActiveOfTruck.get(t.id);
		if (!at) return null;
		return Math.max(0, Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000));
	}
	function formatNgosong(t: Vehicle) {
		const st = truckStatusOf(t);
		if (st === 'onduty' || st === 'planned') return '-';
		const d = truckIdleDays(t);
		return d == null ? 'Belum pernah kirim' : `${d} hari`;
	}

	// ---------------------------------------------------------------------
	// Open orders — the prototype's row shape from the API order
	// ---------------------------------------------------------------------
	type OpenOrder = {
		key: string;
		raw: any;
		orderId: string;
		shipperName: string;
		rute: string;
		tanggalPickup: string;
		itemNames: string;
		totalTonase: string;
		totalQty: string;
		totalVolume: string;
		tonaseKg: number;
		shipmentType: string;
		statusLabel: string;
		statusBadgeClass: string;
		truckTypeName: string;
		loadingIds: string[];
		unloadingIds: string[];
	};
	const openOrders = $derived.by<OpenOrder[]>(() =>
		orders.map((o) => {
			const d = o.detail ?? {};
			const items: any[] = d.items ?? [];
			const tonaseKg = Number(d.totalTonnage ?? o.weightKg ?? 0) || 0;
			const qty = items.length
				? items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
				: Number(o.quantity ?? 0) || 0;
			const volume = items.length
				? Math.round(
						items.reduce(
							(s, it) => s + (Number(it.dimP) || 0) * (Number(it.dimL) || 0) * (Number(it.dimT) || 0),
							0
						) * 100
					) / 100
				: Number(o.volumeM3 ?? 0) || 0;
			const loadingIds: string[] = d.loadingPoints ?? (o.originWarehouseId ? [o.originWarehouseId] : []);
			const unloadingIds: string[] =
				d.unloadingPoints ?? (o.destinationWarehouseId ? [o.destinationWarehouseId] : []);
			const status = kontrakStatus(o);
			return {
				key: o.id,
				raw: o,
				orderId: o.orderNumber ?? o.id,
				shipperName: o.shipperCompanyName ?? d.shipperName ?? o.customerName ?? '-',
				rute:
					d.rute ??
					[o.originWarehouseName, o.destinationWarehouseName].filter(Boolean).join(' — '),
				tanggalPickup: d.tanggalPickup ?? (o.pickupAt ? formatTimestampLabel(new Date(o.pickupAt)) : ''),
				itemNames: items.length
					? items.map((it) => it.name ?? it.nama ?? it.itemName).filter(Boolean).join(', ')
					: (d.muatan ?? o.cargoTypeName ?? '-'),
				totalTonase: d.totalBerat ?? `${formatThousands(String(Math.round(tonaseKg)))} Kg`,
				totalQty: d.kuantitas ?? String(qty),
				totalVolume: d.totalVolume ?? `${volume} m³`,
				tonaseKg,
				shipmentType: shipmentTypeLabel({ detail: d, loadingPoints: loadingIds, unloadingPoints: unloadingIds }),
				statusLabel: statusLabel(status),
				statusBadgeClass: statusBadgeClass(status),
				truckTypeName: o.truckTypeName ?? d.fleetDescription ?? '',
				loadingIds,
				unloadingIds
			};
		})
	);
	let ordersPage = $state(1);
	const pagedOpenOrders = $derived(
		openOrders.slice((ordersPage - 1) * ORDERS_PAGE_SIZE, ordersPage * ORDERS_PAGE_SIZE)
	);

	function stopsForOrder(o: OpenOrder | null, shipmentLabel?: string): Stop[] {
		if (!o) return [];
		const d = o.raw.detail ?? {};
		const out: Stop[] = [];
		const push = (id: string, type: 'muat' | 'bongkar', fallback: any) => {
			const w = warehouseById.get(id);
			out.push({
				type,
				kota: w?.city ?? fallback?.kota ?? '',
				label: w?.name ?? fallback?.label ?? (type === 'muat' ? o.raw.originWarehouseName : o.raw.destinationWarehouseName) ?? '-',
				alamat: w?.address ?? fallback?.detail ?? '',
				pic: w?.picName ?? fallback?.pic,
				telepon: w?.picPhone ?? fallback?.telepon,
				coords: warehouseCoords(w),
				shipmentLabel
			});
		};
		for (const id of o.loadingIds) push(id, 'muat', d.alamatMuat);
		for (const id of o.unloadingIds) push(id, 'bongkar', d.alamatBongkar);
		return out;
	}

	// ---------------------------------------------------------------------
	// Selection
	// ---------------------------------------------------------------------
	let activeTab = $state<'orders' | 'fleet' | 'vendor'>('orders');
	let selectedOrderKey = $state<string | null>(null);
	let selectedTruckId = $state<string | null>(null);
	let viewedTruckId = $state<string | null>(null);
	let sidePanelMinimized = $state(false);
	let stopsAccordionOpen = $state(true);
	let truckStatusFilter = $state<'all' | TruckStatus>('all');

	const selectedOrder = $derived(openOrders.find((o) => o.key === selectedOrderKey) ?? null);
	const selectedTruck = $derived(vehicles.find((t) => t.id === selectedTruckId) ?? null);
	const viewedTruck = $derived(vehicles.find((t) => t.id === viewedTruckId) ?? null);
	const stops = $derived(stopsForOrder(selectedOrder));
	/** Truck Options picked when the order was created (max 5), shown above Stops. */
	const selectedTruckOptions = $derived(truckOptionKeysOf(selectedOrder?.raw).map(describeTruckOption));

	// LTL — several orders on one truck
	let ltlSelectMode = $state(false);
	let ltlSelectedKeys = $state<string[]>([]);
	let ltlCollapsedCards = $state<string[]>([]);
	const ltlShipments = $derived(
		ltlSelectedKeys
			.map((k, i) => ({ order: openOrders.find((o) => o.key === k)!, label: `Shipment ${i + 1}` }))
			.filter((s) => s.order)
	);
	const ltlPanelActive = $derived(ltlSelectMode || ltlShipments.length > 0);
	const ltlCombinedTotals = $derived.by(() => {
		let kg = 0;
		let qty = 0;
		let vol = 0;
		for (const s of ltlShipments) {
			kg += s.order.tonaseKg;
			qty += Number(s.order.totalQty) || 0;
			vol += parseFloat(s.order.totalVolume) || 0;
		}
		return { tonase: `${formatThousands(String(Math.round(kg)))} Kg`, qty: String(qty), volume: `${Math.round(vol * 100) / 100} m³` };
	});
	const ltlCombinedStops = $derived.by(() => {
		const muat: Stop[] = [];
		const bongkar: Stop[] = [];
		for (const s of ltlShipments) {
			for (const st of stopsForOrder(s.order, s.label)) (st.type === 'muat' ? muat : bongkar).push(st);
		}
		return [...muat, ...bongkar];
	});
	const canPair = $derived(!!selectedTruck && (!!selectedOrder || (ltlPanelActive && ltlShipments.length > 0)));

	function selectOrder(o: OpenOrder) {
		if (ltlSelectMode) {
			toggleLtlOrder(o);
			return;
		}
		viewedTruckId = null;
		sidePanelMinimized = false;
		selectedOrderKey = selectedOrderKey === o.key ? null : o.key;
		findTransporterOpen = false;
	}
	function toggleLtlOrder(o: OpenOrder, e?: Event) {
		e?.stopPropagation();
		if (!ltlSelectMode) return;
		selectedOrderKey = null;
		ltlSelectedKeys = ltlSelectedKeys.includes(o.key)
			? ltlSelectedKeys.filter((k) => k !== o.key)
			: [...ltlSelectedKeys, o.key];
	}
	$effect(() => {
		if (!ltlSelectMode) ltlSelectedKeys = [];
	});
	function closeOrderDetail() {
		selectedOrderKey = null;
		selectedTruckId = null;
		viewedTruckId = null;
		ltlSelectMode = false;
		ltlSelectedKeys = [];
		findTransporterOpen = false;
	}
	function selectTruck(t: Vehicle) {
		if (truckStatusOf(t) !== 'available') {
			toast(`Truck ${t.licensePlate} sedang ${TRUCK_STATUS_META[truckStatusOf(t)].label} — tidak bisa ditugaskan`);
			return;
		}
		selectedTruckId = selectedTruckId === t.id ? null : t.id;
		if (selectedTruckId) flyTo = positionOf.get(t.id) ? [positionOf.get(t.id)!.lon, positionOf.get(t.id)!.lat] : null;
	}
	function viewTruckDetail(t: Vehicle, e?: Event) {
		e?.stopPropagation();
		viewedTruckId = t.id;
		sidePanelMinimized = false;
	}
	function closeTruckDetail() {
		viewedTruckId = null;
	}
	function viewOrder(o: OpenOrder, e?: Event) {
		e?.stopPropagation();
		goto(`${basePath.replace(/\/planner$/, '')}/order/${o.raw.id}`);
	}
	async function copyOrderCode(o: OpenOrder, e?: Event) {
		e?.stopPropagation();
		await copyText(o.orderId);
		toast(`ID Order ${o.orderId} disalin`);
	}
	function toggleLtlCard(key: string) {
		ltlCollapsedCards = ltlCollapsedCards.includes(key)
			? ltlCollapsedCards.filter((k) => k !== key)
			: [...ltlCollapsedCards, key];
	}

	// ---------------------------------------------------------------------
	// Routes: the haul (order) and the approach (truck → first loading point)
	// ---------------------------------------------------------------------
	let haulRoute = $state<RouteSummary>({ distanceKm: null, durationMin: null, geometry: [] });
	let approachRoute = $state<RouteSummary>({ distanceKm: null, durationMin: null, geometry: [] });
	let approachLoading = $state(false);

	function summarise(r: any): RouteSummary {
		const src = r?.route ?? r ?? {};
		return {
			distanceKm: src.distanceMeters != null ? Math.round(src.distanceMeters / 100) / 10 : null,
			durationMin: src.durationSeconds != null ? Math.round(src.durationSeconds / 60) : null,
			geometry: Array.isArray(src.geometry) ? src.geometry : []
		};
	}
	async function planRoute(points: [number, number][]): Promise<RouteSummary> {
		if (points.length < 2) return { distanceKm: null, durationMin: null, geometry: [] };
		const res = await api.post(ENDPOINTS.routing.route, { points, profile: 'truck', includeTolls: true });
		return summarise(res.data?.data ?? res.data);
	}
	const routeStops = $derived(ltlPanelActive ? ltlCombinedStops : stops);
	const routePoints = $derived(routeStops.map((s) => s.coords).filter(Boolean) as [number, number][]);
	const firstLoadingPoint = $derived(routeStops.find((s) => s.type === 'muat')?.coords ?? null);

	let haulToken = 0;
	$effect(() => {
		const order = selectedOrder;
		const pts = routePoints;
		const token = ++haulToken;
		haulRoute = { distanceKm: null, durationMin: null, geometry: [] };
		if (!pts.length) return;
		(async () => {
			try {
				// A single order already has its haul planned at creation; ask for
				// that first, and only plan afresh for a combined LTL route.
				if (order && !ltlPanelActive) {
					const legs = (await api.get(ENDPOINTS.orders.routes(order.raw.id))).data?.data ?? [];
					const haul = legs.find((l: any) => l.leg === 'haul');
					if (haul && token === haulToken) {
						haulRoute = summarise(haul);
						if (haulRoute.geometry.length) return;
					}
				}
				const r = await planRoute(pts);
				if (token === haulToken) haulRoute = r;
			} catch {
				/* the map still shows the stops; distance reads "-" */
			}
		})();
	});
	let approachToken = 0;
	$effect(() => {
		const t = selectedTruck;
		const target = firstLoadingPoint;
		const token = ++approachToken;
		approachRoute = { distanceKm: null, durationMin: null, geometry: [] };
		if (!t || !target) return;
		const p = positionOf.get(t.id);
		if (!p) return;
		approachLoading = true;
		planRoute([[p.lon, p.lat], target])
			.then((r) => {
				if (token === approachToken) approachRoute = r;
			})
			.catch(() => {})
			.finally(() => {
				if (token === approachToken) approachLoading = false;
			});
	});
	function formatDurationMin(min: number | null) {
		if (min == null) return '-';
		const h = Math.floor(min / 60);
		const m = min % 60;
		return h ? `${h} jam ${m} mnt` : `${m} mnt`;
	}

	// ---------------------------------------------------------------------
	// Find Truck — near the loading point, by type, idle first
	// ---------------------------------------------------------------------
	let findTransporterOpen = $state(false);
	let transporterTypeFilter = $state<string[]>([]);
	let transporterRadiusKm = $state(DEFAULT_PICKUP_RADIUS_KM);
	let transporterSortIdle = $state(false);
	const truckTypeOptions = $derived(
		[...new Set(vehicles.map(typeLabel).filter((x) => x && x !== '-'))].sort().map((v) => ({ value: v, label: v }))
	);
	function truckDistanceKm(t: Vehicle): number | null {
		const p = positionOf.get(t.id);
		if (!p || !firstLoadingPoint) return null;
		return Math.round(haversineKm({ lat: p.lat, lng: p.lon }, { lat: firstLoadingPoint[1], lng: firstLoadingPoint[0] }) * 10) / 10;
	}
	function truckEtaMinutes(t: Vehicle): number | null {
		const d = truckDistanceKm(t);
		return d == null ? null : Math.round((d / AVERAGE_TRUCK_SPEED_KMH) * 60);
	}
	function equipmentMatch(t: Vehicle) {
		const mine = typeLabel(t).toLowerCase();
		if (selectedTruckOptions.some((o) => mine.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(mine))) return true;
		const want = (selectedOrder?.truckTypeName ?? '').toLowerCase();
		return !!want && mine.includes(want);
	}
	const transporterCandidates = $derived.by(() => {
		let list = vehicles.filter((t) => truckStatusOf(t) === 'available');
		if (transporterTypeFilter.length) list = list.filter((t) => transporterTypeFilter.includes(typeLabel(t)));
		list = list.filter((t) => {
			const d = truckDistanceKm(t);
			return d != null && d <= transporterRadiusKm;
		});
		list = [...list].sort((a, b) => {
			if (transporterSortIdle) {
				const ia = truckIdleDays(a) ?? -1;
				const ib = truckIdleDays(b) ?? -1;
				if (ia !== ib) return ib - ia;
			}
			return (truckDistanceKm(a) ?? 1e9) - (truckDistanceKm(b) ?? 1e9);
		});
		return list;
	});
	const transporterShortlist = $derived(transporterCandidates.slice(0, 3));
	function openFindTransporter() {
		findTransporterOpen = true;
		transporterTypeFilter = selectedOrder?.truckTypeName
			? truckTypeOptions.filter((o) => o.value.toLowerCase().includes(selectedOrder!.truckTypeName.toLowerCase())).map((o) => o.value)
			: [];
		activeTab = 'fleet';
	}

	// ---------------------------------------------------------------------
	// Fleet catalog + vendor catalog
	// ---------------------------------------------------------------------
	const FLEET_STATUS_RANK: Record<TruckStatus, number> = { available: 0, planned: 1, onduty: 2, unpaired: 3, unavailable: 4 };
	const fleetCatalogTrucks = $derived.by(() => {
		let list = filteredTrucks;
		if (findTransporterOpen) {
			if (transporterTypeFilter.length) list = list.filter((t) => transporterTypeFilter.includes(typeLabel(t)));
			list = list.filter((t) => {
				const d = truckDistanceKm(t);
				return d != null && d <= transporterRadiusKm;
			});
		}
		return [...list].sort((a, b) => {
			const r = FLEET_STATUS_RANK[truckStatusOf(a)] - FLEET_STATUS_RANK[truckStatusOf(b)];
			if (r) return r;
			if (findTransporterOpen) return (truckDistanceKm(a) ?? 1e9) - (truckDistanceKm(b) ?? 1e9);
			return a.licensePlate.localeCompare(b.licensePlate);
		});
	});
	let fleetPage = $state(1);
	const pagedFleetCatalogTrucks = $derived(
		fleetCatalogTrucks.slice((fleetPage - 1) * FLEET_PAGE_SIZE, fleetPage * FLEET_PAGE_SIZE)
	);
	let vendorPage = $state(1);
	const pagedVendorCatalog = $derived(vendors.slice((vendorPage - 1) * VENDOR_PAGE_SIZE, vendorPage * VENDOR_PAGE_SIZE));
	$effect(() => {
		void truckStatusFilter, findTransporterOpen, transporterTypeFilter, transporterRadiusKm;
		fleetPage = 1;
	});

	// ---------------------------------------------------------------------
	// Assign
	// ---------------------------------------------------------------------
	let confirming = $state<{ truck: Vehicle; orders: OpenOrder[] } | null>(null);
	let pairing = $state(false);
	function confirmAssign(t: Vehicle, e?: Event) {
		e?.stopPropagation();
		const targets = ltlPanelActive ? ltlShipments.map((s) => s.order) : selectedOrder ? [selectedOrder] : [];
		if (!targets.length) {
			toast('Pilih order terlebih dahulu');
			return;
		}
		if (!t.currentDriverId) {
			toast(`Truck ${t.licensePlate} belum punya driver — pasangkan dulu di My Fleet`);
			return;
		}
		if (truckStatusOf(t) !== 'available') {
			toast(`Truck ${t.licensePlate} sedang ${TRUCK_STATUS_META[truckStatusOf(t)].label}`);
			return;
		}
		selectedTruckId = t.id;
		confirming = { truck: t, orders: targets };
	}
	async function assignConfirmed() {
		if (!confirming) return;
		const { truck, orders: targets } = confirming;
		pairing = true;
		try {
			for (const o of targets) {
				await api.put(ENDPOINTS.orders.assign(o.raw.id), { driverId: truck.currentDriverId, truckId: truck.id });
			}
			toast(
				targets.length > 1
					? `${targets.length} order ditugaskan ke ${truck.licensePlate} (LTL)`
					: `Order ${targets[0].orderId} ditugaskan ke ${truck.licensePlate}`
			);
			confirming = null;
			closeOrderDetail();
			await loadOrders();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menugaskan truck');
		} finally {
			pairing = false;
		}
	}

	// ---------------------------------------------------------------------
	// Map
	// ---------------------------------------------------------------------
	let flyTo = $state<[number, number] | null>(null);
	const filteredTrucks = $derived.by(() => {
		let list = truckStatusFilter === 'all' ? vehicles : vehicles.filter((t) => truckStatusOf(t) === truckStatusFilter);
		const q = truckSearchQuery.trim().toLowerCase();
		if (q) list = list.filter((t) => t.licensePlate.toLowerCase().includes(q) || (t.driver?.fullName ?? '').toLowerCase().includes(q));
		return list;
	});
	const markers = $derived.by<MapMarker[]>(() => {
		const out: MapMarker[] = [];
		for (const t of filteredTrucks) {
			const p = positionOf.get(t.id);
			if (!p) continue;
			const st = truckStatusOf(t);
			out.push({
				id: `truck-${t.id}`,
				lat: p.lat,
				lng: p.lon,
				icon: TRUCK_MARKER[TRUCK_STATUS_META[st].icon],
				iconWidth: 18,
				iconHeight: 40,
				color: TRUCK_STATUS_META[st].color,
				label: t.licensePlate,
				selected: selectedTruckId === t.id,
				onClick: () => {
					if (selectedOrder || ltlPanelActive) selectTruck(t);
					else viewTruckDetail(t);
				}
			});
		}
		routeStops.forEach((s, i) => {
			if (!s.coords) return;
			out.push({
				id: `stop-${i}`,
				lat: s.coords[1],
				lng: s.coords[0],
				color: s.type === 'muat' ? '#0B57D0' : '#146C2E',
				label: `${s.type === 'muat' ? 'Muat' : 'Bongkar'}${s.shipmentLabel ? ` · ${s.shipmentLabel}` : ''}`,
				title: s.label,
				subtitle: s.alamat
			});
		});
		return out;
	});
	const lines = $derived.by<MapLine[]>(() => {
		const out: MapLine[] = [];
		if (haulRoute.geometry.length) out.push({ id: 'haul', coordinates: haulRoute.geometry, color: '#0B57D0', width: 4 });
		if (approachRoute.geometry.length)
			out.push({ id: 'approach', coordinates: approachRoute.geometry, color: '#146C2E', width: 3, dashed: true });
		return out;
	});
	// Fit once per selection or route change, not on every position refresh.
	// The first fit happens once positions have arrived, so the fleet is in view.
	const fitKey = $derived(
		`${positionOf.size > 0 ? 'fleet' : ''}|${selectedOrderKey}|${ltlSelectedKeys.join(',')}|${haulRoute.geometry.length > 0}|${approachRoute.geometry.length > 0}`
	);

	function attr(t: Vehicle | null, ...keys: string[]) {
		for (const k of keys) {
			const v = t?.attributes?.[k];
			if (v != null && v !== '') return String(v);
		}
		return '-';
	}
	function openFullTruckDetail() {
		if (viewedTruck) goto(`${basePath.replace(/\/planner$/, '')}/fleet/truck/${viewedTruck.id}`);
	}
</script>

<div class="planner-page planner-page--cards">
	<div class="ct-topbar">
		<div class="ct-topbar-search">
			<Search size={14} />
			<input type="text" bind:value={truckSearchQuery} placeholder="Cari nomor polisi atau pengemudi" />
		</div>
		<div class="ct-topbar-legend">
			<button type="button" class="ct-topbar-legend-item" class:ct-topbar-legend-item--active={truckStatusFilter === 'all'} onclick={() => (truckStatusFilter = 'all')}>
				<span class="ct-topbar-legend-label">Semua Status</span>
				<span class="ct-topbar-legend-count">{vehicles.length}</span>
			</button>
			{#each TRUCK_STATUS_LIST as s (s.key)}
				<button type="button" class="ct-topbar-legend-item" class:ct-topbar-legend-item--active={truckStatusFilter === s.key} onclick={() => (truckStatusFilter = truckStatusFilter === s.key ? 'all' : s.key)}>
					<span class="ct-topbar-legend-dot" style="background:{s.color}"></span>
					<span class="ct-topbar-legend-label">{s.label}</span>
					<span class="ct-topbar-legend-count">{truckStatusCounts[s.key]}</span>
				</button>
			{/each}
		</div>
		<div class="ct-topbar-clock"><Clock size={13} /> {topbarClockLabel}</div>
	</div>

	<div class="planner-shell">
	{#if selectedOrder || viewedTruck || ltlPanelActive}
		<div class="card planner-side-panel" class:planner-side-panel-minimized={sidePanelMinimized} style="width:{sidePanelMinimized ? 56 : 340}px">
			<button type="button" class="planner-side-minimize" title={sidePanelMinimized ? 'Perbesar' : 'Perkecil'} onclick={() => (sidePanelMinimized = !sidePanelMinimized)}>
				<ChevronDown size={16} />
			</button>
			{#if !sidePanelMinimized}
				<button type="button" class="planner-side-close" title="Tutup Detail" onclick={closeOrderDetail}><X size={16} /></button>
			{/if}

			{#if !sidePanelMinimized && viewedTruck}
				{@const st = truckStatusOf(viewedTruck)}
				<div class="planner-order-header">
					<div class="planner-order-title-row">
						<div class="planner-order-company">{viewedTruck.licensePlate}</div>
						<span class="planner-truck-status-badge">
							<span class="planner-truck-legend-dot" style="background:{TRUCK_STATUS_META[st].color}"></span>
							{TRUCK_STATUS_META[st].label}
						</span>
					</div>
					<div class="planner-order-meta">{typeLabel(viewedTruck)}{#if viewedTruck.attributes?.noLambung} · No. Lambung {viewedTruck.attributes.noLambung}{/if}</div>
				</div>
				<div class="planner-td-grid">
					<div class="planner-td-item"><div class="planner-td-label">Driver</div><div class="planner-td-value">{viewedTruck.driver?.fullName ?? 'Belum Ada Driver'}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Lokasi</div><div class="planner-td-value">{truckLocation(viewedTruck)}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Last Update GPS</div><div class="planner-td-value">{formatLastGpsUpdate(viewedTruck)}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Axle</div><div class="planner-td-value">{attr(viewedTruck, 'axle')}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Brand · Warna</div><div class="planner-td-value">{attr(viewedTruck, 'brand', 'merk')} · {attr(viewedTruck, 'color', 'warna')}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Dimensi (P×L×T, m)</div><div class="planner-td-value">{attr(viewedTruck, 'dimP', 'lengthM')} × {attr(viewedTruck, 'dimL', 'widthM')} × {attr(viewedTruck, 'dimT', 'heightM')}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">Max Berat / Volume</div><div class="planner-td-value">{attr(viewedTruck, 'maxWeight', 'maxWeightKg')} Kg · {attr(viewedTruck, 'maxVolume', 'maxVolumeM3')} m³</div></div>
					<div class="planner-td-item"><div class="planner-td-label">No STNK</div><div class="planner-td-value">{attr(viewedTruck, 'noStnk', 'stnkNumber')}</div></div>
					<div class="planner-td-item"><div class="planner-td-label">No KIR</div><div class="planner-td-value">{attr(viewedTruck, 'noKir', 'kirNumber')}</div></div>
				</div>
				<div style="display:flex; gap:8px; margin-top:16px;">
					<button type="button" class="btn btn-outline" style="flex:1;" onclick={openFullTruckDetail}>Lihat Detail Lengkap</button>
					<button type="button" class="btn btn-outline" onclick={closeTruckDetail}>{selectedOrder || ltlPanelActive ? 'Kembali ke Order' : 'Tutup'}</button>
				</div>
			{:else if !sidePanelMinimized && (selectedOrder || ltlPanelActive)}
				{#if ltlPanelActive}
					<div class="planner-order-header">
						<div class="planner-order-title-row"><div class="planner-order-company">Pengiriman Gabungan (LTL)</div></div>
						<div class="planner-order-meta">{ltlShipments.length} order digabungkan</div>
					</div>
					<div class="planner-ltl-shipments">
						{#each ltlShipments as sh (sh.order.key)}
							<div class="planner-ltl-shipment-card" class:planner-ltl-shipment-card--collapsed={ltlCollapsedCards.includes(sh.order.key)}>
								<button type="button" class="planner-ltl-shipment-head" onclick={() => toggleLtlCard(sh.order.key)}>
									<span class="planner-order-company planner-ltl-shipment-company">{sh.order.shipperName}</span>
									<span class="planner-ltl-shipment-badge">{sh.label}</span>
									<span class="planner-ltl-shipment-toggle" style="transform:{ltlCollapsedCards.includes(sh.order.key) ? 'none' : 'rotate(180deg)'}"><ChevronDown size={14} /></span>
								</button>
								{#if !ltlCollapsedCards.includes(sh.order.key)}
									<div class="planner-order-meta">{sh.order.orderId} · {sh.order.tanggalPickup || '-'}</div>
									<div class="planner-item-name">{sh.order.itemNames}</div>
									<div class="planner-muatan-strip">
										<div class="planner-muatan-item"><div class="planner-muatan-label">Tonase</div><div class="planner-muatan-value">{sh.order.totalTonase}</div></div>
										<div class="planner-muatan-item"><div class="planner-muatan-label">Qty</div><div class="planner-muatan-value">{sh.order.totalQty}</div></div>
										<div class="planner-muatan-item"><div class="planner-muatan-label">Volume</div><div class="planner-muatan-value">{sh.order.totalVolume}</div></div>
									</div>
								{/if}
							</div>
						{/each}
						{#if !ltlShipments.length}<div class="hint">Pilih order dari daftar Open Orders untuk digabungkan.</div>{/if}
					</div>
					<div class="planner-stops-label">Total Gabungan</div>
					<div class="planner-muatan-strip">
						<div class="planner-muatan-item"><div class="planner-muatan-label">Tonase</div><div class="planner-muatan-value">{ltlCombinedTotals.tonase}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">Qty</div><div class="planner-muatan-value">{ltlCombinedTotals.qty}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">Volume</div><div class="planner-muatan-value">{ltlCombinedTotals.volume}</div></div>
					</div>
					<div class="planner-stops-label">Susunan Rute Gabungan</div>
					<div class="planner-custom-stops">
						{#each ltlCombinedStops as s, i (i)}
							<div class="planner-custom-stop">
								<div class="planner-custom-stop-num planner-custom-stop-num--{s.type}">{i + 1}</div>
								<div class="planner-custom-stop-pill" title={s.label}>
									<span class="planner-ltl-stop-tag">{s.shipmentLabel}</span>
									{s.type === 'muat' ? 'Muat' : 'Bongkar'} · {s.label}
								</div>
							</div>
						{/each}
						{#if !ltlCombinedStops.length}<div class="hint">Titik rute belum tersedia.</div>{/if}
					</div>
				{:else if selectedOrder}
					<div class="planner-order-header">
						<div class="planner-order-title-row"><div class="planner-order-company">{selectedOrder.shipperName}</div></div>
						<div class="planner-order-meta">{selectedOrder.orderId} · {selectedOrder.tanggalPickup || '-'}</div>
					</div>
					<div class="planner-item-name">{selectedOrder.itemNames}</div>
					<div class="planner-muatan-strip">
						<div class="planner-muatan-item"><div class="planner-muatan-label">Tonase</div><div class="planner-muatan-value">{selectedOrder.totalTonase}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">Qty</div><div class="planner-muatan-value">{selectedOrder.totalQty}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">Volume</div><div class="planner-muatan-value">{selectedOrder.totalVolume}</div></div>
					</div>
					<div class="planner-truck-options">
						<div class="planner-truck-options-head">
							<span class="planner-stops-label">Truck Options</span>
							<span class="planner-truck-options-count">{selectedTruckOptions.length}/{MAX_TRUCK_OPTIONS}</span>
						</div>
						{#each selectedTruckOptions as opt, i (opt.key)}
							<div class="planner-truck-option">
								<span class="planner-truck-option-num">{i + 1}</span>
								<span class="planner-truck-option-icon"><TruckIcon size={20} /></span>
								<span class="planner-truck-option-label">{opt.label}</span>
								{#if opt.size}<span class="planner-truck-option-size" style="background:{opt.color}">{opt.size}</span>{/if}
							</div>
						{/each}
						{#if !selectedTruckOptions.length}<div class="planner-truck-options-empty">Belum ada pilihan truck pada order ini.</div>{/if}
					</div>
					<button type="button" class="planner-stops-label planner-stops-toggle" onclick={() => (stopsAccordionOpen = !stopsAccordionOpen)}>
						Stops <span style="display:inline-flex; transform:{stopsAccordionOpen ? 'rotate(180deg)' : 'none'}"><ChevronDown size={14} /></span>
					</button>
					<div class="planner-stops">
						{#each stops as s, i (i)}
							<div class="planner-stop">
								<div class="planner-stop-marker">
									<span class="planner-stop-icon" class:planner-stop-icon--muat={s.type === 'muat'} class:planner-stop-icon--bongkar={s.type === 'bongkar'}><MapPin size={14} /></span>
									{#if i < stops.length - 1}<span class="planner-stop-line"></span>{/if}
								</div>
								<div class="planner-stop-body">
									<div class="planner-stop-type">{s.type === 'muat' ? 'Muat' : 'Bongkar'}</div>
									<div class="planner-stop-city">{s.kota || '-'}</div>
									{#if stopsAccordionOpen}
										<div class="planner-stop-name">{s.label}</div>
										<div class="planner-stop-address">{s.alamat}</div>
										{#if s.pic}
											<div class="planner-stop-contact"><User size={12} /> {s.pic}{#if s.telepon} · <Phone size={12} /> {s.telepon}{/if}</div>
										{/if}
									{/if}
								</div>
							</div>
						{/each}
						{#if !stops.length}<div class="hint">Alamat belum tersedia.</div>{/if}
					</div>
				{/if}

				<div class="planner-route-strip-label">Rute Menuju Lokasi Muat</div>
				{#if selectedTruck}
					<div class="planner-muatan-strip">
						<div class="planner-muatan-item"><div class="planner-muatan-label">Jarak</div><div class="planner-muatan-value">{approachLoading ? '…' : approachRoute.distanceKm != null ? `${approachRoute.distanceKm} Km` : '-'}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">ETA</div><div class="planner-muatan-value">{approachLoading ? '…' : formatDurationMin(approachRoute.durationMin)}</div></div>
						<div class="planner-muatan-item"><div class="planner-muatan-label">Truck</div><div class="planner-muatan-value">{selectedTruck.licensePlate}</div></div>
					</div>
				{:else}
					<div class="hint planner-route-strip-hint">Pilih truck terlebih dahulu untuk melihat rute menuju lokasi muat.</div>
				{/if}
				<div class="planner-route-strip-label">Rute Pengiriman</div>
				<div class="planner-muatan-strip">
					<div class="planner-muatan-item"><div class="planner-muatan-label">Jarak</div><div class="planner-muatan-value">{haulRoute.distanceKm != null ? `${haulRoute.distanceKm} Km` : '-'}</div></div>
					<div class="planner-muatan-item"><div class="planner-muatan-label">ETA</div><div class="planner-muatan-value">{formatDurationMin(haulRoute.durationMin)}</div></div>
					<div class="planner-muatan-item"><div class="planner-muatan-label">Titik</div><div class="planner-muatan-value">{routeStops.length}</div></div>
				</div>

				{#if findTransporterOpen}
					<div class="planner-find-transporter">
						<div class="planner-ft-filter-group">
							<div class="planner-ft-filter-label">Jenis Truck</div>
							<FieldSelect bind:value={transporterTypeFilter} options={truckTypeOptions} multiple compact chipsBelow placeholder="Semua Jenis Truck" />
						</div>
						<div class="planner-ft-filter-group">
							<div class="planner-ft-filter-label">Radius dari Lokasi Muat</div>
							<div class="planner-ft-radius-row">
								<input type="range" min="10" max="300" step="10" bind:value={transporterRadiusKm} />
								<span class="planner-ft-radius-value">{transporterRadiusKm} km</span>
							</div>
						</div>
						<label class="planner-ft-idle-toggle"><input type="checkbox" bind:checked={transporterSortIdle} /> Prioritaskan truck paling lama idle</label>
						<div class="planner-ft-results-label">Rekomendasi Teratas</div>
						<div class="planner-ft-results">
							{#each transporterShortlist as t (t.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
								<div class="planner-ft-result" class:planner-ft-result-selected={selectedTruckId === t.id} onclick={() => selectTruck(t)}>
									<div class="planner-ft-result-body">
										<div class="planner-ft-result-name">{t.driver?.fullName ?? 'Belum Ada Driver'}</div>
										<div class="planner-ft-result-sub">{t.licensePlate} · {typeLabel(t)} · {truckLocation(t)}</div>
										<div class="planner-ft-result-tags">
											{#if truckDistanceKm(t) != null}<span class="planner-ft-tag">{truckDistanceKm(t)} km dari lokasi muat</span>{/if}
											{#if truckEtaMinutes(t) != null}<span class="planner-ft-tag">~{truckEtaMinutes(t)} menit ke lokasi muat</span>{/if}
											{#if transporterSortIdle}<span class="planner-ft-tag">{truckIdleDays(t) != null ? `${truckIdleDays(t)} hari idle` : 'Belum pernah kirim'}</span>{/if}
											{#if equipmentMatch(t)}<span class="planner-ft-tag planner-ft-tag-good">Sesuai jenis truck order</span>{/if}
										</div>
									</div>
									<button type="button" class="planner-ft-assign-btn" onclick={(e) => confirmAssign(t, e)}>Assign</button>
								</div>
							{/each}
							{#if !transporterShortlist.length}<div class="hint">Tidak ada truck available dengan posisi diketahui dalam radius ini.</div>{/if}
						</div>
					</div>
				{/if}

				<div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
					<button type="button" class="btn btn-outline" style="width:100%; justify-content:center;" onclick={() => (findTransporterOpen ? (findTransporterOpen = false) : openFindTransporter())}>
						<Search size={14} /> {findTransporterOpen ? 'Tutup Find Truck' : 'Find Truck'}
					</button>
				</div>

				{#if selectedTruck && !findTransporterOpen}
					<div class="planner-ft-result planner-selected-truck-card">
						<div class="planner-ft-result-body">
							<div class="planner-ft-result-name">{selectedTruck.driver?.fullName ?? 'Belum Ada Driver'}</div>
							<div class="planner-ft-result-sub">{selectedTruck.licensePlate} · {typeLabel(selectedTruck)} · {truckLocation(selectedTruck)}</div>
							<div class="planner-ft-result-tags">
								{#if truckDistanceKm(selectedTruck) != null}<span class="planner-ft-tag">{truckDistanceKm(selectedTruck)} km dari lokasi muat</span>{/if}
								{#if truckEtaMinutes(selectedTruck) != null}<span class="planner-ft-tag">~{truckEtaMinutes(selectedTruck)} menit ke lokasi muat</span>{/if}
								{#if equipmentMatch(selectedTruck)}<span class="planner-ft-tag planner-ft-tag-good">Sesuai jenis truck order</span>{/if}
							</div>
						</div>
						<button type="button" class="planner-ft-assign-btn" disabled={!canPair || pairing} onclick={() => confirmAssign(selectedTruck!)}>{pairing ? 'Menugaskan...' : 'Assign'}</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}

	<div class="card planner-map-panel">
		<MapView {markers} {lines} {fitKey} {flyTo} class="planner-map-canvas" />
		<div class="planner-map-legends">
			<div class="planner-map-legend">
				<span><span class="planner-legend-icon planner-legend-icon--pickup"><MapPin size={16} /></span> Muat</span>
				<span><span class="planner-legend-icon planner-legend-icon--dropoff"><MapPin size={16} /></span> Bongkar</span>
			</div>
		</div>
	</div>
	</div>

	<div class="card planner-orders-panel">
		<div class="planner-orders-head">
			<div class="method-tabs">
				<button class="method-tab" class:active={activeTab === 'orders'} onclick={() => (activeTab = 'orders')}>Open Orders ({openOrders.length})</button>
				<button class="method-tab" class:active={activeTab === 'fleet'} onclick={() => (activeTab = 'fleet')}>Fleet Catalog ({fleetCatalogTrucks.length})</button>
				<button class="method-tab" class:active={activeTab === 'vendor'} onclick={() => (activeTab = 'vendor')}>Transporter Catalog ({vendors.length})</button>
			</div>
		</div>
		<div class="planner-orders-scroll">
			{#if activeTab === 'orders'}
				<table class="planner-table">
					<colgroup>
						<col style="width:9%" /><col style="width:12%" /><col style="width:13%" /><col style="width:15%" /><col style="width:26%" /><col style="width:16%" /><col style="width:9%" />
					</colgroup>
					<thead>
						<tr>
							<th class="planner-ltl-col">
								<label class="planner-ltl-toggle" title="Aktifkan untuk memilih beberapa order sekaligus">
									<input type="checkbox" bind:checked={ltlSelectMode} />
									<span class="planner-ltl-switch"></span>
									LTL
								</label>
							</th>
							<th>Type Pengiriman</th><th>ID Order</th><th>Klien</th><th>Rute</th><th>Status</th><th>Kontrol</th>
						</tr>
					</thead>
					<tbody>
						{#if loading}
							<tr><td colspan="7"><div class="empty">Memuat…</div></td></tr>
						{:else if !openOrders.length}
							<tr><td colspan="7"><div class="empty"><div class="eic">📦</div>Tidak ada order terbuka.</div></td></tr>
						{/if}
						{#each pagedOpenOrders as o (o.key)}
							<tr class="planner-row" class:planner-row-selected={selectedOrderKey === o.key || ltlSelectedKeys.includes(o.key)} onclick={() => selectOrder(o)}>
								<td class="planner-ltl-col">
									<input type="checkbox" class="planner-ltl-check" disabled={!ltlSelectMode} checked={ltlSelectedKeys.includes(o.key)} onclick={(e) => toggleLtlOrder(o, e)} />
								</td>
								<td><span class="badge" class:badge-active={o.shipmentType === 'Multi Shipment'} class:badge-planner={o.shipmentType !== 'Multi Shipment'}>{o.shipmentType}</span></td>
								<td><b>{o.orderId}</b></td>
								<td>{o.shipperName}</td>
								<td>{o.rute || '-'}</td>
								<td><span class="badge {o.statusBadgeClass}">{o.statusLabel}</span></td>
								<td>
									<div class="action-cell">
										<button class="mini-icon-btn" title="Lihat detail" onclick={(e) => viewOrder(o, e)}><Search size={14} /></button>
										<button class="mini-icon-btn" title="Salin kode order" onclick={(e) => copyOrderCode(o, e)}><Copy size={14} /></button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else if activeTab === 'fleet'}
				<table class="planner-table">
					<thead>
						<tr>
							<th>No Polisi</th><th>Tipe Truck</th><th>Driver</th><th>Lokasi</th><th>Last Update GPS</th><th>Ngosong</th><th>Status</th>
							{#if findTransporterOpen}<th>Jarak</th>{/if}
							<th>Kontrol</th>
						</tr>
					</thead>
					<tbody>
						{#if !fleetCatalogTrucks.length}
							<tr><td colspan={findTransporterOpen ? 9 : 8}><div class="empty"><div class="eic">🚚</div>Tidak ada truck pada status ini.</div></td></tr>
						{/if}
						{#each pagedFleetCatalogTrucks as t (t.id)}
							{@const st = truckStatusOf(t)}
							<tr class="planner-row" class:planner-row-selected={selectedTruckId === t.id} class:planner-row-disabled={st !== 'available'} onclick={() => selectTruck(t)}>
								<td><b>{t.licensePlate}</b></td>
								<td>{typeLabel(t)}</td>
								<td>{t.driver?.fullName ?? '-'}</td>
								<td>{truckLocation(t)}</td>
								<td>{formatLastGpsUpdate(t)}</td>
								<td>{formatNgosong(t)}</td>
								<td>
									<span class="planner-truck-status-badge">
										<span class="planner-truck-legend-dot" style="background:{TRUCK_STATUS_META[st].color}"></span>
										{TRUCK_STATUS_META[st].label}
									</span>
								</td>
								{#if findTransporterOpen}<td>{truckDistanceKm(t) != null ? `${truckDistanceKm(t)} km` : '-'}</td>{/if}
								<td>
									<div class="action-cell" style="align-items:center;">
										<button class="mini-icon-btn" title="Lihat detail truck" onclick={(e) => viewTruckDetail(t, e)}><TruckIcon size={14} /></button>
										<button type="button" class="planner-ft-assign-btn planner-ft-assign-btn-sm" disabled={st !== 'available'} onclick={(e) => confirmAssign(t, e)}>Assign</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<table class="planner-table">
					<thead>
						<tr><th>Nama Perusahaan</th><th>PIC</th><th>Sektor</th><th>Status</th><th>Kontrol</th></tr>
					</thead>
					<tbody>
						{#if !vendors.length}
							<tr><td colspan="5"><div class="empty"><div class="eic">🤝</div>Belum ada vendor transporter terdaftar. Hubungi Customer Support Karlo untuk menambahkan.</div></td></tr>
						{/if}
						{#each pagedVendorCatalog as v (v.id)}
							<tr class="planner-row" class:planner-row-disabled={v.status && v.status !== 'active'}>
								<td><b>{v.name ?? v.companyName ?? '-'}</b></td>
								<td>{v.profile?.picName ?? v.picName ?? '-'}</td>
								<td>{v.profile?.industrySector ?? v.industrySector ?? '-'}</td>
								<td><span class="badge" class:badge-active={!v.status || v.status === 'active'} class:badge-fail={v.status && v.status !== 'active'}>{!v.status || v.status === 'active' ? 'Aktif' : 'Nonaktif'}</span></td>
								<td>
									<div class="action-cell" style="align-items:center;">
										<button type="button" class="planner-ft-assign-btn planner-ft-assign-btn-sm" disabled title="Penugasan ke vendor transporter dilakukan dari halaman order">Assign</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
		{#if activeTab === 'orders' && openOrders.length}
			<div class="planner-orders-foot"><Pagination totalItems={openOrders.length} pageSize={ORDERS_PAGE_SIZE} bind:page={ordersPage} /></div>
		{:else if activeTab === 'fleet' && fleetCatalogTrucks.length}
			<div class="planner-orders-foot"><Pagination totalItems={fleetCatalogTrucks.length} pageSize={FLEET_PAGE_SIZE} bind:page={fleetPage} /></div>
		{:else if activeTab === 'vendor' && vendors.length}
			<div class="planner-orders-foot"><Pagination totalItems={vendors.length} pageSize={VENDOR_PAGE_SIZE} bind:page={vendorPage} /></div>
		{/if}
	</div>
</div>

<ConfirmModal
	open={!!confirming}
	title={confirming && confirming.orders.length > 1 ? 'Tugaskan Pengiriman Gabungan?' : 'Tugaskan Truck?'}
	message={confirming
		? confirming.orders.length > 1
			? `${confirming.orders.length} order (${confirming.orders.map((o) => o.orderId).join(', ')}) akan ditugaskan ke truck <b>${confirming.truck.licensePlate}</b> dengan driver <b>${confirming.truck.driver?.fullName ?? '-'}</b> sebagai satu pengiriman LTL.`
			: `Order <b>${confirming.orders[0].orderId}</b> akan ditugaskan ke truck <b>${confirming.truck.licensePlate}</b> dengan driver <b>${confirming.truck.driver?.fullName ?? '-'}</b>. Driver akan menerima notifikasi penugasan.`
		: ''}
	confirmLabel="Ya, Tugaskan"
	danger={false}
	busy={pairing}
	onConfirm={assignConfirmed}
	onClose={() => (confirming = null)}
/>

<style>
	/* MapView is a fixed-height component elsewhere; here it fills the panel. */
	.planner-map-panel :global(.planner-map-canvas) {
		position: absolute;
		inset: 0;
		height: 100%;
		min-height: 0;
		border-radius: 0;
	}
	/* Clear MapLibre's own navigation control in the top-right corner. */
	.planner-map-legends {
		right: 56px;
	}
	.planner-ltl-shipment-toggle {
		display: inline-flex;
		margin-left: auto;
	}
</style>
