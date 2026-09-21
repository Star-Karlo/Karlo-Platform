<script lang="ts">
	/**
	 * Control Tower: the live fleet and the orders it is carrying, on one screen.
	 *
	 * Modelled on FMS's Live View for the fleet half — the same client
	 * selector, the same vehicle list, the same truck markers — and on the
	 * K-Fleet console for the order half: a right panel per vehicle with what
	 * it is hauling, how the route is going, its sensors and its fuel, and the
	 * order book underneath, so a planner can answer "where is that load" and
	 * "what is that truck doing" from one place.
	 *
	 * FMS owns telemetry, TMS owns orders. Nothing here is stored twice: the
	 * fleet comes from FMS through the console's proxy on the caller's own
	 * token, orders come from the business service, and a truck is joined to
	 * its order by master-data id (plate as the fallback until FMS publishes
	 * the id).
	 */
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, Truck, MapPin, X, Fuel, Gauge, Radio, Mountain, Battery, Activity, Bell, ZoomIn, Clock, ChevronDown, Filter, Download, FileText, Copy, AlertCircle, Scale } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { shipmentTypeLabel } from '$lib/revamp/shipmentType.js';
	import { computeUangSangu, computePostTripReconciliation } from '$lib/revamp/uangSangu.js';
	import { loadTripAllowance, tripAllowanceDefaults, type TripAllowanceSettings } from '$lib/revamp/tripAllowanceSettings';
	import { copyText } from '$lib/revamp/clipboard.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { MapView, type MapMarker } from '$lib/components/ui';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { formatNumber, formatCurrency } from '$lib/utils/format';
	import { TRUCK_MARKER } from '$lib/constants/assets';
	import {
		fetchLiveFleet, fetchLiveVehicle, fetchFuelEstimate, fetchSnappedTrip, fetchAlerts,
		truckIcon, plateKey, addressLine, curatedSensors, hasFix,
		STATE_LABEL, STATE_COLOUR, SEVERITY_COLOUR, LIVE_POLL_MS,
		type LiveVehicle, type SensorReading, type DriveState, type FuelEstimate, type SnappedTrip, type Alert
	} from '$lib/fms/live';

	let { basePath }: { basePath: string } = $props();

	// ------------------------------------------------------------------------
	// Client selector — FMS's way: one dropdown over the map, "MAST (3)".
	// For Karlo staff it lists every client and switches the whole console's
	// acting-for; a client's own user sees only their company.
	// ------------------------------------------------------------------------
	let isStaff = $derived($authStore.user?.isPlatformStaff ?? false);
	let clients = $state<{ id: string; name: string; role?: string; products?: string[]; vehicles?: number }[]>([]);

	async function loadClients() {
		if (!isStaff) return;
		try {
			const res = await api.get(ENDPOINTS.adminCompanies, { pageSize: 100 });
			const rows = (res.data?.data ?? []).filter((c: any) => c.role !== 'admin');
			clients = rows.map((c: any) => ({ id: c.id, name: c.name, role: c.role, products: c.products }));
			// Vehicle counts per client, one cheap paged call each — the
			// selector reads "BRT (165)" like FMS's does.
			await Promise.all(
				clients.map(async (c) => {
					try {
						const r = await api.get(`${ENDPOINTS.trucks.list}?pageSize=1`, undefined, { headers: { 'X-Acting-For': c.id } });
						c.vehicles = Number(r.data?.meta?.totalRows ?? 0);
					} catch {
						c.vehicles = undefined;
					}
				})
			);
			clients = [...clients];
		} catch {
			clients = [];
		}
	}

	function chooseClient(id: string) {
		const c = clients.find((x) => x.id === id);
		if (c) actingFor.set(c.id, c.name, c.role ?? '');
		else actingFor.clear();
		selectedVehicleId = null;
		selectedOrderId = '';
	}

	// ------------------------------------------------------------------------
	// The live fleet, from FMS, once a minute.
	// ------------------------------------------------------------------------
	let live = $state<LiveVehicle[]>([]);
	let liveError = $state('');
	let liveAt = $state<Date | null>(null);
	let liveTimer: ReturnType<typeof setInterval> | undefined;
	// Top bar clock (prototype 385e41e) — one shared 1 s tick.
	let clockTimer: ReturnType<typeof setInterval> | undefined;
	let nowMs = $state(Date.now());
	const pad2 = (n: number) => String(n).padStart(2, '0');
	let clockLabel = $derived.by(() => {
		const d = new Date(nowMs);
		return `${pad2(d.getHours())}.${pad2(d.getMinutes())}.${pad2(d.getSeconds())}`;
	});

	/**
	 * How long each truck has been in its current state. FMS's `state_since`
	 * when present; for offline, the staleness FMS already reports; otherwise
	 * the moment this page first saw the state — honest, if short, rather
	 * than a guess.
	 */
	const SHORT_STATE: Record<DriveState, string> = { moving: 'Bergerak', idle: 'Idle', parking: 'Parkir', offline: 'Offline' };
	const stateSeen = new Map<number, { state: DriveState; since: number }>();
	function noteStates(list: LiveVehicle[]) {
		const now = Date.now();
		for (const v of list) {
			const prev = stateSeen.get(v.vehicle_id);
			if (!prev || prev.state !== v.drive_state) stateSeen.set(v.vehicle_id, { state: v.drive_state, since: now });
		}
	}
	function stateDuration(v: LiveVehicle): string {
		let minutes: number | null = null;
		let approx = false;
		if (v.state_since) minutes = (nowMs - new Date(v.state_since).getTime()) / 60_000;
		else if (v.drive_state === 'offline' && v.stale_minutes != null) minutes = v.stale_minutes;
		else {
			const seen = stateSeen.get(v.vehicle_id);
			if (seen) {
				minutes = (nowMs - seen.since) / 60_000;
				approx = true;
			}
		}
		if (minutes == null || minutes < 0) return '—';
		const m = Math.round(minutes);
		const label = m < 60 ? `${m} menit` : m < 1440 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${Math.floor(m / 1440)} hari ${Math.floor((m % 1440) / 60)} jam`;
		return approx ? `≥ ${label}` : label;
	}

	async function refreshLive() {
		try {
			live = await fetchLiveFleet();
			noteStates(live);
			liveAt = new Date();
			liveError = '';
		} catch (e: any) {
			live = [];
			liveError = /403|404/.test(String(e?.message)) ? '' : 'Telemetri FMS tidak dapat dimuat.';
		}
	}

	onMount(() => {
		void orderActions.getAll({ page: 0, pageSize: 200 });
		void warehouseActions.getAll({ pageSize: 200 });
		void customerActions.getAll({ pageSize: 200 });
		void loadClients();
		void refreshLive();
		liveTimer = setInterval(() => void refreshLive(), LIVE_POLL_MS);
		clockTimer = setInterval(() => (nowMs = Date.now()), 1000);
	});
	onDestroy(() => {
		clearInterval(liveTimer);
		clearInterval(clockTimer);
	});

	let lastActing = $state<string | null>(null);
	$effect(() => {
		const id = $actingFor.companyId;
		if (lastActing !== null && id !== lastActing) {
			void refreshLive();
			void orderActions.getAll({ page: 0, pageSize: 200 });
		}
		lastActing = id;
	});

	let liveById = $derived(new Map(live.filter((v) => v.master_data_id).map((v) => [v.master_data_id as string, v])));
	let liveByPlate = $derived(new Map(live.map((v) => [plateKey(v.license_plate), v])));
	function liveFor(o: { truckId?: string; truckPoliceNumber?: string } | null | undefined): LiveVehicle | undefined {
		if (!o) return undefined;
		return (o.truckId && liveById.get(o.truckId)) || liveByPlate.get(plateKey(o.truckPoliceNumber));
	}

	// ------------------------------------------------------------------------
	// Order Control — the bottom panel. Same eight categories as the
	// prototype (ControlTowerView.vue), read off the console's own status
	// mapping (kontrakStatus → the prototype's status keys) so a truck shown
	// here as Planned is the one coloured Planned on the map.
	// ------------------------------------------------------------------------
	const PLANNED_STATUSES = new Set(['penugasan_pengemudi', 'pengemudi_ditugaskan', 'pengemudi_menerima_order']);
	const ONDUTY_STATUSES = new Set([
		'menuju_lokasi_muat', 'tiba_lokasi_muat', 'proses_muat_barang', 'verifikasi_pod_muat', 'pod_muat_terverifikasi',
		'menuju_lokasi_bongkar', 'tiba_lokasi_bongkar', 'proses_bongkar_muatan', 'verifikasi_pod_bongkar',
		'pod_bongkar_terverifikasi', 'menunggu_konfirmasi_pengiriman', 'pengiriman_terkonfirmasi'
	]);
	let tripAllowance = $state<TripAllowanceSettings>(tripAllowanceDefaults());
	onMount(() => {
		loadTripAllowance().then((r) => (tripAllowance = r.settings)).catch(() => {});
	});

	type Shipment = {
		key: string;
		raw: any;
		status: string;
		shipmentType: string;
		orderId: string;
		shipperName: string;
		muatKota: string;
		bongkarKota: string;
		plate: string;
		driver: string;
		statusLabel: string;
		statusBadgeClass: string;
		muatan: string;
		weightKg: number | null;
		pickupAt: Date | null;
		sanguFinal: boolean;
		reconPending: boolean;
	};
	let allOrders = $derived($orderStore.orders ?? []);
	/** Every assigned order, in the prototype's row shape. */
	let activeShipments = $derived.by<Shipment[]>(() =>
		allOrders
			.filter((o) => o.truckId && !['draft', 'submitted', 'cancelled', 'rejected', 'completed'].includes(o.statusCode ?? ''))
			.map((o: any) => {
				const d = o.detail ?? {};
				const status = kontrakStatus(o);
				const withStatus = { ...o, status };
				let reconPending = false;
				try {
					const us = computeUangSangu(withStatus, tripAllowance);
					const recon = computePostTripReconciliation(withStatus, tripAllowance, us.uangMakan.value);
					reconPending = !!recon && recon.status === 'belum_diproses';
				} catch {
					reconPending = false;
				}
				const loadingIds: string[] = d.loadingPoints ?? (o.originWarehouseId ? [o.originWarehouseId] : []);
				const unloadingIds: string[] = d.unloadingPoints ?? (o.destinationWarehouseId ? [o.destinationWarehouseId] : []);
				return {
					key: o.id,
					raw: o,
					status,
					shipmentType: shipmentTypeLabel({ detail: d, loadingPoints: loadingIds, unloadingPoints: unloadingIds }),
					orderId: o.orderNumber ?? o.id,
					shipperName: o.shipperCompanyName ?? d.shipperName ?? klien(o),
					muatKota: warehouse(loadingIds[0])?.city || o.originWarehouseName || '-',
					bongkarKota: warehouse(unloadingIds[unloadingIds.length - 1])?.city || o.destinationWarehouseName || '-',
					plate: o.truckPoliceNumber || liveFor(o)?.license_plate || '-',
					driver: o.driverName || liveFor(o)?.driver?.name || '-',
					statusLabel: statusLabel(status),
					statusBadgeClass: statusBadgeClass(status),
					muatan: d.muatan ?? o.cargoTypeName ?? '-',
					weightKg: o.weightKg != null ? Number(o.weightKg) : d.totalTonnage != null ? Number(d.totalTonnage) : null,
					pickupAt: o.pickupAt ? new Date(o.pickupAt) : null,
					sanguFinal: !!d.uangSanguFinalized,
					reconPending
				};
			})
	);
	const KPI_CARDS = [
		{ key: 'planned', label: 'Order Planned' },
		{ key: 'onduty', label: 'Order Single Shipment' },
		{ key: 'ltl', label: 'Order LTL' },
		{ key: 'multishipment', label: 'Order Multishipment' },
		{ key: 'podMuat', label: 'Verifikasi POD Muat' },
		{ key: 'podBongkar', label: 'Verifikasi POD Bongkar' },
		{ key: 'sangu', label: 'Finalisasi Uang Sangu' },
		{ key: 'recon', label: 'Finalisasi Rekonsiliasi' }
	] as const;
	type CategoryKey = (typeof KPI_CARDS)[number]['key'];
	let categorized = $derived.by<Record<CategoryKey, Shipment[]>>(() => {
		const list = activeShipments;
		return {
			planned: list.filter((s) => PLANNED_STATUSES.has(s.status)),
			onduty: list.filter((s) => ONDUTY_STATUSES.has(s.status) && s.shipmentType === 'Single Shipment'),
			ltl: list.filter((s) => !!s.raw.detail?.isLtl),
			multishipment: list.filter((s) => s.shipmentType === 'Multi Shipment'),
			podMuat: list.filter((s) => s.status === 'verifikasi_pod_muat'),
			podBongkar: list.filter((s) => s.status === 'verifikasi_pod_bongkar'),
			sangu: list.filter((s) => !s.sanguFinal),
			recon: list.filter((s) => s.reconPending)
		};
	});
	let ltlGroupCount = $derived(new Set(categorized.ltl.map((s) => s.raw.detail?.ltlGroupId).filter(Boolean)).size);
	let kpiCards = $derived(KPI_CARDS.map((c) => ({ ...c, count: c.key === 'ltl' ? ltlGroupCount : categorized[c.key].length })));
	let activeCategory = $state<CategoryKey | null>('onduty');
	function selectCategory(key: CategoryKey) {
		activeCategory = activeCategory === key ? null : key;
		selectedOrderId = '';
	}
	let activeCategoryOrders = $derived(activeCategory ? categorized[activeCategory] : []);
	/** What the map draws: the open tab's orders (unfiltered, as in the prototype). */
	let categoryOrders = $derived(activeCategoryOrders.map((s) => s.raw));

	// --- Advance Search (Filter) — narrows the open tab only ---------------
	let orderFilterOpen = $state(false);
	let orderSearchQuery = $state('');
	let orderStatusFilterKeys = $state<string[]>([]);
	let orderCustomerFilter = $state<string[]>([]);
	let orderCargoFilter = $state<string[]>([]);
	let orderMuatKotaFilter = $state<string[]>([]);
	let orderBongkarKotaFilter = $state<string[]>([]);
	let orderWeightMin = $state('');
	let orderWeightMax = $state('');
	let orderPickupDateFrom = $state('');
	let orderPickupDateTo = $state('');
	let orderPlateFilter = $state<string[]>([]);
	let orderDriverFilter = $state<string[]>([]);
	function distinctOptions(getValue: (s: Shipment) => string) {
		const seen = new Map<string, number>();
		for (const s of activeCategoryOrders) {
			const v = getValue(s);
			if (!v || v === '-') continue;
			seen.set(v, (seen.get(v) || 0) + 1);
		}
		return [...seen.entries()].map(([value, count]) => ({ value, label: `${value} (${count})` })).sort((a, b) => a.value.localeCompare(b.value));
	}
	let availableStatusOptions = $derived.by(() => {
		const seen = new Map<string, number>();
		for (const s of activeCategoryOrders) seen.set(s.status, (seen.get(s.status) || 0) + 1);
		return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, label: `${statusLabel(value)} (${count})` }));
	});
	let availableCustomerOptions = $derived(distinctOptions((s) => s.shipperName));
	let availableCargoOptions = $derived(distinctOptions((s) => s.muatan));
	let availableMuatKotaOptions = $derived(distinctOptions((s) => s.muatKota));
	let availableBongkarKotaOptions = $derived(distinctOptions((s) => s.bongkarKota));
	let availablePlateOptions = $derived(distinctOptions((s) => s.plate));
	let availableDriverOptions = $derived(distinctOptions((s) => s.driver));
	let orderFilterActiveCount = $derived(
		(orderSearchQuery.trim() ? 1 : 0) + orderStatusFilterKeys.length + orderCustomerFilter.length + orderCargoFilter.length +
			orderMuatKotaFilter.length + orderBongkarKotaFilter.length + (orderWeightMin !== '' ? 1 : 0) + (orderWeightMax !== '' ? 1 : 0) +
			(orderPickupDateFrom ? 1 : 0) + (orderPickupDateTo ? 1 : 0) + orderPlateFilter.length + orderDriverFilter.length
	);
	let orderFilterActive = $derived(orderFilterActiveCount > 0);
	let filteredCategoryOrders = $derived.by(() => {
		let list = activeCategoryOrders;
		const q = orderSearchQuery.trim().toLowerCase();
		if (q) list = list.filter((s) => s.orderId.toLowerCase().includes(q));
		if (orderStatusFilterKeys.length) list = list.filter((s) => orderStatusFilterKeys.includes(s.status));
		if (orderCustomerFilter.length) list = list.filter((s) => orderCustomerFilter.includes(s.shipperName));
		if (orderCargoFilter.length) list = list.filter((s) => orderCargoFilter.includes(s.muatan));
		if (orderMuatKotaFilter.length) list = list.filter((s) => orderMuatKotaFilter.includes(s.muatKota));
		if (orderBongkarKotaFilter.length) list = list.filter((s) => orderBongkarKotaFilter.includes(s.bongkarKota));
		if (orderWeightMin !== '') list = list.filter((s) => (s.weightKg ?? -Infinity) >= Number(orderWeightMin));
		if (orderWeightMax !== '') list = list.filter((s) => (s.weightKg ?? Infinity) <= Number(orderWeightMax));
		if (orderPickupDateFrom || orderPickupDateTo) {
			list = list.filter((s) => {
				if (!s.pickupAt) return false;
				if (orderPickupDateFrom && s.pickupAt < new Date(`${orderPickupDateFrom}T00:00:00`)) return false;
				if (orderPickupDateTo && s.pickupAt > new Date(`${orderPickupDateTo}T23:59:59`)) return false;
				return true;
			});
		}
		if (orderPlateFilter.length) list = list.filter((s) => orderPlateFilter.includes(s.plate));
		if (orderDriverFilter.length) list = list.filter((s) => orderDriverFilter.includes(s.driver));
		return list;
	});
	function resetOrderFilter() {
		orderSearchQuery = '';
		orderStatusFilterKeys = [];
		orderCustomerFilter = [];
		orderCargoFilter = [];
		orderMuatKotaFilter = [];
		orderBongkarKotaFilter = [];
		orderWeightMin = '';
		orderWeightMax = '';
		orderPickupDateFrom = '';
		orderPickupDateTo = '';
		orderPlateFilter = [];
		orderDriverFilter = [];
	}
	// "Saved filter" — this browser only, re-applied on the next visit.
	const ORDER_FILTER_STORAGE_KEY = 'ct-order-filter';
	let orderFilterSaveEnabled = $state(false);
	function filterSnapshot() {
		return {
			category: activeCategory, search: orderSearchQuery, status: orderStatusFilterKeys, customer: orderCustomerFilter, cargo: orderCargoFilter,
			muat: orderMuatKotaFilter, bongkar: orderBongkarKotaFilter, wmin: orderWeightMin, wmax: orderWeightMax, from: orderPickupDateFrom, to: orderPickupDateTo,
			plate: orderPlateFilter, driver: orderDriverFilter
		};
	}
	function onOrderFilterSaveToggle() {
		try {
			if (orderFilterSaveEnabled) localStorage.setItem(ORDER_FILTER_STORAGE_KEY, JSON.stringify(filterSnapshot()));
			else localStorage.removeItem(ORDER_FILTER_STORAGE_KEY);
		} catch {
			/* private mode */
		}
	}
	onMount(() => {
		try {
			const raw = localStorage.getItem(ORDER_FILTER_STORAGE_KEY);
			if (!raw) return;
			const f = JSON.parse(raw);
			orderFilterSaveEnabled = true;
			if (f.category) activeCategory = f.category;
			orderSearchQuery = f.search ?? ''; orderStatusFilterKeys = f.status ?? []; orderCustomerFilter = f.customer ?? []; orderCargoFilter = f.cargo ?? [];
			orderMuatKotaFilter = f.muat ?? []; orderBongkarKotaFilter = f.bongkar ?? []; orderWeightMin = f.wmin ?? ''; orderWeightMax = f.wmax ?? '';
			orderPickupDateFrom = f.from ?? ''; orderPickupDateTo = f.to ?? ''; orderPlateFilter = f.plate ?? []; orderDriverFilter = f.driver ?? [];
		} catch {
			/* ignore */
		}
	});
	$effect(() => {
		if (orderFilterSaveEnabled) {
			const snap = JSON.stringify(filterSnapshot());
			try { localStorage.setItem(ORDER_FILTER_STORAGE_KEY, snap); } catch { /* ignore */ }
		}
	});
	let lastCategoryForFilter = $state<CategoryKey | null>(null);
	$effect(() => {
		const c = activeCategory;
		if (lastCategoryForFilter !== null && c !== lastCategoryForFilter && !orderFilterSaveEnabled) resetOrderFilter();
		lastCategoryForFilter = c;
	});

	// --- LTL groups: one row per group, with a switcher through its orders ---
	let ltlFocusIndex = $state<Record<string, number>>({});
	let ltlGroupRows = $derived.by(() => {
		const groups: { groupKey: string; orders: Shipment[] }[] = [];
		const seen = new Set<string>();
		for (const s of filteredCategoryOrders) {
			const gid = s.raw.detail?.ltlGroupId || s.key;
			if (seen.has(gid)) continue;
			seen.add(gid);
			groups.push({ groupKey: gid, orders: categorized.ltl.filter((o) => (o.raw.detail?.ltlGroupId || o.key) === gid) });
		}
		return groups;
	});
	function ltlFocused(g: { groupKey: string; orders: Shipment[] }) {
		return g.orders[ltlFocusIndex[g.groupKey] || 0] || g.orders[0];
	}
	function ltlCycle(g: { groupKey: string; orders: Shipment[] }, dir: number) {
		const n = g.orders.length;
		const next = ((ltlFocusIndex[g.groupKey] || 0) + dir + n) % n;
		ltlFocusIndex = { ...ltlFocusIndex, [g.groupKey]: next };
		if (g.orders.some((o) => o.key === selectedOrderId)) selectedOrderId = g.orders[next].key;
	}
	let ocTabsEl = $state<HTMLDivElement | null>(null);
	function scrollOcTabsRight() {
		ocTabsEl?.scrollBy({ left: 220, behavior: 'smooth' });
	}

	// --- Export: pick rows, then CSV or PDF (print) -----------------------------
	let exportSelectMode = $state(false);
	let selectedExportKeys = $state<string[]>([]);
	let exportPrintRows = $state<Shipment[]>([]);
	function exportableRows(): Shipment[] {
		return activeCategory === 'ltl' ? ltlGroupRows.flatMap((g) => g.orders) : filteredCategoryOrders;
	}
	function startExportSelection() {
		exportSelectMode = true;
		selectedExportKeys = [];
	}
	function cancelExportSelection() {
		exportSelectMode = false;
		selectedExportKeys = [];
	}
	const isExportSelected = (key: string) => selectedExportKeys.includes(key);
	function toggleExportKey(key: string) {
		selectedExportKeys = isExportSelected(key) ? selectedExportKeys.filter((k) => k !== key) : [...selectedExportKeys, key];
	}
	function toggleGroupExportKeys(g: { orders: Shipment[] }) {
		const keys = g.orders.map((o) => o.key);
		const all = keys.every(isExportSelected);
		selectedExportKeys = all ? selectedExportKeys.filter((k) => !keys.includes(k)) : [...new Set([...selectedExportKeys, ...keys])];
	}
	let allExportSelected = $derived(exportableRows().length > 0 && exportableRows().every((s) => isExportSelected(s.key)));
	function toggleSelectAllExport() {
		selectedExportKeys = allExportSelected ? [] : exportableRows().map((s) => s.key);
	}
	const EXPORT_COLUMNS = ['Type Pengiriman', 'ID Order', 'Klien', 'Rute', 'Armada', 'Driver', 'Status', 'Jenis Muatan', 'Tonase Plan (Kg)', 'Pickup', 'Uang Sangu', 'Rekonsiliasi'];
	function exportRow(s: Shipment): string[] {
		return [
			s.shipmentType, s.orderId, s.shipperName, `${s.muatKota} → ${s.bongkarKota}`, s.plate, s.driver, s.statusLabel, s.muatan,
			s.weightKg != null ? String(s.weightKg) : '', s.pickupAt ? formatTimestampLabel(s.pickupAt) : '',
			s.sanguFinal ? 'Final' : 'Belum Finalisasi', s.reconPending ? 'Belum Diproses' : 'Sudah Diproses'
		];
	}
	function selectedExportRows(): Shipment[] | null {
		const rows = exportableRows().filter((s) => isExportSelected(s.key));
		if (!rows.length) {
			toast('Pilih minimal satu order untuk diekspor');
			return null;
		}
		return rows;
	}
	const csvField = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
	function exportOrdersCsv() {
		const rows = selectedExportRows();
		if (!rows) return;
		const lines = [EXPORT_COLUMNS.map(csvField).join(',')];
		for (const s of rows) lines.push(exportRow(s).map(csvField).join(','));
		const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `control-tower-${activeCategory}-${new Date().toISOString().slice(0, 10)}.csv`;
		a.rel = 'noopener';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(() => URL.revokeObjectURL(url), 1500);
		toast('Export CSV berhasil diunduh');
		cancelExportSelection();
	}
	function exportOrdersPdf() {
		const rows = selectedExportRows();
		if (!rows) return;
		exportPrintRows = rows;
		document.body.classList.add('ct-printing-export');
		const done = () => {
			document.body.classList.remove('ct-printing-export');
			window.removeEventListener('afterprint', done);
			cancelExportSelection();
		};
		window.addEventListener('afterprint', done);
		setTimeout(() => window.print(), 50);
	}
	async function copyOrderCode(s: Shipment) {
		await copyText(s.orderId);
		toast(`ID Order ${s.orderId} disalin`);
	}
	/** True when the order's truck is not reporting to FMS at all. */
	function noGps(s: Shipment): boolean {
		const v = liveFor(s.raw);
		return !v || !hasFix(v.position);
	}
	function openOrderDetail(s: Shipment) {
		goto(`${basePath.replace(/\/control-tower$/, '')}/order/${s.raw.id}`);
	}

	/** The order a truck is on right now: the live one first, else the most recently assigned. */
	const ACTIVE: string[] = ['inTransit', 'assigned', 'delivered', 'approved', 'readyToPlan'];
	function orderFor(v: LiveVehicle | null): any | null {
		if (!v) return null;
		const mine = allOrders.filter((o) => liveFor(o)?.vehicle_id === v.vehicle_id);
		return mine.sort((a, b) => ACTIVE.indexOf(a.statusCode ?? '') - ACTIVE.indexOf(b.statusCode ?? ''))[0] ?? null;
	}

	function warehouse(id?: string): any {
		if (!id) return null;
		return ($warehouseStore.warehouses ?? []).find((w: any) => w.id === id) ?? null;
	}
	function coordsOf(id?: string): [number, number] | null {
		const w = warehouse(id);
		if (!w) return null;
		if (typeof w.longitude === 'number' && typeof w.latitude === 'number') return [w.longitude, w.latitude];
		const c = w.location?.coordinates;
		return Array.isArray(c) && c.length === 2 ? [c[0], c[1]] : null;
	}
	function klien(o: any): string {
		const found = ($customerStore.customers ?? []).find((c: any) => c.id === o.customerId);
		return found?.name ?? o.customerName ?? '—';
	}
	function routeLabel(o: any): string {
		const from = o.originWarehouseName || warehouse(o.originWarehouseId)?.city || '?';
		const to = o.destinationWarehouseName || warehouse(o.destinationWarehouseId)?.city || '?';
		return `${from} → ${to}`;
	}
	function kindLabel(o: any): string {
		return ({ standard: 'Single Shipment', threepl: '3PL', empty: 'Empty', ltl: 'LTL', multi: 'Multishipment' } as Record<string, string>)[o.orderKind ?? 'standard'] ?? 'Single Shipment';
	}

	// ------------------------------------------------------------------------
	// Selection: a vehicle (from the list, the map or an order row).
	// ------------------------------------------------------------------------
	let selectedVehicleId = $state<number | null>(null);
	let selectedOrderId = $state('');
	let selectedVehicle = $derived(live.find((v) => v.vehicle_id === selectedVehicleId) ?? null);
	let selectedOrder = $derived(
		(selectedOrderId && allOrders.find((o) => o.id === selectedOrderId)) || orderFor(selectedVehicle)
	);
	let flyTo = $state<[number, number] | null>(null);
	let tab = $state<'monitoring' | 'notifikasi'>('monitoring');

	function selectVehicle(v: LiveVehicle) {
		selectedVehicleId = v.vehicle_id;
		selectedOrderId = '';
		if (hasFix(v.position)) flyTo = [v.position.lon, v.position.lat];
	}
	function selectOrderRow(o: any) {
		selectedOrderId = o.id;
		const v = liveFor(o);
		selectedVehicleId = v?.vehicle_id ?? null;
		if (v && hasFix(v.position)) flyTo = [v.position.lon, v.position.lat];
		else toast('Truck ini tidak mengirim posisi GPS — tidak ada yang bisa ditampilkan di peta');
	}
	function clearSelection() {
		selectedVehicleId = null;
		selectedOrderId = '';
	}

	// Per-vehicle detail: sensors from FMS, shipment from the business service.
	let detail = $state<LiveVehicle | null>(null);
	let sensors = $state<SensorReading[]>([]);
	let shipment = $state<any | null>(null);
	$effect(() => {
		const v = selectedVehicle;
		detail = null;
		sensors = [];
		if (!v) return;
		fetchLiveVehicle(v.vehicle_id).then((full) => {
			if (full && selectedVehicleId === v.vehicle_id) {
				detail = full;
				sensors = curatedSensors(full.position?.metadata);
			}
		}).catch(() => {});
	});
	$effect(() => {
		const o = selectedOrder;
		shipment = null;
		if (!o?.id) return;
		api.get(ENDPOINTS.orders.shipment(o.id)).then((r) => {
			if (selectedOrder?.id === o.id) shipment = r.data?.data ?? null;
		}).catch(() => {});
	});

	// Fuel estimate (30 days), the actual route for the order's window, and
	// the vehicle's alerts. Each is its own request and its own failure: a
	// missing fuel figure must not blank the route.
	let fuel = $state<FuelEstimate | null>(null);
	let trip = $state<SnappedTrip | null>(null);
	let alerts = $state<Alert[]>([]);
	let tripWindow = $derived.by<{ from: Date; to: Date } | null>(() => {
		const o = selectedOrder;
		const now = new Date();
		if (o?.pickupAt) {
			const from = new Date(o.pickupAt);
			const end = o.statusCode === 'completed' || o.statusCode === 'delivered' ? new Date(o.updatedAt ?? now) : now;
			// Keep the window to days, not weeks — FMS caps nothing server-side.
			const to = new Date(Math.min(end.getTime(), from.getTime() + 7 * 86_400_000));
			return from < to ? { from, to } : null;
		}
		// No order: today's driving.
		return { from: new Date(now.getTime() - 24 * 3_600_000), to: now };
	});
	$effect(() => {
		const v = selectedVehicle;
		fuel = null;
		alerts = [];
		if (!v) return;
		fetchFuelEstimate(v.vehicle_id).then((f) => { if (selectedVehicleId === v.vehicle_id) fuel = f; }).catch(() => {});
		const w = tripWindow;
		if (w) fetchAlerts(v.vehicle_id, w.from, w.to).then((a) => { if (selectedVehicleId === v.vehicle_id) alerts = a; }).catch(() => {});
	});
	$effect(() => {
		const v = selectedVehicle;
		const w = tripWindow;
		trip = null;
		if (!v || !w) return;
		fetchSnappedTrip(v.vehicle_id, w.from, w.to).then((t) => { if (selectedVehicleId === v.vehicle_id) trip = t; }).catch(() => {});
	});

	function sensorValue(label: string): string | undefined {
		return sensors.find((s) => s.label === label)?.value;
	}
	let fuelLevel = $derived(sensors.find((s) => s.label.startsWith('Bahan bakar'))?.value);

	// ------------------------------------------------------------------------
	// Vehicle list — FMS's: search plate or driver, state dot, location, speed.
	// ------------------------------------------------------------------------
	let search = $state('');
	let stateFilter = $state<DriveState | ''>('');
	const ORDER: DriveState[] = ['moving', 'idle', 'parking', 'offline'];
	let listed = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return live
			.filter((v) => !stateFilter || v.drive_state === stateFilter)
			.filter((v) => !q || v.license_plate.toLowerCase().includes(q) || (v.driver?.name ?? '').toLowerCase().includes(q))
			.sort((a, b) => ORDER.indexOf(a.drive_state) - ORDER.indexOf(b.drive_state) || a.license_plate.localeCompare(b.license_plate));
	});
	let fleetSummary = $derived.by(() => {
		const n: Record<DriveState, number> = { moving: 0, idle: 0, parking: 0, offline: 0 };
		for (const v of live) n[v.drive_state]++;
		return n;
	});
	function where(v: LiveVehicle): string {
		const p = v.position;
		return p?.kota || p?.kabupaten || p?.kecamatan || p?.address || '—';
	}

	// ------------------------------------------------------------------------
	// Markers: every truck with a fix; the selected one larger. Trucks with no
	// FMS position but an order in view sit at the order's warehouse.
	// ------------------------------------------------------------------------
	let markers = $derived.by<MapMarker[]>(() => {
		const out: MapMarker[] = [];
		for (const v of listed) {
			if (!hasFix(v.position)) continue;
			const sel = v.vehicle_id === selectedVehicleId;
			out.push({
				id: `v-${v.vehicle_id}`,
				lng: v.position.lon,
				lat: v.position.lat,
				icon: truckIcon(v.drive_state),
				iconWidth: sel ? 28 : 18,
				iconHeight: sel ? 56 : 36,
				heading: v.position.bearing ?? 0,
				title: v.license_plate,
				subtitle: `${STATE_LABEL[v.drive_state]}${v.position.speed != null ? ` · ${Math.round(v.position.speed)} km/j` : ''}${v.driver?.name ? ` · ${v.driver.name}` : ''}`
			});
		}
		// A truck with no GPS fix is not guessed onto the map (it used to be
		// drawn at the warehouse, which reads as a position). It is flagged in
		// the order table instead — see noGps().
		return out;
	});

	/** The selected order's lane, straight — the planned geometry needs the routes endpoint. */
	let lines = $derived.by(() => {
		const out: { id: string; coordinates: [number, number][]; dashed?: boolean; color?: string; width?: number }[] = [];
		const o = selectedOrder;
		if (o) {
			const a = coordsOf(o.originWarehouseId);
			const b = coordsOf(o.destinationWarehouseId);
			if (a && b) out.push({ id: `plan-${o.id}`, coordinates: [a, b], dashed: true, color: '#0B57D0' });
		}
		if (trip && trip.points.length > 1) {
			out.push({ id: `actual-${selectedVehicleId}`, coordinates: trip.points, color: '#dc2626', width: 3 });
		}
		return out;
	});

	let needsClient = $derived(isStaff && !$actingFor.companyId);
	let num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
</script>

<div class="ct2">
	<!-- Toolbar: client (FMS-style), search, legend -->
	<div class="ct2-toolbar">
		{#if isStaff}
			<select class="ct2-client" value={$actingFor.companyId} onchange={(e) => chooseClient((e.target as HTMLSelectElement).value)}>
				<option value="">Pilih klien…</option>
				{#each clients as c (c.id)}
					<option value={c.id}>{c.name}{c.vehicles !== undefined ? ` (${c.vehicles})` : ''}</option>
				{/each}
			</select>
		{:else}
			<span class="ct2-client ct2-client--fixed">{$authStore.user?.companyName ?? 'Armada'} ({live.length})</span>
		{/if}
		<div class="ct2-search">
			<Search size={14} />
			<input placeholder="Cari nomor polisi atau pengemudi" bind:value={search} />
		</div>
		<div class="ct2-legend">
			{#each ORDER as s}
				<button type="button" class="ct2-legend-item {stateFilter === s ? 'active' : ''}" onclick={() => (stateFilter = stateFilter === s ? '' : s)}>
					<span class="ct2-dot" style="background:{STATE_COLOUR[s]}"></span>{STATE_LABEL[s]} <b>{fleetSummary[s]}</b>
				</button>
			{/each}
		</div>
		<span class="hint" style="margin-left:auto;">
			{#if liveAt}GPS dari FMS · {liveAt.toLocaleTimeString('id-ID')}{:else if liveError}{liveError}{/if}
		</span>
		<span class="ct-topbar-clock"><Clock size={13} /> {clockLabel}</span>
	</div>

	<div class="ct2-main">
		<!-- Vehicle list -->
		<aside class="ct2-list">
			<div class="ct-truck-sidebar-head">Armada ({listed.length})</div>
			{#if needsClient}
				<div class="ct2-empty">Pilih klien untuk melihat armadanya.</div>
			{:else if live.length === 0}
				<div class="ct2-empty">{liveError || 'Perusahaan ini belum terhubung ke FMS.'}</div>
			{:else if listed.length === 0}
				<div class="ct2-empty">Tidak ada armada yang cocok.</div>
			{:else}
				{#each listed as v (v.vehicle_id)}
					{@const o = orderFor(v)}
					<button type="button" class="ct2-vehicle {v.vehicle_id === selectedVehicleId ? 'active' : ''}" onclick={() => selectVehicle(v)}>
						<span class="ct2-dot" style="background:{STATE_COLOUR[v.drive_state]}"></span>
						<span class="ct2-vehicle-main">
							<b>{v.license_plate}</b>
							<small>{v.driver?.name ?? '—'} · {where(v)}</small>
							{#if o}<small class="ct2-vehicle-order">{o.orderNumber} · {klien(o)}</small>{/if}
						</span>
						<span class="ct-truck-sidebar-movement" style="color:{STATE_COLOUR[v.drive_state]}" title="{Math.round(v.position?.speed ?? 0)} km/j">
							<b>{SHORT_STATE[v.drive_state]}</b>
							<span>{stateDuration(v)}</span>
						</span>
					</button>
				{/each}
			{/if}
		</aside>

		<!-- Map -->
		<div class="ct2-map">
			<MapView {markers} {lines} {flyTo} fitToMarkers={!selectedVehicleId && markers.length > 0} class="ct-map-canvas" />
		</div>

		<!-- Right panel: the selected vehicle -->
		{#if selectedVehicle}
			{@const v = detail ?? selectedVehicle}
			{@const o = selectedOrder}
			{@const pos = v.position}
			<aside class="ct2-panel">
				<div class="ct2-panel-head">
					<div>
						<h3>{o ? `${o.orderNumber} · ${klien(o)}` : v.license_plate}</h3>
						<div class="ct2-panel-sub"><Truck size={14} /> <b>{v.license_plate}</b> <span>{v.driver?.name ?? 'Pengemudi belum ditetapkan'}</span></div>
					</div>
					<div class="ct2-panel-actions">
						{#if o}<button type="button" class="mini-icon-btn" title="Detail order" onclick={() => goto(`${basePath.replace('/control-tower', '')}/order/${o.id}`)}><ZoomIn size={14} /></button>{/if}
						<button type="button" class="mini-icon-btn" title="Tutup" onclick={clearSelection}><X size={14} /></button>
					</div>
				</div>
				<div class="ct2-tabs">
					<button type="button" class:active={tab === 'monitoring'} onclick={() => (tab = 'monitoring')}>Monitoring</button>
					<button type="button" class:active={tab === 'notifikasi'} onclick={() => (tab = 'notifikasi')}>Notifikasi</button>
				</div>

				{#if tab === 'monitoring'}
					<!-- Detail Muatan: TMS order (plan) and its shipment (actual) -->
					<section class="ct2-card">
						<header><span>Detail Muatan</span><small>{o?.detail?.itemName ?? o?.detail?.commodity ?? (o ? kindLabel(o) : 'Tidak ada order aktif')}</small></header>
						{#if o}
							<table class="ct2-table">
								<thead><tr><th></th><th>Plan</th><th>Muat</th><th>Bongkar</th></tr></thead>
								<tbody>
									<tr><td>Tonase (Kg)</td><td>{formatNumber(num(o.weightKg))}</td><td>{formatNumber(num(shipment?.loadedWeightKg ?? shipment?.weight))}</td><td>{formatNumber(num(shipment?.unloadedWeightKg))}</td></tr>
									<tr><td>Qty (Pcs)</td><td>{formatNumber(num(o.quantity))}</td><td>{formatNumber(num(shipment?.loadedQuantity))}</td><td>{formatNumber(num(shipment?.unloadedQuantity))}</td></tr>
									<tr><td>Volume (m³)</td><td>{formatNumber(num(o.detail?.volumeM3 ?? o.detail?.volume))}</td><td>{formatNumber(num(shipment?.volume))}</td><td>—</td></tr>
								</tbody>
							</table>
						{:else}
							<div class="ct2-card-empty">Truk ini tidak sedang membawa order TMS.</div>
						{/if}
					</section>

					<!-- Rute Perjalanan: plan from TMS; actual from FMS trip history when available -->
					<section class="ct2-card">
						<header><span>Rute Perjalanan</span>{#if o}<small>{routeLabel(o)}</small>{/if}</header>
						{#if o}
							<table class="ct2-table">
								<thead><tr><th></th><th>Plan</th><th>Aktual</th></tr></thead>
								<tbody>
									<tr><td>Jarak</td><td>{o.detail?.distanceKm ? `${formatNumber(num(o.detail.distanceKm))} km` : '—'}</td><td>{trip?.distance_km != null ? `${formatNumber(Math.round(trip.distance_km * 10) / 10)} km` : '—'}</td></tr>
									<tr><td>ETA</td><td>{o.deliveryAt ? new Date(o.deliveryAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td>{o.statusCode === 'delivered' || o.statusCode === 'completed' ? new Date(o.updatedAt ?? '').toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'dalam perjalanan'}</td></tr>
								</tbody>
							</table>
							{#if trip}
								<small class="hint">
									Jalur aktual (merah) dari GPS FMS, {tripWindow ? `${tripWindow.from.toLocaleDateString('id-ID')} – ${tripWindow.to.toLocaleDateString('id-ID')}` : ''}{#if trip.chunks_total && trip.chunks_matched !== undefined && trip.chunks_matched < trip.chunks_total}; {trip.chunks_total - trip.chunks_matched} bagian tak terpetakan ke jalan{/if}.
								</small>
							{/if}
						{:else}
							<div class="ct2-card-empty">{addressLine(pos) || 'Posisi belum diketahui.'}</div>
						{/if}
					</section>

					<!-- Sensors & Telemetry: FMS -->
					<section class="ct2-card">
						<header><span>Sensors &amp; Telemetry</span><small>{pos?.time ? new Date(pos.time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : ''}</small></header>
						<div class="ct-telemetry-grid">
							<div class="ct-telemetry-tile {v.online ? 'good' : 'warn'}"><Battery size={14} /><span class="ct-telemetry-value">{v.battery_v != null ? `${v.battery_v.toFixed(1)} V` : sensorValue('Tegangan Eksternal') ?? '—'}</span><small>Battery</small></div>
							<div class="ct-telemetry-tile"><Gauge size={14} /><span class="ct-telemetry-value">{Math.round(pos?.speed ?? 0)} km/h</span><small>Speed</small></div>
							<div class="ct-telemetry-tile"><Activity size={14} /><span class="ct-telemetry-value" style="color:{STATE_COLOUR[v.drive_state]}">{STATE_LABEL[v.drive_state]}</span><small>Movement</small></div>
							<div class="ct-telemetry-tile"><Radio size={14} /><span class="ct-telemetry-value">{v.gsm_signal != null ? `${v.gsm_signal}/5` : sensorValue('Sinyal GSM') ?? '—'}</span><small>GSM signal</small></div>
							<div class="ct-telemetry-tile"><Fuel size={14} /><span class="ct-telemetry-value">{fuelLevel ?? '—'}</span><small>Fuel level</small></div>
							<div class="ct-telemetry-tile"><Mountain size={14} /><span class="ct-telemetry-value">{sensorValue('Ketinggian') ?? '—'}</span><small>Altitude</small></div>
						</div>
						{#if sensors.length > 0}
							<details class="ct2-more"><summary>Semua sensor ({sensors.length})</summary>
								<div class="ct-telemetry-grid" style="margin-top:8px;">
									{#each sensors as r}<div class="ct-telemetry-row"><span>{r.label}</span><b>{r.value}</b></div>{/each}
								</div>
							</details>
						{/if}
						{#if addressLine(pos)}<div class="ct2-address"><MapPin size={12} /> {addressLine(pos)}</div>{/if}
					</section>

					<!-- Fuel Consumption: FMS, when its endpoint is wired -->
					<section class="ct2-card">
						<header><span>Fuel Consumption</span><small>estimasi FMS · {fuel?.days ?? 30} hari</small></header>
						{#if fuel && fuel.litres != null}
							<div class="ct2-fuel">
								<div><small>Fuel used</small><b>{formatNumber(Math.round(fuel.litres))} L</b></div>
								<div><small>Est. cost</small><b>{fuel.cost != null ? formatCurrency(fuel.cost) : '—'}</b></div>
								<div><small>Efficiency</small><b>{fuel.kmpl != null ? `${fuel.kmpl} km/L` : '—'}</b></div>
								<div><small>Distance</small><b>{fuel.distance_km != null ? `${formatNumber(Math.round(fuel.distance_km))} km` : '—'}</b></div>
								<div><small>Rp / km</small><b>{fuel.rp_per_km != null ? formatCurrency(Math.round(fuel.rp_per_km)) : '—'}</b></div>
								<div><small>Idle cost</small><b>{fuel.idle_cost != null ? formatCurrency(fuel.idle_cost) : '—'}{#if fuel.idle_hours != null}<span class="hint"> · {fuel.idle_hours.toFixed(1)} j idle</span>{/if}</b></div>
							</div>
							<small class="hint">Dihitung dari jarak ÷ km/L yang dikonfigurasi di FMS, bukan dari sensor.</small>
						{:else if fuel}
							<div class="ct2-card-empty">Belum ada km/L atau kapasitas tangki untuk truk ini di FMS, jadi belum bisa diestimasi{fuel.distance_km != null ? ` (jarak ${formatNumber(Math.round(fuel.distance_km))} km)` : ''}.</div>
						{:else}
							<div class="ct2-card-empty">Memuat…</div>
						{/if}
					</section>
				{:else}
					<section class="ct2-card">
						<header><span><Bell size={13} /> Notifikasi</span><small>{alerts.length} peringatan{tripWindow ? ` · ${tripWindow.from.toLocaleDateString('id-ID')} – ${tripWindow.to.toLocaleDateString('id-ID')}` : ''}</small></header>
						{#if alerts.length === 0}
							<div class="ct2-card-empty">Tidak ada peringatan FMS untuk truk ini pada rentang ini.</div>
						{:else}
							<div class="ct2-alerts">
								{#each alerts as a (a.id)}
									<div class="ct2-alert-row">
										<span class="ct2-dot" style="background:{SEVERITY_COLOUR[a.severity] ?? '#94a3b8'}"></span>
										<div>
											<b>{a.alert_name}</b>
											{#if a.actual_value != null}<span class="hint"> · {a.actual_value}{a.limit_value != null ? ` / ${a.limit_value}` : ''}</span>{/if}
											<small>{new Date(a.occurred_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}{a.address ? ` · ${a.address}` : ''}{a.check_status && a.check_status !== 'unchecked' ? ` · ${a.check_status === 'checked' ? 'diperiksa' : 'alarm palsu'}` : ''}</small>
											{#if a.media_url}<a href={a.media_url} target="_blank" rel="noopener" class="ct2-clip">Lihat rekaman</a>{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</section>
				{/if}
			</aside>
		{/if}
	</div>

	<!-- Order Control -->
	<div class="ct2-orders ct-oc-panel">
		<div class="ct-oc-head">
			<div class="ct-oc-tabs-row">
				<div bind:this={ocTabsEl} class="method-tabs ct-oc-tabs">
					{#each kpiCards as c (c.key)}
						<button type="button" class="method-tab" class:active={activeCategory === c.key} onclick={() => selectCategory(c.key)}>
							{c.label} ({c.count})
						</button>
					{/each}
				</div>
				<div class="ct-oc-tabs-actions">
					<button type="button" class="ct-oc-tabs-scroll" title="Geser tab ke kanan" onclick={scrollOcTabsRight}><ChevronDown size={12} /></button>
					{#if !exportSelectMode}
						<button type="button" class="btn btn-outline btn-sm ct-oc-export-btn" class:ct-oc-filter-btn--active={orderFilterActive} title="Advance Search" onclick={() => (orderFilterOpen = true)}>
							<Filter size={14} /><span>Filter</span>
							{#if orderFilterActive}<span class="ct-oc-filter-badge">{orderFilterActiveCount}</span>{/if}
						</button>
						<button type="button" class="btn btn-outline btn-sm ct-oc-export-btn" title="Pilih order untuk diekspor" onclick={startExportSelection}>
							<Download size={14} /><span>Export</span>
						</button>
					{:else}
						<span class="ct-export-count">{selectedExportKeys.length} dipilih</span>
						<button type="button" class="btn btn-outline btn-sm ct-oc-export-btn" onclick={exportOrdersCsv}><Download size={14} /><span>CSV</span></button>
						<button type="button" class="btn btn-outline btn-sm ct-oc-export-btn" onclick={exportOrdersPdf}><FileText size={14} /><span>PDF</span></button>
						<button type="button" class="mini-icon-btn" title="Batal" onclick={cancelExportSelection}><X size={14} /></button>
					{/if}
				</div>
			</div>
		</div>
		<div class="ct-oc-scroll">
			{#if needsClient}
				<div class="ct-oc-empty">Pilih klien untuk melihat order mereka.</div>
			{:else if !activeCategory}
				<div class="ct-oc-empty">Pilih salah satu tab di atas untuk melihat daftar order-nya.</div>
			{:else}
				<table class="planner-table ct-oc-table">
					<thead>
						<tr>
							{#if exportSelectMode}<th class="ct-oc-checkbox-cell"><input type="checkbox" checked={allExportSelected} onchange={toggleSelectAllExport} /></th>{/if}
							<th>Type Pengiriman</th><th>ID Order</th><th>Klien</th><th>Rute</th><th>Armada</th><th>Status</th><th>Kontrol</th>
						</tr>
					</thead>
					<tbody>
						{#if activeCategory === 'ltl'}
							{#if !ltlGroupRows.length}
								<tr><td colspan={exportSelectMode ? 8 : 7}><div class="ct-oc-empty">{orderFilterActive ? 'Tidak ada order yang cocok dengan filter.' : 'Tidak ada order pada kategori ini.'}</div></td></tr>
							{/if}
							{#each ltlGroupRows as g (g.groupKey)}
								{@const f = ltlFocused(g)}
								<tr class="planner-row" class:planner-row-selected={g.orders.some((o) => o.key === selectedOrderId)} onclick={() => selectOrderRow(f.raw)}>
									{#if exportSelectMode}
										<td class="ct-oc-checkbox-cell" onclick={(e) => e.stopPropagation()} role="presentation"><input type="checkbox" checked={g.orders.every((o) => isExportSelected(o.key))} onchange={() => toggleGroupExportKeys(g)} /></td>
									{/if}
									<td><span class="badge badge-active">LTL</span></td>
									<td>
										<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
										<div class="ct-oc-switcher" onclick={(e) => e.stopPropagation()}>
											<button type="button" class="ct-oc-switcher-btn" disabled={g.orders.length < 2} onclick={() => ltlCycle(g, -1)}>‹</button>
											<b class="mono">{f.orderId}</b>
											<button type="button" class="ct-oc-switcher-btn" disabled={g.orders.length < 2} onclick={() => ltlCycle(g, 1)}>›</button>
										</div>
									</td>
									<td>{f.shipperName}</td>
									<td>{f.muatKota} → {f.bongkarKota}</td>
									<td><span class="plate mono">{f.plate}</span> · {f.driver}{#if noGps(f)}<div class="ct-oc-extra ct-oc-extra--warn" title="Truck tidak mengirim posisi GPS ke FMS"><AlertCircle size={10} />Tanpa sinyal GPS</div>{/if}</td>
									<td><span class="badge {f.statusBadgeClass}">{f.statusLabel}</span></td>
									<td>
										<div class="action-cell">
											<button class="mini-icon-btn" title="Lihat detail" onclick={(e) => { e.stopPropagation(); openOrderDetail(f); }}><Search size={14} /></button>
											<button class="mini-icon-btn" title="Lihat di peta" onclick={(e) => { e.stopPropagation(); selectOrderRow(f.raw); }}><ZoomIn size={14} /></button>
											<button class="mini-icon-btn" title="Salin ID order" onclick={(e) => { e.stopPropagation(); copyOrderCode(f); }}><Copy size={14} /></button>
										</div>
									</td>
								</tr>
							{/each}
						{:else}
							{#if !filteredCategoryOrders.length}
								<tr><td colspan={exportSelectMode ? 8 : 7}><div class="ct-oc-empty">{orderFilterActive ? 'Tidak ada order yang cocok dengan filter.' : 'Tidak ada order pada kategori ini.'}</div></td></tr>
							{/if}
							{#each filteredCategoryOrders as s (s.key)}
								<tr class="planner-row" class:planner-row-selected={selectedOrderId === s.key} onclick={() => selectOrderRow(s.raw)}>
									{#if exportSelectMode}
										<td class="ct-oc-checkbox-cell" onclick={(e) => e.stopPropagation()} role="presentation"><input type="checkbox" checked={isExportSelected(s.key)} onchange={() => toggleExportKey(s.key)} /></td>
									{/if}
									<td><span class="badge badge-active">{s.shipmentType}</span></td>
									<td><b class="mono">{s.orderId}</b></td>
									<td>{s.shipperName}</td>
									<td>{s.muatKota} → {s.bongkarKota}</td>
									<td><span class="plate mono">{s.plate}</span> · {s.driver}{#if noGps(s)}<div class="ct-oc-extra ct-oc-extra--warn" title="Truck tidak mengirim posisi GPS ke FMS"><AlertCircle size={10} />Tanpa sinyal GPS</div>{/if}</td>
									<td>
										<span class="badge {s.statusBadgeClass}">{s.statusLabel}</span>
										{#if activeCategory === 'sangu'}<div class="ct-oc-extra"><AlertCircle size={10} />Belum Finalisasi</div>{/if}
										{#if activeCategory === 'recon'}<div class="ct-oc-extra"><Scale size={10} />Belum Diproses</div>{/if}
									</td>
									<td>
										<div class="action-cell">
											<button class="mini-icon-btn" title="Lihat detail" onclick={(e) => { e.stopPropagation(); openOrderDetail(s); }}><Search size={14} /></button>
											<button class="mini-icon-btn" title="Lihat di peta" onclick={(e) => { e.stopPropagation(); selectOrderRow(s.raw); }}><ZoomIn size={14} /></button>
											<button class="mini-icon-btn" title="Salin ID order" onclick={(e) => { e.stopPropagation(); copyOrderCode(s); }}><Copy size={14} /></button>
										</div>
									</td>
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>

<!-- Advance Search -->
{#if orderFilterOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) orderFilterOpen = false; }}>
		<div class="modal-box modal-box-lg ct-filter-modal" role="dialog" aria-modal="true">
			<div class="ct-filter-modal-head">
				<h3>Advance Search</h3>
				<button type="button" class="mini-icon-btn" title="Tutup" onclick={() => (orderFilterOpen = false)}><X size={14} /></button>
			</div>
			<div class="modal-scroll-body">
				<fieldset class="ct-filter-section">
					<legend>Order</legend>
					<div class="three-col">
						<div class="field" style="margin-bottom:0;">
							<label for="ctf-id">ID Order</label>
							<div class="ct-oc-filter-search ct-oc-filter-search--pill"><Search size={13} /><input id="ctf-id" type="text" bind:value={orderSearchQuery} placeholder="Contoh: ORM26080101..." /></div>
						</div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-status">Status</label><FieldSelect bind:value={orderStatusFilterKeys} options={availableStatusOptions} multiple chipsBelow placeholder="Semua Status" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-klien">Klien</label><FieldSelect bind:value={orderCustomerFilter} options={availableCustomerOptions} multiple searchable chipsBelow placeholder="Semua Klien" /></div>
					</div>
				</fieldset>
				<fieldset class="ct-filter-section">
					<legend>Muatan</legend>
					<div class="three-col">
						<div class="field" style="margin-bottom:0;"><label for="ctf-cargo">Jenis Muatan</label><FieldSelect bind:value={orderCargoFilter} options={availableCargoOptions} multiple searchable chipsBelow placeholder="Semua Jenis Muatan" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-wmin">Tonase Min (Kg)</label><input id="ctf-wmin" type="number" min="0" class="ct-filter-plain-input" bind:value={orderWeightMin} placeholder="0" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-wmax">Tonase Max (Kg)</label><input id="ctf-wmax" type="number" min="0" class="ct-filter-plain-input" bind:value={orderWeightMax} placeholder="Tidak terbatas" /></div>
					</div>
				</fieldset>
				<fieldset class="ct-filter-section">
					<legend>Rute &amp; Jadwal</legend>
					<div class="four-col">
						<div class="field" style="margin-bottom:0;"><label for="ctf-muat">Kota Muat</label><FieldSelect bind:value={orderMuatKotaFilter} options={availableMuatKotaOptions} multiple searchable chipsBelow placeholder="Semua Kota" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-bongkar">Kota Bongkar</label><FieldSelect bind:value={orderBongkarKotaFilter} options={availableBongkarKotaOptions} multiple searchable chipsBelow placeholder="Semua Kota" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-from">Pickup Dari</label><input id="ctf-from" type="date" class="ct-filter-plain-input" bind:value={orderPickupDateFrom} /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-to">Pickup Sampai</label><input id="ctf-to" type="date" class="ct-filter-plain-input" bind:value={orderPickupDateTo} /></div>
					</div>
				</fieldset>
				<fieldset class="ct-filter-section">
					<legend>Armada</legend>
					<div class="two-col">
						<div class="field" style="margin-bottom:0;"><label for="ctf-plate">Plat Nomor</label><FieldSelect bind:value={orderPlateFilter} options={availablePlateOptions} multiple searchable chipsBelow placeholder="Semua Armada" /></div>
						<div class="field" style="margin-bottom:0;"><label for="ctf-driver">Driver</label><FieldSelect bind:value={orderDriverFilter} options={availableDriverOptions} multiple searchable chipsBelow placeholder="Semua Driver" /></div>
					</div>
				</fieldset>
			</div>
			<div class="modal-actions ct-filter-modal-actions">
				<label class="ct-filter-saved-toggle" title="Simpan filter ini sebagai default, otomatis diterapkan lagi tiap Control Tower dibuka">
					<span class="ct-filter-saved-toggle-switch">
						<input type="checkbox" bind:checked={orderFilterSaveEnabled} onchange={onOrderFilterSaveToggle} />
						<span class="ct-filter-saved-toggle-track"><span class="ct-filter-saved-toggle-thumb"></span></span>
					</span>
					<span>Saved filter</span>
				</label>
				<div class="ct-filter-modal-actions-buttons">
					<button type="button" class="btn btn-outline" disabled={!orderFilterActive} onclick={resetOrderFilter}>Clear</button>
					<button type="button" class="btn btn-primary" onclick={() => (orderFilterOpen = false)}>Search</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Printable export (PDF) -->
<div class="ct-export-print">
	<div class="ct-report-cover">
		<span class="ct-report-cover-eyebrow">Control Tower</span>
		<h1>{kpiCards.find((c) => c.key === activeCategory)?.label ?? 'Order Control'}</h1>
		<p class="ct-export-print-meta">{exportPrintRows.length} order · dicetak {new Date().toLocaleString('id-ID')}</p>
	</div>
	<table>
		<thead><tr>{#each EXPORT_COLUMNS as c (c)}<th>{c}</th>{/each}</tr></thead>
		<tbody>
			{#each exportPrintRows as s (s.key)}
				<tr>{#each exportRow(s) as v, i (i)}<td>{v}</td>{/each}</tr>
			{/each}
		</tbody>
	</table>
</div>
