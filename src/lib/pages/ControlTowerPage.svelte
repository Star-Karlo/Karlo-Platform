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
	import GeofencingToggle from '$lib/components/revamp/GeofencingToggle.svelte';
	import { goto } from '$app/navigation';
	import { Search, Truck, MapPin, X, Fuel, Gauge, Radio, Mountain, Battery, Activity, Bell, ZoomIn, Clock, ChevronDown, ChevronUp, Filter, Download, FileText, Copy, AlertCircle, Scale, Settings, GripVertical, Plus, Check, CircleDot } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { shipmentTypeLabel } from '$lib/revamp/shipmentType.js';
	import { computeUangSangu, computePostTripReconciliation } from '$lib/revamp/uangSangu.js';
	import { loadTripAllowance, tripAllowanceDefaults, type TripAllowanceSettings } from '$lib/revamp/tripAllowanceSettings';
	import { copyText } from '$lib/revamp/clipboard.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { haversineKm } from '$lib/revamp/geo.js';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { MapView, type MapMarker } from '$lib/components/ui';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { formatNumber, formatCurrency } from '$lib/utils/format';
	import {
		fetchLiveFleet, fetchLiveVehicle, fetchFuelEstimate, fetchSnappedTrip, fetchTrip, fetchAlerts,
		truckIcon, plateKey, addressLine, curatedSensors, hasFix,
		STATE_LABEL, STATE_COLOUR, SEVERITY_COLOUR, LIVE_POLL_MS,
		type LiveVehicle, type SensorReading, type DriveState, type FuelEstimate, type SnappedTrip, type TripPoint, type Alert
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
	/** Copies the customer's public tracking link (issued on first use). */
	async function copyTrackingLink(s: Shipment) {
		try {
			const token = (await api.post(ENDPOINTS.orders.trackingLink(s.raw.id))).data?.data?.token;
			if (!token) throw new Error('no token');
			await copyText(`${window.location.origin}/track/${token}`);
			toast('Link live tracking untuk customer disalin');
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyalin link — coba lagi');
		}
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
	/**
	 * The window the actual trail is read for: the shipment's own timestamps
	 * when it has them (departure → finish), else the order's pickup, capped
	 * at seven days — FMS caps nothing server-side. Test orders sometimes
	 * carry a pickup after their last update, so the end is always kept
	 * after the start.
	 */
	/**
	 * The window the trace is read over.
	 *
	 * "Now" is rounded down to a two-minute bucket on purpose: this
	 * derivation re-runs whenever the live poll hands back a new shipment
	 * object, and an exact `new Date()` made every re-run a different window
	 * — which refetched the history and blanked the trail mid-journey.
	 */
	const TRACE_BUCKET_MS = 120_000;
	let tripWindow = $derived.by<{ from: Date; to: Date } | null>(() => {
		const o = selectedOrder;
		const now = new Date(Math.floor(Date.now() / TRACE_BUCKET_MS) * TRACE_BUCKET_MS);
		const DAY = 86_400_000;
		if (o) {
			const starts = [shipment?.startedToLoadingAt, shipment?.createdAt, o.pickupAt, o.createdAt]
				.filter(Boolean)
				.map((x: any) => new Date(x).getTime())
				.filter((t) => Number.isFinite(t));
			if (starts.length) {
				const from = new Date(Math.min(...starts));
				const done = o.statusCode === 'completed' || o.statusCode === 'delivered' || shipment?.statusCode === 'finished';
				let to = done
					? new Date(Math.max(...[shipment?.finishedAt, o.updatedAt].filter(Boolean).map((x: any) => new Date(x).getTime()), from.getTime() + 60_000))
					: now;
				if (to.getTime() - from.getTime() > 7 * DAY) to = new Date(from.getTime() + 7 * DAY);
				if (to <= from) to = new Date(Math.min(now.getTime(), from.getTime() + 7 * DAY));
				return { from, to };
			}
		}
		// No order: today's driving.
		return { from: new Date(now.getTime() - 24 * 3_600_000), to: now };
	});
	let alertsKey = $state('');
	$effect(() => {
		const v = selectedVehicle;
		const w = tripWindow;
		if (!v) {
			fuel = null;
			alerts = [];
			alertsKey = '';
			return;
		}
		const key = `${v.vehicle_id}|${w ? +w.from : 0}|${w ? +w.to : 0}`;
		if (key === alertsKey) return;
		// Harsh-driving and refuel dots belong to the truck, so they clear
		// when another truck is picked, not on every poll of the same one.
		if (!alertsKey.startsWith(`${v.vehicle_id}|`)) {
			fuel = null;
			alerts = [];
		}
		alertsKey = key;
		fetchFuelEstimate(v.vehicle_id).then((f) => { if (selectedVehicleId === v.vehicle_id) fuel = f; }).catch(() => {});
		if (w) fetchAlerts(v.vehicle_id, w.from, w.to).then((a) => { if (selectedVehicleId === v.vehicle_id) alerts = a; }).catch(() => {});
	});
	let snappedKey = $state('');
	$effect(() => {
		const v = selectedVehicle;
		const w = tripWindow;
		if (!v || !w) {
			trip = null;
			return;
		}
		// The previous trace stays on the map while the new one loads, and a
		// failed read leaves it alone: a refresh must not empty the map.
		const key = `${v.vehicle_id}|${+w.from}|${+w.to}`;
		if (key === snappedKey) return;
		snappedKey = key;
		fetchSnappedTrip(v.vehicle_id, w.from, w.to)
			.then((t) => { if (selectedVehicleId === v.vehicle_id) trip = t; })
			.catch(() => {});
	});
	/** The raw fixes joined up, and how far they ran. */
	let rawTrail = $derived.by<{ points: [number, number][]; distanceKm: number } | null>(() => {
		if (tripPoints.length < 2) return null;
		const pts = tripPoints.map((p) => [p.lon, p.lat] as [number, number]);
		let km = 0;
		for (let i = 1; i < pts.length; i++) km += haversineKm({ lat: pts[i - 1][1], lng: pts[i - 1][0] }, { lat: pts[i][1], lng: pts[i][0] });
		return { points: pts, distanceKm: Math.round(km * 10) / 10 };
	});
	/**
	 * The journey as it was actually driven.
	 *
	 * The tracking service map-matches the fixes onto roads, which is what
	 * makes the trace read as a route rather than a scatter of dots — but it
	 * matches only the stretches it can, so the distance comes from the raw
	 * fixes whenever part of the window went unmatched. `partial` says so,
	 * and the raw line is then drawn faintly underneath, so nothing driven
	 * disappears from the map.
	 */
	let actualTrail = $derived.by<{ points: [number, number][]; distanceKm: number | null; snapped: boolean; partial: boolean } | null>(() => {
		const snapped = trip && trip.points.length > 1 ? trip : null;
		if (snapped) {
			const missedChunks = (snapped.chunks_total ?? 0) > (snapped.chunks_matched ?? 0);
			const shortRun = rawTrail != null && snapped.distance_km != null && snapped.distance_km < rawTrail.distanceKm * 0.9;
			const partial = missedChunks || shortRun;
			return {
				points: snapped.points,
				distanceKm: partial ? (rawTrail?.distanceKm ?? snapped.distance_km) : snapped.distance_km,
				snapped: true,
				partial
			};
		}
		if (rawTrail) return { ...rawTrail, snapped: false, partial: false };
		return null;
	});

	// Raw fixes for the same window: speed/idle per point are what the
	// Pantau Armada layers read (overspeed colouring, stop and idle dots).
	let tripPoints = $state<TripPoint[]>([]);
	let tripKey = $state('');
	$effect(() => {
		const v = selectedVehicle;
		const w = tripWindow;
		if (!v || !w) {
			tripPoints = [];
			tripKey = '';
			return;
		}
		const key = `${v.vehicle_id}|${+w.from}|${+w.to}`;
		if (key === tripKey) return;
		// Selecting another truck drops the old fixes at once; a refresh of
		// the same truck keeps them until the new ones land.
		if (!tripKey.startsWith(`${v.vehicle_id}|`)) tripPoints = [];
		tripKey = key;
		fetchTrip(v.vehicle_id, w.from, w.to)
			.then((pts) => { if (selectedVehicleId === v.vehicle_id) tripPoints = pts; })
			.catch(() => {});
	});
	// The planned haul from the business service (MAPID geometry), so the
	// plan on the map is a road, not a straight line, and the actual trace
	// can be scored against it.
	type PlannedLeg = { geometry: [number, number][]; distanceKm: number | null; durationMin: number | null; from: [number, number] | null };
	let plannedRoute = $state<PlannedLeg | null>(null);
	/** The truck's leg from where it was when assigned to the loading point — its "Berangkat" point. */
	let approachRoute = $state<PlannedLeg | null>(null);
	function legOf(l: any): PlannedLeg | null {
		const src = l?.route ?? l;
		if (!src) return null;
		const from: [number, number] | null =
			l?.fromLon != null && l?.fromLat != null ? [Number(l.fromLon), Number(l.fromLat)] : null;
		return {
			geometry: Array.isArray(src.geometry) ? src.geometry : [],
			distanceKm: src.distanceMeters != null ? Math.round(src.distanceMeters / 100) / 10 : null,
			durationMin: src.durationSeconds != null ? Math.round(src.durationSeconds / 60) : null,
			from
		};
	}
	$effect(() => {
		const o = selectedOrder;
		plannedRoute = null;
		approachRoute = null;
		if (!o?.id) return;
		// The service stores both legs on the order (and backfills the haul for
		// older orders), so the planned route read here is the order's history.
		api.get(ENDPOINTS.orders.routes(o.id)).then((r) => {
			if (selectedOrder?.id !== o.id) return;
			const legs: any[] = r.data?.data ?? [];
			plannedRoute = legOf(legs.find((l) => l.leg === 'haul'));
			approachRoute = legOf(legs.find((l) => l.leg === 'approach'));
		}).catch(() => {});
	});
	/** Share of actual fixes within 500 m of the planned line — "Kepatuhan Rute". */
	let routeCompliance = $derived.by<number | null>(() => {
		const plan = plannedRoute?.geometry;
		const actual = actualTrail?.points;
		if (!plan || plan.length < 2 || !actual || actual.length < 2) return null;
		// Sample the plan every ~1 km to keep the nearest-point search cheap.
		const sampled: [number, number][] = [];
		let acc = 0;
		for (let i = 0; i < plan.length; i++) {
			if (i === 0) { sampled.push(plan[i]); continue; }
			acc += haversineKm({ lat: plan[i - 1][1], lng: plan[i - 1][0] }, { lat: plan[i][1], lng: plan[i][0] });
			if (acc >= 1) { sampled.push(plan[i]); acc = 0; }
		}
		const step = Math.max(1, Math.floor(actual.length / 300));
		let within = 0, total = 0;
		for (let i = 0; i < actual.length; i += step) {
			const a = { lat: actual[i][1], lng: actual[i][0] };
			let best = Infinity;
			for (const p of sampled) {
				const d = haversineKm(a, { lat: p[1], lng: p[0] });
				if (d < best) best = d;
				if (best < 0.5) break;
			}
			total++;
			if (best < 0.75) within++;
		}
		return total ? Math.round((within / total) * 100) : null;
	});

	// ------------------------------------------------------------------------
	// Pantau Armada — layers drawn from the selected truck's FMS trace and
	// alerts. Thresholds and the layer set can be saved as this browser's
	// default view.
	// ------------------------------------------------------------------------
	type MonitorLayer = 'overspeed' | 'stopDots' | 'harshDriving' | 'refuelSpots' | 'idleSpots';
	const MONITOR_LAYER_META: Record<MonitorLayer, { label: string; color: string; bg: string; icon?: string }> = {
		overspeed: { label: 'Overspeed Colors', color: '#C2410C', bg: '#FDECD1' },
		stopDots: { label: 'Stop Dots', color: '#DC2626', bg: '#FCE2E2' },
		harshDriving: { label: 'Harsh Driving', color: '#EA580C', bg: '#FFEDD5' },
		refuelSpots: { label: 'Refuel Spots', color: '#0B57D0', bg: '#E3ECFC', icon: '⛽' },
		idleSpots: { label: 'Idle Spots', color: '#A16207', bg: '#FEF3C7' }
	};
	const MONITOR_STORAGE_KEY = 'ct-monitor-view';
	let monitorPanelOpen = $state(false);
	let monitorAddLayerOpen = $state(false);
	let activeMonitorLayers = $state<MonitorLayer[]>(['overspeed', 'stopDots']);
	let monitorConfig = $state({ speedLimitKmh: 60, stopToleranceHours: 2, idleToleranceMinutes: 15 });
	let monitorSaved = $state(false);
	onMount(() => {
		try {
			const raw = localStorage.getItem(MONITOR_STORAGE_KEY);
			if (raw) {
				const v = JSON.parse(raw);
				if (Array.isArray(v.layers)) activeMonitorLayers = v.layers;
				if (v.config) monitorConfig = { ...monitorConfig, ...v.config };
			}
		} catch { /* ignore */ }
	});
	let availableLayersToAdd = $derived((Object.keys(MONITOR_LAYER_META) as MonitorLayer[]).filter((k) => !activeMonitorLayers.includes(k)));
	function addMonitorLayer(k: MonitorLayer) { activeMonitorLayers = [...activeMonitorLayers, k]; monitorAddLayerOpen = false; }
	function removeMonitorLayer(k: MonitorLayer) { activeMonitorLayers = activeMonitorLayers.filter((x) => x !== k); }
	function saveMonitorDefaultView() {
		try { localStorage.setItem(MONITOR_STORAGE_KEY, JSON.stringify({ layers: activeMonitorLayers, config: monitorConfig })); monitorSaved = true; setTimeout(() => (monitorSaved = false), 1500); toast('Tampilan Pantau Armada disimpan sebagai default'); } catch { toast('Gagal menyimpan'); }
	}
	const layerOn = (k: MonitorLayer) => activeMonitorLayers.includes(k);
	/**
	 * Dwell events off the raw trace. FMS reports idle_min on every fix of a
	 * stop, so a run of consecutive dwelling fixes is ONE event (its last fix,
	 * carrying the longest dwell) — not one dot per fix. Ignition off = stop,
	 * ignition on = idle.
	 */
	let dwellEvents = $derived.by(() => {
		const out: TripPoint[] = [];
		let run: TripPoint | null = null;
		for (const p of tripPoints) {
			if ((p.idle_min ?? 0) > 0) {
				if (!run || (p.idle_min ?? 0) >= (run.idle_min ?? 0)) run = p;
			} else if (run) {
				out.push(run);
				run = null;
			}
		}
		if (run) out.push(run);
		return out;
	});
	let stopEvents = $derived(dwellEvents.filter((p) => (p.idle_min ?? 0) >= monitorConfig.stopToleranceHours * 60 && p.ignition === false));
	let idleEvents = $derived(dwellEvents.filter((p) => (p.idle_min ?? 0) >= monitorConfig.idleToleranceMinutes && p.ignition !== false));
	let harshEvents = $derived(alerts.filter((a) => /harsh|kasar|mendadak|brak|accel|corner/i.test(`${a.alert_code} ${a.alert_name}`) && a.lat != null && a.lon != null));
	let refuelEvents = $derived(alerts.filter((a) => /refuel|fuel|bbm|bahan bakar/i.test(`${a.alert_code} ${a.alert_name}`) && a.lat != null && a.lon != null));
	let overspeedCount = $derived(tripPoints.filter((p) => (p.speed ?? 0) > monitorConfig.speedLimitKmh).length);
	const fmtMin = (m: number) => (m < 60 ? `${Math.round(m)} menit` : `${Math.floor(m / 60)} jam ${Math.round(m % 60)} menit`);

	// ------------------------------------------------------------------------
	// Progress + tasklist for the selected order, off the shipment machine.
	// ------------------------------------------------------------------------
	const PROGRESS_STEPS = [
		{ key: 'assigned', label: 'Ditugaskan', statuses: ['assigned'] },
		{ key: 'toLoading', label: 'Menuju Muat', statuses: ['toLoading', 'atLoading', 'loadingApproved', 'loading'] },
		{ key: 'loaded', label: 'Selesai Muat', statuses: ['loaded'] },
		{ key: 'toUnloading', label: 'Menuju Bongkar', statuses: ['toUnloading', 'atUnloading', 'unloadingApproved', 'unloading'] },
		{ key: 'unloaded', label: 'Selesai Bongkar', statuses: ['unloaded'] },
		{ key: 'finished', label: 'Selesai', statuses: ['finished'] }
	];
	let deliveryProgress = $derived.by(() => {
		const o = selectedOrder;
		if (!o) return null;
		const sc = shipment?.statusCode ?? o.shipmentStatusCode ?? (o.statusCode === 'completed' || o.statusCode === 'delivered' ? 'finished' : 'assigned');
		let idx = PROGRESS_STEPS.findIndex((st) => st.statuses.includes(sc));
		if (idx < 0) idx = 0;
		const steps = PROGRESS_STEPS.map((st, i) => ({ key: st.key, label: st.label, done: i <= idx }));
		return { percent: Math.round(((idx + 1) / PROGRESS_STEPS.length) * 100), steps };
	});
	let deliveryDurationLabel = $derived.by(() => {
		const o = selectedOrder;
		if (!o?.pickupAt) return '—';
		const start = new Date(o.pickupAt).getTime();
		const end = o.statusCode === 'completed' || o.statusCode === 'delivered' ? new Date(o.updatedAt ?? nowMs).getTime() : nowMs;
		const m = Math.max(0, (end - start) / 60_000);
		return m < 60 ? `${Math.round(m)} menit` : m < 1440 ? `${Math.floor(m / 60)} jam ${Math.round(m % 60)} menit` : `${Math.floor(m / 1440)} hari ${Math.floor((m % 1440) / 60)} jam`;
	});
	type TaskState = 'done' | 'pending' | 'upcoming';
	const TASK_STATE_LABEL: Record<TaskState, string> = { done: 'Selesai', pending: 'Perlu tindakan', upcoming: 'Belum waktunya' };
	let transporterTasks = $derived.by(() => {
		const o = selectedOrder;
		if (!o) return null;
		const status = kontrakStatus(o);
		const d = o.detail ?? {};
		const idx = (k: string) => ['penugasan_pengemudi','pengemudi_ditugaskan','pengemudi_menerima_order','menuju_lokasi_muat','tiba_lokasi_muat','proses_muat_barang','verifikasi_pod_muat','pod_muat_terverifikasi','menuju_lokasi_bongkar','tiba_lokasi_bongkar','proses_bongkar_muatan','verifikasi_pod_bongkar','pod_bongkar_terverifikasi','menunggu_konfirmasi_pengiriman','pengiriman_terkonfirmasi'].indexOf(k);
		const cur = idx(status);
		const items: { key: string; label: string; state: TaskState }[] = [
			{ key: 'podMuat', label: 'Verifikasi POD Muat', state: cur > idx('verifikasi_pod_muat') ? 'done' : status === 'verifikasi_pod_muat' ? 'pending' : 'upcoming' },
			{ key: 'podBongkar', label: 'Verifikasi POD Bongkar', state: cur > idx('verifikasi_pod_bongkar') ? 'done' : status === 'verifikasi_pod_bongkar' ? 'pending' : 'upcoming' },
			{ key: 'sangu', label: 'Finalisasi Uang Sangu', state: d.uangSanguFinalized ? 'done' : 'pending' }
		];
		return { items, pendingCount: items.filter((t) => t.state === 'pending').length };
	});

	// ------------------------------------------------------------------------
	// Panel sizes: the detail panel's width (drag its left edge) and the order
	// list's height (drag its top edge); both remembered, and the detail panel
	// can collapse to its header.
	// ------------------------------------------------------------------------
	const DETAIL_MIN = 280;
	const DETAIL_MAX = 640;
	let detailPanelWidth = $state(340);
	let detailPanelMinimized = $state(false);
	let detailPanelEl = $state<HTMLElement | null>(null);
	const OC_MIN = 180;
	const OC_MAX = 700;
	let ocHeight = $state(320);
	onMount(() => {
		try {
			const w = Number(localStorage.getItem('ct-detail-width'));
			if (w >= DETAIL_MIN && w <= DETAIL_MAX) detailPanelWidth = w;
			const h = Number(localStorage.getItem('ct-oc-height'));
			if (h >= OC_MIN && h <= OC_MAX) ocHeight = h;
		} catch { /* ignore */ }
	});
	function drag(e: MouseEvent, onMove: (ev: MouseEvent) => void, onStop: () => void) {
		e.preventDefault();
		const stop = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', stop);
			document.body.style.userSelect = '';
			onStop();
		};
		document.body.style.userSelect = 'none';
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', stop);
	}
	function startDetailResize(e: MouseEvent) {
		const right = detailPanelEl?.getBoundingClientRect().right ?? e.clientX + detailPanelWidth;
		drag(e, (ev) => { detailPanelWidth = Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, right - ev.clientX)); }, () => {
			try { localStorage.setItem('ct-detail-width', String(detailPanelWidth)); } catch { /* ignore */ }
		});
	}
	function startOcResize(e: MouseEvent) {
		const startY = e.clientY;
		const startH = ocHeight;
		drag(e, (ev) => { ocHeight = Math.min(OC_MAX, Math.max(OC_MIN, startH - (ev.clientY - startY))); }, () => {
			try { localStorage.setItem('ct-oc-height', String(ocHeight)); } catch { /* ignore */ }
		});
	}

	// ------------------------------------------------------------------------
	// Widgets: which cards the panel shows and in what order. Adjust mode
	// adds/removes/reorders; the layout can be saved as this browser's default.
	// ------------------------------------------------------------------------
	type WidgetKey = 'cargo' | 'route' | 'progress' | 'tasklist' | 'telemetry' | 'fuel';
	const WIDGET_LABEL: Record<WidgetKey, string> = { cargo: 'Detail Muatan', route: 'Rute Perjalanan', progress: 'Progress Pengiriman', tasklist: 'Tasklist', telemetry: 'Sensors & Telemetry', fuel: 'Fuel Consumption' };
	const DEFAULT_WIDGET_LAYOUT: WidgetKey[] = ['cargo', 'route', 'progress', 'tasklist', 'telemetry', 'fuel'];
	const WIDGET_STORAGE_KEY = 'ct-widget-layout';
	let widgetLayout = $state<WidgetKey[]>([...DEFAULT_WIDGET_LAYOUT]);
	let widgetAdjustMode = $state(false);
	let addWidgetMenuOpen = $state(false);
	let widgetLayoutSaved = $state(false);
	onMount(() => {
		try {
			const raw = localStorage.getItem(WIDGET_STORAGE_KEY);
			if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.every((k) => k in WIDGET_LABEL)) widgetLayout = v; }
		} catch { /* ignore */ }
	});
	let availableWidgetsToAdd = $derived(DEFAULT_WIDGET_LAYOUT.filter((k) => !widgetLayout.includes(k)));
	function addWidget(k: WidgetKey) { widgetLayout = [...widgetLayout, k]; addWidgetMenuOpen = false; }
	function removeWidget(k: WidgetKey) { widgetLayout = widgetLayout.filter((x) => x !== k); }
	let draggedWidgetKey = $state<WidgetKey | null>(null);
	function onWidgetDrop(target: WidgetKey) {
		const from = draggedWidgetKey;
		draggedWidgetKey = null;
		if (!from || from === target) return;
		const arr = widgetLayout.filter((k) => k !== from);
		arr.splice(arr.indexOf(target), 0, from);
		widgetLayout = arr;
	}
	function saveWidgetLayout() {
		try { localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgetLayout)); widgetLayoutSaved = true; setTimeout(() => (widgetLayoutSaved = false), 1500); toast('Susunan widget disimpan sebagai default'); } catch { toast('Gagal menyimpan'); }
	}

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
		// The selected order's three points: where the truck set off from when
		// assigned (Berangkat), the loading point (Muat) and the unloading
		// point (Bongkar).
		if (selectedOrder) {
			const o = selectedOrder;
			const start = approachRoute?.from ?? (approachRoute?.geometry.length ? approachRoute.geometry[0] : null);
			if (start) out.push({ id: 'o-start', lng: start[0], lat: start[1], color: '#0B57D0', label: 'Berangkat', title: 'Titik berangkat', subtitle: 'Posisi truck saat ditugaskan' });
			const a = coordsOf(o.originWarehouseId);
			const b = coordsOf(o.destinationWarehouseId);
			if (a) out.push({ id: 'o-muat', lng: a[0], lat: a[1], color: '#146C2E', label: 'Muat', title: o.originWarehouseName ?? 'Lokasi muat' });
			if (b) out.push({ id: 'o-bongkar', lng: b[0], lat: b[1], color: '#B3261E', label: 'Bongkar', title: o.destinationWarehouseName ?? 'Lokasi bongkar' });
		}
		// Pantau Armada dots, for the selected truck's window.
		if (selectedVehicleId) {
			if (layerOn('stopDots')) stopEvents.forEach((p, i) => out.push({ id: `stop-${i}`, lng: p.lon, lat: p.lat, color: MONITOR_LAYER_META.stopDots.color, title: `Berhenti ${fmtMin(p.idle_min ?? 0)}`, subtitle: `${new Date(p.time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}${p.address ? ` · ${p.address}` : ''}` }));
			if (layerOn('idleSpots')) idleEvents.forEach((p, i) => out.push({ id: `idle-${i}`, lng: p.lon, lat: p.lat, color: MONITOR_LAYER_META.idleSpots.color, title: `Idle ${fmtMin(p.idle_min ?? 0)} (mesin hidup)`, subtitle: `${new Date(p.time).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}${p.address ? ` · ${p.address}` : ''}` }));
			if (layerOn('harshDriving')) harshEvents.forEach((a) => out.push({ id: `harsh-${a.id}`, lng: a.lon as number, lat: a.lat as number, color: MONITOR_LAYER_META.harshDriving.color, title: a.alert_name, subtitle: `${new Date(a.occurred_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}${a.address ? ` · ${a.address}` : ''}` }));
			if (layerOn('refuelSpots')) refuelEvents.forEach((a) => out.push({ id: `refuel-${a.id}`, lng: a.lon as number, lat: a.lat as number, color: MONITOR_LAYER_META.refuelSpots.color, label: '⛽', title: a.alert_name, subtitle: `${new Date(a.occurred_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}${a.address ? ` · ${a.address}` : ''}` }));
		}
		return out;
	});

	/** The selected order's planned haul (MAPID geometry, dashed) and the actual trace; overspeed stretches in red when that layer is on. */
	let lines = $derived.by(() => {
		const out: { id: string; coordinates: [number, number][]; dashed?: boolean; color?: string; width?: number }[] = [];
		const o = selectedOrder;
		if (o) {
			if (approachRoute?.geometry.length) out.push({ id: `approach-${o.id}`, coordinates: approachRoute.geometry, dashed: true, color: '#146C2E', width: 3 });
			if (plannedRoute?.geometry.length) out.push({ id: `plan-${o.id}`, coordinates: plannedRoute.geometry, dashed: true, color: '#0B57D0' });
			else {
				const a = coordsOf(o.originWarehouseId);
				const b = coordsOf(o.destinationWarehouseId);
				if (a && b) out.push({ id: `plan-${o.id}`, coordinates: [a, b], dashed: true, color: '#0B57D0' });
			}
		}
		if (actualTrail) {
			// The raw run under the matched one, so an unmatched stretch is
			// still visible as the thin line it was driven on.
			if (actualTrail.snapped && actualTrail.partial && rawTrail) {
				out.push({ id: `actual-raw-${selectedVehicleId}`, coordinates: rawTrail.points, color: '#F59E0B', width: 2, dashed: true });
			}
			out.push({ id: `actual-${selectedVehicleId}`, coordinates: actualTrail.points, color: layerOn('overspeed') ? '#16a34a' : '#dc2626', width: 3 });
		}
		if (layerOn('overspeed') && tripPoints.length > 1) {
			// Consecutive fixes above the limit form one red stretch each.
			let seg: [number, number][] = [];
			let n = 0;
			const flush = () => { if (seg.length > 1) out.push({ id: `over-${n++}`, coordinates: seg, color: MONITOR_LAYER_META.overspeed.color, width: 4 }); seg = []; };
			for (const p of tripPoints) {
				if ((p.speed ?? 0) > monitorConfig.speedLimitKmh) seg.push([p.lon, p.lat]);
				else flush();
			}
			flush();
		}
		return out;
	});


	let needsClient = $derived(isStaff && !$actingFor.companyId);
	let num = (v: any) => (v === undefined || v === null || v === '' ? undefined : Number(v));
	/** Numbers in the panel tables; one dash style ("—") for a missing figure. */
	const nf = (v: any) => { const n = num(v); return n === undefined || Number.isNaN(n) ? '—' : formatNumber(n); };
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
		<!-- The company's own geofencing switch, as the old console had it:
		     on, an arrival reported outside the warehouse's fence is
		     refused; off, it is recorded with the distance and let through. -->
		<span style="margin-left:auto;"><GeofencingToggle compact /></span>
		<span class="hint">
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
			<div class="planner-map-legends" style="right:56px;">
				{#if !monitorPanelOpen}
					<button type="button" class="planner-truck-legend-toggle" title="Pantau Armada" onclick={() => (monitorPanelOpen = true)}><Radio size={16} /></button>
				{:else}
					<div class="ct-monitor-panel">
						<div class="ct-monitor-panel-head">
							<span>Pantau Armada</span>
							<button type="button" class="mini-icon-btn" title="Tutup" onclick={() => { monitorPanelOpen = false; monitorAddLayerOpen = false; }}><X size={14} /></button>
						</div>
						<div class="ct-monitor-chips">
							{#each activeMonitorLayers as key (key)}
								<span class="ct-monitor-chip" style="background:{MONITOR_LAYER_META[key].bg}; color:{MONITOR_LAYER_META[key].color}">
									{#if MONITOR_LAYER_META[key].icon}<span class="ct-monitor-chip-icon">{MONITOR_LAYER_META[key].icon}</span>{:else}<span class="ct-monitor-chip-dot" style="background:{MONITOR_LAYER_META[key].color}"></span>{/if}
									{MONITOR_LAYER_META[key].label}
									<button type="button" class="ct-monitor-chip-remove" title="Hapus layer" onclick={() => removeMonitorLayer(key)}>×</button>
								</span>
							{/each}
							<span class="ct-monitor-add-wrap">
								<button type="button" class="ct-monitor-chip ct-monitor-chip--add" onclick={() => (monitorAddLayerOpen = !monitorAddLayerOpen)}><Plus size={11} /> Add layer</button>
								{#if monitorAddLayerOpen}
									<div class="ct-monitor-add-menu">
										{#if !availableLayersToAdd.length}<div class="ct-monitor-add-menu-empty">Semua layer sudah aktif</div>{/if}
										{#each availableLayersToAdd as k (k)}
											<button type="button" class="ct-monitor-add-menu-item" onclick={() => addMonitorLayer(k)}>
												{#if MONITOR_LAYER_META[k].icon}<span class="ct-monitor-chip-icon">{MONITOR_LAYER_META[k].icon}</span>{:else}<span class="ct-monitor-chip-dot" style="background:{MONITOR_LAYER_META[k].color}"></span>{/if}
												{MONITOR_LAYER_META[k].label}
											</button>
										{/each}
									</div>
								{/if}
							</span>
						</div>
						<div class="ct-monitor-config-row"><span class="ct-monitor-config-label">Red above</span><input type="number" class="ct-monitor-config-input" bind:value={monitorConfig.speedLimitKmh} min="0" /><span class="ct-monitor-config-unit">km/h</span></div>
						<div class="ct-monitor-config-row"><span class="ct-monitor-config-label">Stop dots if stopped over</span><input type="number" class="ct-monitor-config-input" bind:value={monitorConfig.stopToleranceHours} min="0" /><span class="ct-monitor-config-unit">hours</span></div>
						<div class="ct-monitor-config-row"><span class="ct-monitor-config-label">Idle dots if idle over</span><input type="number" class="ct-monitor-config-input" bind:value={monitorConfig.idleToleranceMinutes} min="0" /><span class="ct-monitor-config-unit">menit</span></div>
						<button type="button" class="ct-monitor-save-btn" onclick={saveMonitorDefaultView}>{monitorSaved ? '✓ Tersimpan' : 'Save as default view'}</button>
						{#if selectedVehicle}
							<div class="hint" style="margin-top:10px;">{tripPoints.length} titik GPS · {overspeedCount} di atas {monitorConfig.speedLimitKmh} km/h · {stopEvents.length} berhenti · {idleEvents.length} idle · {harshEvents.length} harsh · {refuelEvents.length} refuel</div>
						{:else}
							<div class="hint" style="margin-top:10px;">Pilih truck untuk melihat layer pada jejaknya.</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Right panel: the selected vehicle -->
		{#if selectedVehicle}
			{@const v = detail ?? selectedVehicle}
			{@const o = selectedOrder}
			{@const pos = v.position}
			<aside bind:this={detailPanelEl} class="ct2-panel" class:ct2-panel--min={detailPanelMinimized} style="width:{detailPanelMinimized ? 56 : detailPanelWidth}px">
				{#if !detailPanelMinimized}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="planner-side-resize-handle" title="Geser untuk mengubah lebar" onmousedown={startDetailResize}></div>
				{/if}
				{#if detailPanelMinimized}
					<button type="button" class="mini-icon-btn" title="Perbesar panel" onclick={() => (detailPanelMinimized = false)}><ChevronDown size={14} style="transform:rotate(90deg)" /></button>
					<span class="ct2-panel-min-label">{v.license_plate}</span>
					<button type="button" class="mini-icon-btn" title="Tutup" onclick={clearSelection}><X size={14} /></button>
				{:else}
				<div class="ct2-panel-head">
					<div>
						<h3>{o ? `${o.orderNumber} · ${klien(o)}` : v.license_plate}</h3>
						<div class="ct2-panel-sub"><Truck size={14} /> <b>{v.license_plate}</b> <span>{v.driver?.name ?? 'Pengemudi belum ditetapkan'}</span></div>
					</div>
					<div class="ct2-panel-actions">
						<button type="button" class="mini-icon-btn ct-widget-toggle" class:mini-icon-btn--active={widgetAdjustMode} title={widgetAdjustMode ? 'Selesai mengatur widget' : 'Tambah, hapus, atau atur ulang urutan widget'} onclick={() => { widgetAdjustMode = !widgetAdjustMode; addWidgetMenuOpen = false; }}><Settings size={14} /></button>
						{#if o}<button type="button" class="mini-icon-btn" title="Detail order" onclick={() => goto(`${basePath.replace('/control-tower', '')}/order/${o.id}`)}><ZoomIn size={14} /></button>{/if}
						<button type="button" class="mini-icon-btn" title="Perkecil panel" onclick={() => (detailPanelMinimized = true)}><ChevronDown size={14} style="transform:rotate(-90deg)" /></button>
						<button type="button" class="mini-icon-btn" title="Tutup" onclick={clearSelection}><X size={14} /></button>
					</div>
				</div>
				<div class="ct2-tabs">
					<button type="button" class:active={tab === 'monitoring'} onclick={() => (tab = 'monitoring')}>Monitoring</button>
					<button type="button" class:active={tab === 'notifikasi'} onclick={() => (tab = 'notifikasi')}>Notifikasi</button>
				</div>

				{#if tab === 'monitoring'}
					{#each widgetLayout as key (key)}
						<div class="ct-widget-card" class:ct-widget-card--editing={widgetAdjustMode} class:ct-widget-card--dragging={draggedWidgetKey === key} draggable={widgetAdjustMode} role="listitem" ondragstart={() => (draggedWidgetKey = key)} ondragover={(e) => e.preventDefault()} ondrop={() => onWidgetDrop(key)}>
							{#if widgetAdjustMode}
								<div class="ct-widget-edit-bar">
									<GripVertical size={14} class="ct-widget-drag-handle" />
									<span class="ct-widget-edit-label">{WIDGET_LABEL[key]}</span>
									<button type="button" class="ct-widget-remove" title="Hapus widget ini" onclick={() => removeWidget(key)}><X size={10} /></button>
								</div>
							{/if}
							{#if key === 'cargo'}
<section class="ct2-card">
						<header><span>Detail Muatan</span><small>{o?.detail?.itemName ?? o?.detail?.commodity ?? (o ? kindLabel(o) : 'Tidak ada order aktif')}</small></header>
						{#if o}
							<table class="ct2-table">
								<thead><tr><th></th><th>Plan</th><th>Muat</th><th>Bongkar</th></tr></thead>
								<tbody>
									<tr><td>Tonase (Kg)</td><td>{nf(o.weightKg)}</td><td>{nf(shipment?.loadedWeightKg ?? shipment?.weight)}</td><td>{nf(shipment?.unloadedWeightKg)}</td></tr>
									<tr><td>Qty (Pcs)</td><td>{nf(o.quantity)}</td><td>{nf(shipment?.loadedQuantity)}</td><td>{nf(shipment?.unloadedQuantity)}</td></tr>
									<tr><td>Volume (m³)</td><td>{nf(o.volumeM3 ?? o.detail?.volumeM3 ?? o.detail?.volume)}</td><td>{nf(shipment?.loadedVolumeM3 ?? shipment?.volume)}</td><td>{nf(shipment?.unloadedVolumeM3)}</td></tr>
								</tbody>
							</table>
						{:else}
							<div class="ct2-card-empty">Truk ini tidak sedang membawa order TMS.</div>
						{/if}
					</section>
						{:else if key === 'route'}
<section class="ct2-card">
						<header>
							<span style="white-space:nowrap;">Rute Perjalanan</span>
							{#if routeCompliance != null}<span class="ct-route-compliance"><span class="ct-route-compliance-label">Kepatuhan Rute</span><span class="ct-route-compliance-ring {routeCompliance >= 90 ? 'good' : routeCompliance >= 70 ? 'ok' : 'bad'}">{routeCompliance}%</span></span>{/if}
						</header>
						{#if o}<div class="ct2-route-line" title={routeLabel(o)}>{routeLabel(o)}</div>{/if}
						{#if o}
							<table class="ct2-table">
								<thead><tr><th></th><th>Plan</th><th>Aktual</th></tr></thead>
								<tbody>
									<tr><td>Jarak</td><td>{plannedRoute?.distanceKm != null ? `${plannedRoute.distanceKm} km` : o.detail?.distanceKm ? `${nf(o.detail.distanceKm)} km` : '—'}</td><td>{actualTrail?.distanceKm != null ? `${formatNumber(Math.round(actualTrail.distanceKm * 10) / 10)} km` : '—'}</td></tr>
									{#if approachRoute?.distanceKm != null}
										<tr><td>Menuju muat</td><td>{approachRoute.distanceKm} km</td><td>—</td></tr>
									{/if}
									<tr><td>ETA</td><td>{plannedRoute?.durationMin != null ? `${Math.floor(plannedRoute.durationMin / 60)} jam ${plannedRoute.durationMin % 60} menit` : o.deliveryAt ? new Date(o.deliveryAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td><td>{o.statusCode === 'delivered' || o.statusCode === 'completed' ? new Date(o.updatedAt ?? '').toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'dalam perjalanan'}</td></tr>
								</tbody>
							</table>
							{#if actualTrail}
								<small class="hint">
									Jalur aktual ({layerOn('overspeed') ? 'hijau' : 'merah'}{actualTrail.snapped ? ', mengikuti jalan' : ', titik GPS mentah'}) dari GPS FMS, {tripWindow ? `${tripWindow.from.toLocaleDateString('id-ID')} – ${tripWindow.to.toLocaleDateString('id-ID')}` : ''}{#if actualTrail.partial}; sebagian belum terpetakan ke jalan — garis oranye putus-putus adalah titik GPS mentah, dan jarak aktual dihitung dari titik tersebut{/if}.
								</small>
							{/if}
						{:else}
							<div class="ct2-card-empty">{addressLine(pos) || 'Posisi belum diketahui.'}</div>
						{/if}
					</section>
						{:else if key === 'progress'}
<section class="ct2-card">
						<header><span>Progress Pengiriman</span>{#if deliveryProgress}<span class="ct-progress-percent">{deliveryProgress.percent}%</span>{/if}</header>
						{#if deliveryProgress}
							<div class="ct-progress-track"><div class="ct-progress-track-fill" style="width:{deliveryProgress.percent}%"></div></div>
							<div class="ct-progress-checkpoints">
								{#each deliveryProgress.steps as st (st.key)}<span class="ct-progress-checkpoint" class:ct-progress-checkpoint--done={st.done}>{st.label}</span>{/each}
							</div>
							<div class="ct-progress-duration"><span class="ct-progress-duration-label">Durasi Pengiriman</span><span class="ct-progress-duration-value">{deliveryDurationLabel}</span></div>
						{:else}
							<div class="ct2-card-empty">Truk ini tidak sedang membawa order TMS.</div>
						{/if}
					</section>
						{:else if key === 'tasklist'}
<section class="ct2-card">
						<header><span>Tasklist</span>{#if transporterTasks}<span class="ct-tasklist-count" class:ct-tasklist-count--clear={!transporterTasks.pendingCount}>{transporterTasks.pendingCount ? `${transporterTasks.pendingCount} perlu tindakan` : 'Semua selesai'}</span>{/if}</header>
						{#if transporterTasks && o}
							<div class="ct-tasklist">
								{#each transporterTasks.items as task (task.key)}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div class="ct-tasklist-item ct-tasklist-item--{task.state}" class:ct-tasklist-item--clickable={task.state === 'pending'} onclick={() => task.state === 'pending' && goto(`${basePath.replace('/control-tower', '')}/order/${o.id}`)}>
										<span class="ct-tasklist-icon">{#if task.state === 'done'}<Check size={12} />{:else if task.state === 'pending'}<AlertCircle size={12} />{:else}<Clock size={12} />{/if}</span>
										<span class="ct-tasklist-label">{task.label}</span>
										<span class="ct-tasklist-state">{TASK_STATE_LABEL[task.state]}</span>
									</div>
								{/each}
							</div>
						{:else}
							<div class="ct2-card-empty">Truk ini tidak sedang membawa order TMS.</div>
						{/if}
					</section>
						{:else if key === 'telemetry'}
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
						{:else if key === 'fuel'}
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
							{/if}
						</div>
					{/each}
					{#if widgetAdjustMode}
						<div class="ct-widget-add">
							<button type="button" class="ct-widget-add-btn" disabled={!availableWidgetsToAdd.length} onclick={() => (addWidgetMenuOpen = !addWidgetMenuOpen)}><Plus size={13} /> Tambah widget</button>
							{#if addWidgetMenuOpen}
								<div class="ct-widget-add-menu">
									{#each availableWidgetsToAdd as k (k)}<button type="button" class="ct-widget-add-menu-item" onclick={() => addWidget(k)}>{WIDGET_LABEL[k]}</button>{/each}
								</div>
							{/if}
						</div>
						<button type="button" class="ct-widget-save-default-btn" class:ct-widget-save-default-btn--saved={widgetLayoutSaved} onclick={saveWidgetLayout}><Check size={14} /> {widgetLayoutSaved ? 'Tersimpan' : 'Save as default layout'}</button>
					{/if}
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
				{/if}
			</aside>
		{/if}
	</div>

	<!-- Order Control -->
	<div class="ct2-orders ct-oc-panel" style="position:relative;">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="ct-oc-height-handle" title="Geser untuk mengubah tinggi" onmousedown={startOcResize}></div>
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
		<div class="ct-oc-scroll" style="max-height:{ocHeight}px">
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
											<button class="mini-icon-btn" title="Salin link live tracking untuk customer" onclick={(e) => { e.stopPropagation(); copyTrackingLink(f); }}><Copy size={14} /></button>
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
											<button class="mini-icon-btn" title="Salin link live tracking untuk customer" onclick={(e) => { e.stopPropagation(); copyTrackingLink(s); }}><Copy size={14} /></button>
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
