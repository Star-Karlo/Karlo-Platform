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
	import { Search, Truck, MapPin, X, Fuel, Gauge, Radio, Mountain, Battery, Activity, Bell, ZoomIn, Clock } from 'lucide-svelte';
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

	async function refreshLive() {
		try {
			live = await fetchLiveFleet();
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
	// Orders, by category — the order book at the bottom.
	// ------------------------------------------------------------------------
	const CATEGORIES: { key: string; label: string; statuses: string[]; kinds?: string[] }[] = [
		{ key: 'planned', label: 'Order Planned', statuses: ['approved', 'readyToPlan'] },
		{ key: 'single', label: 'Order Single Shipment', statuses: ['assigned', 'inTransit'], kinds: ['standard'] },
		{ key: 'threepl', label: 'Order 3PL', statuses: ['assigned', 'inTransit'], kinds: ['threepl'] },
		{ key: 'empty', label: 'Empty Order', statuses: ['assigned', 'inTransit'], kinds: ['empty'] },
		{ key: 'delivered', label: 'Verifikasi POD', statuses: ['delivered'] },
		{ key: 'done', label: 'Selesai', statuses: ['completed'] }
	];
	let activeCategory = $state('single');
	let allOrders = $derived($orderStore.orders ?? []);
	function inCategory(o: any, c: (typeof CATEGORIES)[number]): boolean {
		return c.statuses.includes(o.statusCode) && (!c.kinds || c.kinds.includes(o.orderKind ?? 'standard'));
	}
	let counts = $derived(Object.fromEntries(CATEGORIES.map((c) => [c.key, allOrders.filter((o) => inCategory(o, c)).length])));
	let category = $derived(CATEGORIES.find((c) => c.key === activeCategory));
	let categoryOrders = $derived(category ? allOrders.filter((o) => inCategory(o, category)) : []);

	/** The order a truck is on right now: the live one first, else the most recently assigned. */
	const ACTIVE: string[] = ['inTransit', 'assigned', 'delivered', 'approved', 'readyToPlan'];
	function orderFor(v: LiveVehicle | null): any | null {
		if (!v) return null;
		const mine = allOrders.filter((o) => liveFor(o)?.vehicle_id === v.vehicle_id);
		return mine.sort((a, b) => ACTIVE.indexOf(a.statusCode ?? '') - ACTIVE.indexOf(b.statusCode ?? ''))[0] ?? null;
	}

	function warehouse(id?: string) {
		if (!id) return null;
		return ($warehouseStore.warehouses ?? []).find((w: any) => w.id === id) ?? null;
	}
	function coordsOf(id?: string): [number, number] | null {
		const c = warehouse(id)?.location?.coordinates;
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
		else {
			const c = coordsOf(o.originWarehouseId);
			if (c) flyTo = c;
		}
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
		for (const o of categoryOrders) {
			if (liveFor(o)) continue;
			const atOrigin = ['assigned', 'approved', 'readyToPlan'].includes(o.statusCode ?? '');
			const c = coordsOf(atOrigin ? o.originWarehouseId : o.destinationWarehouseId) ?? coordsOf(o.originWarehouseId);
			if (!c) continue;
			out.push({
				id: `o-${o.id}`, lng: c[0], lat: c[1],
				icon: TRUCK_MARKER[o.statusCode === 'inTransit' ? 'onDuty' : 'waitingDepartureOrder'],
				iconWidth: 30, iconHeight: 30,
				title: o.truckPoliceNumber || o.orderNumber,
				subtitle: `${klien(o)} · ${o.status ?? o.statusCode} · posisi gudang`
			});
		}
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
						<span class="ct2-vehicle-speed">
							{#if !v.online}<span class="ct2-alert" title="Tidak ada sinyal {Math.round(v.stale_minutes)} menit">!</span>{/if}
							{Math.round(v.position?.speed ?? 0)} km/j
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

	<!-- Order book -->
	<div class="ct2-orders">
		<div class="order-tabs-row">
			{#each CATEGORIES as c}
				<button type="button" class="order-tab {activeCategory === c.key ? 'active' : ''}" onclick={() => (activeCategory = c.key)}>
					{c.label} ({counts[c.key] ?? 0})
				</button>
			{/each}
		</div>
		{#if needsClient}
			<div class="ct2-empty">Pilih klien untuk melihat order mereka.</div>
		{:else if categoryOrders.length === 0}
			<div class="ct2-empty">Tidak ada order pada kategori ini.</div>
		{:else}
			<div class="spot-order-scroll">
				<table class="spot-order-table" style="min-width:1000px;">
					<thead><tr><th>Tipe Pengiriman</th><th>ID Order</th><th>Klien</th><th>Rute</th><th>Armada</th><th>Status</th><th>Posisi (FMS)</th><th></th></tr></thead>
					<tbody>
						{#each categoryOrders as o (o.id)}
							{@const v = liveFor(o)}
							<tr class={o.id === selectedOrder?.id ? 'ct2-row-active' : ''} onclick={() => selectOrderRow(o)} style="cursor:pointer;">
								<td><span class="badge badge-active">{kindLabel(o)}</span></td>
								<td class="mono">{o.orderNumber}</td>
								<td>{klien(o)}</td>
								<td>{routeLabel(o)}</td>
								<td>{o.truckPoliceNumber ?? '—'}{v?.driver?.name ? ` · ${v.driver.name}` : ''}</td>
								<td><span class="badge badge-wait">{o.statusAlias ?? o.status ?? o.statusCode}</span></td>
								<td>
									{#if v}<span class="ct2-dot" style="background:{STATE_COLOUR[v.drive_state]}"></span> {where(v)} · {Math.round(v.position?.speed ?? 0)} km/j
									{:else}<span class="hint">tidak di FMS</span>{/if}
								</td>
								<td><button type="button" class="frozen-icon-btn" title="Lihat di peta" onclick={(e) => { e.stopPropagation(); selectOrderRow(o); }}><ZoomIn size={14} /></button></td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
