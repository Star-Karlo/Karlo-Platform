/**
 * Empty Order's own status taxonomy — ported 1:1 from the prototype's
 * src/utils/emptyOrderStatus.js.
 *
 * An Empty Order is a truck trip with NO cargo: repositioning, or deadheading
 * back to base. It is kept apart from Spot Order's taxonomy deliberately — a
 * cargo-less run has nothing to do with a shipper-facing pipeline.
 *
 * The lifecycle, as the driver app drives it:
 *   1. dibuat            — the planner creates it
 *   2. driver_menyetujui — the driver accepts it in K-Trip
 *   3. berangkat         — the driver leaves the geofence at the start point
 *   4. selesai           — the driver finishes it in K-Trip
 *
 * `diedit` is not a step in that sequence. It is a thing that can happen at
 * any point and lands in the history without replacing whichever of the four
 * is current, so it has a label but is not offered as a filter.
 */
export interface EmptyOrderStatusMeta {
	label: string;
	badge: string;
}

const EMPTY_ORDER_STATUSES: Record<string, EmptyOrderStatusMeta> = {
	dibuat: { label: 'Empty Order Dibuat', badge: 'badge-wait' },
	driver_menyetujui: { label: 'Driver Menyetujui', badge: 'badge-planner' },
	berangkat: { label: 'Berangkat Sesuai Titik Awal', badge: 'badge-planner' },
	diedit: { label: 'Order Ngosong Diedit', badge: 'badge-wait' },
	selesai: { label: 'Order Ngosong Selesai', badge: 'badge-active' }
};

export function emptyOrderStatusLabel(status: string | null | undefined): string {
	return (status && EMPTY_ORDER_STATUSES[status]?.label) || status || '-';
}

export function emptyOrderStatusBadgeClass(status: string | null | undefined): string {
	return (status && EMPTY_ORDER_STATUSES[status]?.badge) || 'badge-wait';
}

/** The four real statuses, for the list page's filter. `diedit` is absent
 *  because an order is never in it. */
export const EMPTY_ORDER_STATUS_LIST = (['dibuat', 'driver_menyetujui', 'berangkat', 'selesai'] as const).map(
	(key) => ({ key, label: EMPTY_ORDER_STATUSES[key].label })
);

/** Finished, and so belonging to History rather than Active — the same
 *  boundary every other order list in this console draws. */
export function isEmptyOrderHistoryStatus(status: string | null | undefined): boolean {
	return status === 'selesai';
}
