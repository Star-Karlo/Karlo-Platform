<script lang="ts">
	import { onMount } from 'svelte';
	import { Map } from 'lucide-svelte';
	import { truckStore, truckActions } from '$lib/stores/trucks';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { formatDate, truckMarkerColor } from '$lib/utils/format';
	import { asset, TRUCK_MARKER } from '$lib/constants/assets';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		fetchLiveFleet,
		hasFix,
		plateKey,
		STATE_LABEL,
		addressLine,
		type LiveVehicle
	} from '$lib/fms/live';
	import {
		Card,
		EmptyState,
		MapView,
		PageHeader,
		Spinner,
		StatusBadge,
		type MapMarker
	} from '$lib/components/ui';

	let { basePath, title = 'Planner' }: { basePath: string; title?: string } = $props();

	interface FleetPosition {
		truckId: string;
		policeNumber: string;
		status: string;
		isAvailable: boolean;
		lat: number;
		lon: number;
		at: string;
		source: 'live' | 'lastDrop';
		city?: string;
	}
	let positions = $state<FleetPosition[]>([]);
	let fmsFleet = $state<LiveVehicle[]>([]);
	let positionsError = $state('');

	/** Every 60s, the same cadence Control Tower and the geofence watcher use. */
	const REFRESH_MS = 60_000;

	/**
	 * Two sources, same as the rest of the console: FMS's live view first (the
	 * one Control Tower draws, through the console's proxy with the caller's
	 * own token), then the business service's /fleet/live, which adds the last
	 * unloading point for a truck FMS has no fix for. Either may be down
	 * without taking the other with it.
	 */
	async function loadPositions() {
		const [fms, ours] = await Promise.allSettled([fetchLiveFleet(), api.get(ENDPOINTS.fleet.live)]);
		if (fms.status === 'fulfilled') fmsFleet = fms.value;
		if (ours.status === 'fulfilled') {
			positions = Array.isArray(ours.value.data) ? ours.value.data : [];
		}
		positionsError =
			fms.status === 'rejected' && ours.status === 'rejected'
				? ours.reason instanceof Error
					? ours.reason.message
					: 'Fleet positions unavailable'
				: '';
	}

	onMount(() => {
		void Promise.all([
			truckActions.getAll({ pageSize: 100 }),
			warehouseActions.getAll({ pageSize: 100 }),
			loadPositions()
		]);
		const timer = setInterval(loadPositions, REFRESH_MS);
		return () => clearInterval(timer);
	});

	onMount(async () => {
		// Orders that still need a truck: everything the machine allows to be
		// planned, before a driver has been assigned.
		await orderActions.getAll({
			page: 0,
			pageSize: 10,
			filtered: [{ id: 'statusCode', value: ['approved', 'readyToPlan'], type: 'in' }]
		});
	});

	/** Loading and unloading points. These carry real coordinates today. */
	let warehouseMarkers = $derived<MapMarker[]>(
		$warehouseStore.warehouses
			.filter((w) => w.location?.coordinates?.length === 2)
			.map((w) => ({
				id: `wh-${w.id}`,
				lng: w.location!.coordinates[0],
				lat: w.location!.coordinates[1],
				color: '#0D2555',
				title: w.name ?? 'Warehouse',
				subtitle: w.address ?? ''
			}))
	);

	/**
	 * Truck positions come from /fleet/live: a live telemetry fix where the
	 * truck has a reporting device, otherwise the last unloading point it was
	 * seen at. A truck with neither is not drawn — no guess at the depot.
	 */
	let truckMarkers = $derived.by<MapMarker[]>(() => {
		const seen = new Set<string>();
		const out: MapMarker[] = [];
		for (const v of fmsFleet) {
			if (!hasFix(v.position)) continue;
			seen.add(plateKey(v.license_plate));
			const status =
				v.drive_state === 'offline' ? 'inactive' : v.drive_state === 'moving' ? 'onDuty' : 'active';
			out.push({
				id: `fms-${v.vehicle_id}`,
				lat: v.position.lat,
				lng: v.position.lon,
				color: truckMarkerColor(status),
				icon: TRUCK_MARKER[status] ?? TRUCK_MARKER.unpaired,
				iconWidth: 18,
				iconHeight: 40,
				title: v.license_plate,
				subtitle: [STATE_LABEL[v.drive_state], v.driver?.name, addressLine(v.position)]
					.filter(Boolean)
					.join(' · ')
			});
		}
		for (const p of positions) {
			if (seen.has(plateKey(p.policeNumber))) continue;
			// An active truck that is busy is on duty; an available one is idle.
			const status = p.status === 'active' && !p.isAvailable ? 'onDuty' : p.status;
			out.push({
				id: p.truckId,
				lat: p.lat,
				lng: p.lon,
				color: truckMarkerColor(status),
				icon: TRUCK_MARKER[status] ?? TRUCK_MARKER.unpaired,
				iconWidth: 18,
				iconHeight: 40,
				title: p.policeNumber,
				subtitle:
					(p.source === 'live' ? 'Live' : 'Last drop') +
					(p.city ? ` · ${p.city}` : '') +
					` · ${formatDate(p.at)}`
			});
		}
		return out;
	});

	let markers = $derived([...warehouseMarkers, ...truckMarkers]);

	/** The legend swatches are their own 81x18 artwork, not the map pins. */
	const LEGEND = [
		{ label: 'On Duty', src: asset('icon/legend-planner/truckOnduty.png') },
		{ label: 'Available', src: asset('icon/legend-planner/truckIdle.png') },
		{ label: 'Planned', src: asset('icon/legend-planner/truckPlanned.png') },
		{ label: 'Empty Order', src: asset('icon/legend-planner/truckEmpty.png') },
		{ label: 'Not Available', src: asset('icon/legend-planner/truckUnavailable.png') },
		{ label: 'Other', src: asset('icon/legend-planner/truckOther.png') }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={Map}
		subtitle="{$truckStore.trucks
			.length} trucks · {truckMarkers.length} reporting a position · {warehouseMarkers.length} points"
	/>

	<div class="grid grid-cols-1 gap-gutter lg:grid-cols-3">
		<div class="lg:col-span-2">
			<Card title="Fleet Map" padded={false}>
				<div class="space-y-3 px-6 pb-6 pt-4">
					<MapView {markers} fitToMarkers class="h-[500px]" />
					{#if positionsError}
						<p class="text-xs italic text-danger">Fleet positions: {positionsError}</p>
					{:else if truckMarkers.length === 0}
						<p class="text-xs italic text-muted">
							Loading and unloading points are shown. No truck has reported a position yet: a truck appears
							here once its tracker sends a fix to the telemetry service, or once it completes a shipment and
							its last unloading point is known.
						</p>
					{/if}
				</div>
			</Card>
		</div>

		<div class="space-y-gutter">
			<Card title="Unassigned Orders">
				{#if $orderStore.loading}
					<div class="flex justify-center py-6"><Spinner /></div>
				{:else if $orderStore.orders.length === 0}
					<EmptyState message="No orders waiting to be planned" />
				{:else}
					<ul class="scroll-cyan max-h-[400px] space-y-2 overflow-y-auto pr-1">
						{#each $orderStore.orders as order}
							<li>
								<a
									href="{basePath}/order/{order.id}"
									class="block rounded-nav border border-line-card p-3 hover:border-cyan"
								>
									<div class="flex items-center justify-between gap-2">
										<span class="truncate text-xs font-medium text-ink">{order.orderNumber}</span>
										<StatusBadge statusCode={order.statusCode ?? ''} label={order.statusAlias ?? ''} />
									</div>
									<p class="mt-1 text-xs text-muted">Pickup {formatDate(order.pickupAt)}</p>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</Card>

			<Card title="Truck Status">
				<ul class="grid grid-cols-2 gap-3 text-xs text-muted">
					{#each LEGEND as entry}
						<li class="flex items-center gap-2">
							<img src={entry.src} alt="" width="27" height="6" class="shrink-0" />
							{entry.label}
						</li>
					{/each}
				</ul>
			</Card>
		</div>
	</div>
</div>
