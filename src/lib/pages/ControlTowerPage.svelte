<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { MapPin, Truck, Check, AlertCircle } from 'lucide-svelte';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { MapView, Select, type MapMarker } from '$lib/components/ui';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { TRUCK_MARKER } from '$lib/constants/assets';
	import {
		fetchLiveFleet, fetchLiveVehicle, truckIcon, plateKey, addressLine, curatedSensors,
		STATE_LABEL, STATE_COLOUR, LIVE_POLL_MS, type LiveVehicle, type SensorReading
	} from '$lib/fms/live';

	/**
	 * Control Tower — every live order, and where its truck is.
	 *
	 * Laid out as the console's own: a KPI strip that filters, an Order Control
	 * list on the left, and the map on the right. Choosing a KPI card narrows
	 * both the list and the markers, which is what makes the strip a control
	 * rather than a read-out.
	 */
	let { basePath }: { basePath: string } = $props();

	/**
	 * The KPI categories, each a set of the business service's own status codes.
	 *
	 * They are sets rather than single statuses because a card answers an
	 * operational question ("what is on the road?") that spans more than one
	 * state. Every code here is real — see models/status.go — so a card's count
	 * and the rows it reveals can never disagree.
	 */
	const CATEGORIES: { key: string; label: string; statuses: string[]; kinds?: string[] }[] = [
		{ key: 'planned', label: 'Order Planned', statuses: ['approved', 'readyToPlan'] },
		{ key: 'single', label: 'Order Single Shipment', statuses: ['assigned', 'inTransit'], kinds: ['standard'] },
		{ key: 'threepl', label: 'Order 3PL', statuses: ['assigned', 'inTransit'], kinds: ['threepl'] },
		{ key: 'empty', label: 'Empty Order', statuses: ['assigned', 'inTransit'], kinds: ['empty'] },
		{ key: 'toLoading', label: 'Menuju Lokasi Muat', statuses: ['assigned'] },
		{ key: 'transit', label: 'Dalam Perjalanan', statuses: ['inTransit'] },
		{ key: 'delivered', label: 'Terkirim — Menunggu POD', statuses: ['delivered'] },
		{ key: 'done', label: 'Selesai', statuses: ['completed'] }
	];

	let activeCategory = $state('single');
	let statusFilter = $state('');

	onMount(() => {
		// One wide page rather than per-category calls: the strip needs counts
		// across every category at once, and filtering client-side keeps a card
		// click instant instead of a round trip.
		void orderActions.getAll({ page: 0, pageSize: 200 });
		void warehouseActions.getAll({ pageSize: 200 });
		void customerActions.getAll({ pageSize: 200 });
	});

	let allOrders = $derived($orderStore.orders ?? []);

	// --- The live fleet, from FMS -------------------------------------------
	//
	// FMS owns telemetry. Once a minute (its own map's cadence; the route is
	// uncached) the whole fleet for the company in view is fetched through
	// the console's proxy, and every truck with a fix is drawn where it is —
	// not where its order's warehouse is. A company without FMS gets the
	// warehouse fallback, and the caption says which is which.
	let live = $state<LiveVehicle[]>([]);
	let liveError = $state('');
	let liveAt = $state<Date | null>(null);
	let liveTimer: ReturnType<typeof setInterval> | undefined;

	async function refreshLive() {
		try {
			live = await fetchLiveFleet();
			liveAt = new Date();
			liveError = '';
		} catch (e: any) {
			// 403/404 = this company is not on FMS; anything else is a fault.
			live = [];
			liveError = /403|404/.test(String(e?.message)) ? '' : 'Telemetri FMS tidak dapat dimuat.';
		}
	}

	onMount(() => {
		void refreshLive();
		liveTimer = setInterval(() => void refreshLive(), LIVE_POLL_MS);
	});
	onDestroy(() => clearInterval(liveTimer));

	// Acting for a different company means a different fleet.
	let lastActing = $state('');
	$effect(() => {
		const id = $actingFor.companyId;
		if (id !== lastActing) {
			lastActing = id;
			void refreshLive();
		}
	});

	/** Live vehicle by master-data id (when FMS publishes it) and by plate (always). */
	let liveById = $derived(new Map(live.filter((v) => v.master_data_id).map((v) => [v.master_data_id as string, v])));
	let liveByPlate = $derived(new Map(live.map((v) => [plateKey(v.license_plate), v])));

	function liveFor(o: { truckId?: string; truckPoliceNumber?: string }): LiveVehicle | undefined {
		return (o.truckId && liveById.get(o.truckId)) || liveByPlate.get(plateKey(o.truckPoliceNumber));
	}

	/**
	 * Karlo staff carry no company of their own, so every company-scoped read
	 * is refused until they pick a client to act for. Rendering zeros in that
	 * state is indistinguishable from "a quiet day", which is how someone ends
	 * up reporting an empty Control Tower as a bug.
	 */
	let needsClient = $derived(
		$authStore.user?.isPlatformStaff && !$actingFor.companyId && !!$orderStore.error
	);

	function inCategory(o: any, c: (typeof CATEGORIES)[number]): boolean {
		if (!c.statuses.includes(o.statusCode)) return false;
		if (c.kinds && !c.kinds.includes(o.orderKind ?? 'standard')) return false;
		return true;
	}

	let counts = $derived(
		Object.fromEntries(CATEGORIES.map((c) => [c.key, allOrders.filter((o) => inCategory(o, c)).length]))
	);

	let category = $derived(CATEGORIES.find((c) => c.key === activeCategory));
	let categoryOrders = $derived(category ? allOrders.filter((o) => inCategory(o, category)) : []);

	/** The distinct statuses present, so the filter offers only what exists. */
	let statusOptions = $derived(
		[...new Set(categoryOrders.map((o) => o.statusCode).filter((c): c is string => !!c))].map(
			(code) => ({
				value: code,
				label: categoryOrders.find((o) => o.statusCode === code)?.status ?? code
			})
		)
	);

	let visibleOrders = $derived(
		statusFilter ? categoryOrders.filter((o) => o.statusCode === statusFilter) : categoryOrders
	);

	let selectedId = $state('');
	let selectedOrder = $derived(visibleOrders.find((o) => o.id === selectedId) ?? null);

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

	/**
	 * The milestones a row shows, ticked from the order's own status.
	 *
	 * Derived from the lifecycle position rather than stored: a checklist that
	 * is written separately from the status is a checklist that will eventually
	 * disagree with it.
	 */
	const LIFECYCLE = ['approved', 'readyToPlan', 'assigned', 'inTransit', 'delivered', 'completed'];
	function milestones(o: any) {
		const at = LIFECYCLE.indexOf(o.statusCode);
		return [
			{ key: 'plan', label: 'Direncanakan', done: at >= 1 },
			{ key: 'assign', label: 'Armada Ditugaskan', done: at >= 2 },
			{ key: 'transit', label: 'Dalam Perjalanan', done: at >= 3 },
			{ key: 'pod', label: 'Terkirim', done: at >= 4 }
		];
	}

	/**
	 * Where each truck is drawn.
	 *
	 * Position comes from the WAREHOUSE the order is heading to or sitting at,
	 * not from GPS — no tracker has a producer yet, so there is no live
	 * coordinate to plot. The caption under the map says so, because a marker
	 * that looks live but is not is worse than no marker.
	 */
	/** Orders in view drawn at their truck's GPS fix when FMS has one, else at the warehouse. */
	let markers = $derived.by<MapMarker[]>(() => {
		const out: MapMarker[] = [];
		const placed = new Set<number>();
		for (const o of visibleOrders) {
			const v = liveFor(o);
			if (v?.position?.lat != null && v.position.lon != null) {
				placed.add(v.vehicle_id);
				out.push({
					id: o.id,
					lng: v.position.lon,
					lat: v.position.lat,
					icon: truckIcon(v.drive_state),
					iconWidth: 22,
					iconHeight: 44,
					heading: v.position.bearing ?? 0,
					title: v.license_plate,
					subtitle: `${klien(o)} · ${STATE_LABEL[v.drive_state]}${v.position.speed != null ? ` · ${Math.round(v.position.speed)} km/j` : ''}`
				});
				continue;
			}
			const atOrigin = o.statusCode === 'assigned' || o.statusCode === 'approved' || o.statusCode === 'readyToPlan';
			const c = coordsOf(atOrigin ? o.originWarehouseId : o.destinationWarehouseId) ?? coordsOf(o.originWarehouseId);
			if (!c) continue;
			out.push({
				id: o.id,
				lng: c[0],
				lat: c[1],
				icon: TRUCK_MARKER[o.statusCode === 'inTransit' ? 'onDuty' : 'waitingDepartureOrder'],
				iconWidth: 34,
				iconHeight: 34,
				title: o.truckPoliceNumber || o.orderNumber,
				subtitle: `${klien(o)} · ${o.status ?? o.statusCode} · posisi gudang`
			});
		}
		// The rest of the fleet, so the map is the whole yard and not only the
		// trucks with an order in this category — an idle truck is a fact a
		// planner wants to see.
		if (showWholeFleet) {
			for (const v of live) {
				if (placed.has(v.vehicle_id) || v.position?.lat == null || v.position.lon == null) continue;
				out.push({
					id: `fms-${v.vehicle_id}`,
					lng: v.position.lon,
					lat: v.position.lat,
					icon: truckIcon(v.drive_state),
					iconWidth: 18,
					iconHeight: 36,
					heading: v.position.bearing ?? 0,
					title: v.license_plate,
					subtitle: `${STATE_LABEL[v.drive_state]}${v.driver?.name ? ` · ${v.driver.name}` : ''}`
				});
			}
		}
		return out;
	});

	let showWholeFleet = $state(true);
	let liveOnOrders = $derived(visibleOrders.filter((o) => liveFor(o)?.position?.lat != null).length);
	let fleetSummary = $derived.by(() => {
		const n: Record<string, number> = { moving: 0, idle: 0, parking: 0, offline: 0 };
		for (const v of live) n[v.drive_state] = (n[v.drive_state] ?? 0) + 1;
		return n;
	});

	// --- Sensors for the selected order's truck ------------------------------
	let sensors = $state<SensorReading[]>([]);
	let sensorVehicle = $state<LiveVehicle | null>(null);
	$effect(() => {
		const o = selectedOrder;
		const v = o ? liveFor(o) : undefined;
		sensors = [];
		sensorVehicle = null;
		if (!v) return;
		fetchLiveVehicle(v.vehicle_id).then((full) => {
			if (!full) return;
			sensorVehicle = full;
			sensors = curatedSensors(full.position?.metadata);
		}).catch(() => {});
	});

	/** The selected order's lane, drawn straight — the planned geometry needs the routes endpoint. */
	let lines = $derived.by(() => {
		if (!selectedOrder) return [];
		const a = coordsOf(selectedOrder.originWarehouseId);
		const b = coordsOf(selectedOrder.destinationWarehouseId);
		return a && b ? [{ id: selectedOrder.id, coordinates: [a, b] as [number, number][], dashed: true }] : [];
	});

	function selectCategory(key: string) {
		activeCategory = key;
		statusFilter = '';
		selectedId = '';
	}
</script>

<div class="card ct-shell">
	<div class="ct-kpi-strip">
		{#each CATEGORIES as c (c.key)}
			<button
				type="button"
				class="ct-kpi {activeCategory === c.key ? 'active' : ''}"
				onclick={() => selectCategory(c.key)}
			>
				<div class="ct-kpi-num">{counts[c.key] ?? 0}</div>
				<div class="ct-kpi-label">{c.label}</div>
			</button>
		{/each}
	</div>

	{#if needsClient}
		<div class="note-banner" role="status" style="margin:12px 16px;">
			<span>🏢</span>
			<div>
				You are acting as <b>Karlo</b> with no client selected, and Karlo has no orders of its
				own — so there is nothing to show. Choose a client in the bar above to see theirs.
			</div>
		</div>
	{:else if $orderStore.error}
		<div class="note-banner note-banner-error" role="alert" style="margin:12px 16px;">
			<span>⛔</span><div>{$orderStore.error}</div>
		</div>
	{/if}

	<div class="ct-middle">
		<div class="ct-oc-panel" style="width:340px;">
			<div class="ct-oc-head">
				<div class="ct-oc-head-row">
					<h3>Order Control</h3>
					{#if statusOptions.length > 1}
						<div style="width:140px;">
							<Select bind:value={statusFilter} options={statusOptions} placeholder="Semua" />
						</div>
					{/if}
				</div>
				<div class="ct-oc-sub"><span class="cat">{category?.label}</span></div>
			</div>

			{#if $orderStore.loading}
				<div class="ct-oc-empty">Memuat…</div>
			{:else if needsClient}
				<div class="ct-oc-empty">Pilih klien di bar atas untuk melihat order mereka.</div>
			{:else if $orderStore.error}
				<div class="ct-oc-empty">Order tidak dapat dimuat.</div>
			{:else if visibleOrders.length === 0}
				<div class="ct-oc-empty">
					{statusFilter
						? 'Tidak ada order dengan status ini.'
						: 'Tidak ada order pada kategori ini.'}
				</div>
			{:else}
				<div class="ct-oc-list">
					{#each visibleOrders as o (o.id)}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="ct-oc-row {selectedId === o.id ? 'active' : ''}"
							onclick={() => (selectedId = selectedId === o.id ? '' : o.id)}
						>
							<div class="ct-oc-status">
								<span class="badge badge-planner">{o.status ?? o.statusCode}</span>
							</div>
							<div class="ct-oc-customer">{klien(o)}</div>
							<div class="ct-oc-id mono">{o.orderNumber} · {o.orderKind ?? 'standard'}</div>
							<div class="ct-oc-route"><MapPin size={12} /> {routeLabel(o)}</div>
							<div class="ct-oc-fleet">
								<Truck size={12} />
								<span class="plate mono">{o.truckPoliceNumber || 'Belum ada armada'}</span>
							</div>
							<div class="ct-oc-milestones">
								{#each milestones(o) as m (m.key)}
									<div class="ct-oc-milestone {m.done ? 'done' : ''}">
										<span class="ct-oc-milestone-dot">
											{#if m.done}<Check size={9} />{/if}
										</span>
										<span>{m.label}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<div class="ct-map-card">
			<MapView {markers} {lines} fitToMarkers={markers.length > 0} class="ct-map-canvas" />
			<div class="ct-map-caption">
				{#if live.length > 0}
					<Truck size={13} />
					<span>
						Posisi GPS dari FMS{liveAt ? `, ${liveAt.toLocaleTimeString('id-ID')}` : ''} —
						<span style="color:{STATE_COLOUR.moving}">●</span> {fleetSummary.moving} bergerak
						<span style="color:{STATE_COLOUR.idle}">●</span> {fleetSummary.idle} idle
						<span style="color:{STATE_COLOUR.parking}">●</span> {fleetSummary.parking} parkir
						<span style="color:{STATE_COLOUR.offline}">●</span> {fleetSummary.offline} offline.
						{liveOnOrders} dari {visibleOrders.length} order kategori ini terpetakan lewat GPS;
						sisanya di lokasi gudang.
					</span>
					<label class="ct-fleet-toggle">
						<input type="checkbox" bind:checked={showWholeFleet} /> seluruh armada
					</label>
				{:else}
					<AlertCircle size={13} />
					<span>
						{liveError || `Menampilkan ${markers.length} armada dari kategori "${category?.label}" — posisi berbasis lokasi gudang order; telemetri FMS tidak tersedia untuk perusahaan ini.`}
					</span>
				{/if}
			</div>
		</div>
	</div>

	{#if selectedOrder}
		<div class="ct-detail-panel">
			<div class="ct-oc-head">
				<h3>{selectedOrder.orderNumber} · {klien(selectedOrder)}</h3>
				<div class="ct-detail-head-actions">
					<button
						type="button"
						class="mini-icon-btn ct-widget-toggle"
						onclick={() => goto(`${basePath.replace('/control-tower', '')}/order/${selectedOrder.id}`)}
					>
						<span>Detail Order</span>
					</button>
					<button type="button" class="mini-icon-btn" title="Tutup" onclick={() => (selectedId = '')}>
						×
					</button>
				</div>
			</div>
			<div class="ct-detail-body">
				<div class="ct-detail-cards">
					<div class="ct-detail-card">
						<div class="ct-cargo-head"><h4>Rute</h4></div>
						<div class="ct-route-table">
							<div class="ct-route-row">
								<span class="ct-route-field">Muat</span>
								<span class="ct-route-value">{selectedOrder.originWarehouseName || '—'}</span>
							</div>
							<div class="ct-route-row">
								<span class="ct-route-field">Bongkar</span>
								<span class="ct-route-value">{selectedOrder.destinationWarehouseName || '—'}</span>
							</div>
						</div>
					</div>
					<div class="ct-detail-card">
						<div class="ct-cargo-head"><h4>Armada</h4></div>
						<div class="ct-route-table">
							<div class="ct-route-row">
								<span class="ct-route-field">Nomor Polisi</span>
								<span class="ct-route-value mono">{selectedOrder.truckPoliceNumber || 'Belum ditugaskan'}</span>
							</div>
							<div class="ct-route-row">
								<span class="ct-route-field">Status</span>
								<span class="ct-route-value">{selectedOrder.status ?? selectedOrder.statusCode}</span>
							</div>
						</div>
					</div>
					<div class="ct-detail-card">
						<div class="ct-telemetry-head"><span class="ct-telemetry-head-title">Sensors &amp; Telemetry</span></div>
						{#if sensorVehicle}
							{@const pos = sensorVehicle.position}
							<div class="ct-telemetry-grid">
								<div class="ct-telemetry-row"><span>Status</span><b style="color:{STATE_COLOUR[sensorVehicle.drive_state]}">{STATE_LABEL[sensorVehicle.drive_state]}</b></div>
								{#if pos?.speed != null}<div class="ct-telemetry-row"><span>Kecepatan</span><b>{Math.round(pos.speed)} km/j</b></div>{/if}
								{#if pos?.ignition != null}<div class="ct-telemetry-row"><span>Mesin</span><b>{pos.ignition ? 'Hidup' : 'Mati'}</b></div>{/if}
								{#if pos?.time}<div class="ct-telemetry-row"><span>Posisi terakhir</span><b>{new Date(pos.time).toLocaleString('id-ID')}</b></div>{/if}
								{#if addressLine(pos)}<div class="ct-telemetry-row ct-telemetry-wide"><span>Lokasi</span><b>{addressLine(pos)}</b></div>{/if}
								{#if sensorVehicle.driver?.name}<div class="ct-telemetry-row"><span>Pengemudi (FMS)</span><b>{sensorVehicle.driver.name}</b></div>{/if}
								{#if sensorVehicle.tracker?.imei}<div class="ct-telemetry-row"><span>Perangkat</span><b class="mono">{sensorVehicle.tracker.imei}</b></div>{/if}
								{#each sensors as r}
									<div class="ct-telemetry-row"><span>{r.label}</span><b>{r.value}</b></div>
								{/each}
							</div>
						{:else}
							<div class="ct-detail-card-empty">
								{#if live.length === 0}
									Telemetri belum tersedia — perusahaan ini belum terhubung ke FMS.
								{:else}
									Truk order ini belum dikenali di FMS (cocokkan nomor polisi di Master Data).
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
