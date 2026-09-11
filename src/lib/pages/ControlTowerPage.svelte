<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MapPin, Truck, Check, AlertCircle } from 'lucide-svelte';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { MapView, Select, type MapMarker } from '$lib/components/ui';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { TRUCK_MARKER } from '$lib/constants/assets';

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
	let markers = $derived.by<MapMarker[]>(() => {
		const out: MapMarker[] = [];
		for (const o of visibleOrders) {
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
				subtitle: `${klien(o)} · ${o.status ?? o.statusCode}`
			});
		}
		return out;
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
				<AlertCircle size={13} />
				<span>
					Menampilkan {markers.length} armada dari kategori "{category?.label}" — posisi
					berbasis lokasi gudang order, bukan koordinat GPS langsung.
					{#if visibleOrders.length > markers.length}
						{visibleOrders.length - markers.length} order tidak dipetakan karena gudangnya
						belum punya koordinat.
					{/if}
				</span>
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
						<!-- Honest empty state: no tracker has a producer yet, so
						     there is no telemetry to show for any truck. -->
						<div class="ct-detail-card-empty">
							Telemetri belum tersedia — perangkat GPS belum terhubung ke armada ini.
						</div>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
