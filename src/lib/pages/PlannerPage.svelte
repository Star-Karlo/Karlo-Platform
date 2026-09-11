<script lang="ts">
	import { onMount } from 'svelte';
	import { Map } from 'lucide-svelte';
	import { truckStore, truckActions } from '$lib/stores/trucks';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { formatDate, truckMarkerColor } from '$lib/utils/format';
	import { asset, TRUCK_MARKER } from '$lib/constants/assets';
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

	onMount(async () => {
		await Promise.all([
			truckActions.getAll({ pageSize: 100 }),
			warehouseActions.getAll({ pageSize: 100 })
		]);
		// Orders that still need a truck: everything the machine allows to be
		// planned, before a driver has been assigned.
		await orderActions.getAll({
			page: 0,
			pageSize: 10,
			filtered: [{ id: 'statusCode', value: ['approved', 'readyToPlan'], type: 'in' }]
		});
	});

	/**
	 * Truck positions.
	 *
	 * A truck record from master data carries no position — telematics lives on
	 * /api/v1/trackers, which is not wired up here yet and currently returns no
	 * devices. Until it is, this filter yields nothing and the map is empty,
	 * which the card below says out loud rather than looking broken.
	 */
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

	let truckMarkers = $derived<MapMarker[]>(
		($truckStore.trucks as any[])
			.filter((t: any) => t.lastLocation?.latitude && t.lastLocation?.longitude)
			.map((t: any) => ({
				id: t.id,
				lat: t.lastLocation.latitude,
				lng: t.lastLocation.longitude,
				color: truckMarkerColor(t.status ?? t.statusCode ?? ''),
				// The pin artwork from the old app; the colour above is the
				// fallback if the image cannot be fetched.
				icon: TRUCK_MARKER[t.status ?? t.statusCode ?? ''] ?? TRUCK_MARKER.unpaired,
				iconWidth: 18,
				iconHeight: 40,
				title: t.policeNumber,
				subtitle: t.status ?? t.statusCode ?? 'unknown'
			}))
	);

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
		subtitle="{$truckStore.trucks.length} trucks · {truckMarkers.length} reporting a position · {warehouseMarkers.length} points"
	/>

	<div class="grid grid-cols-1 gap-gutter lg:grid-cols-3">
		<div class="lg:col-span-2">
			<Card title="Fleet Map" padded={false}>
				<div class="space-y-3 px-6 pb-6 pt-4">
					<MapView {markers} fitToMarkers class="h-[500px]" />
					{#if truckMarkers.length === 0}
						<p class="text-xs italic text-muted">
							Loading and unloading points are shown. Truck positions are not: the
							telemetry service that reports them is not built yet, so the fleet layer
							stays empty rather than showing trucks in the wrong place.
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
