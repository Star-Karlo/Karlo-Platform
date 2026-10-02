// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Shared "Type Pengiriman" label — used by both Planner Allocate's order
// list and Control Tower's Order Control panel, so the two never drift on
// what counts as Single/Multi Shipment.
//
// LTL only ever applies once an order has actually been paired to a truck
// as part of a combined group (Planner Allocate's "Set LTL" panel — see
// assignTruckLtl in PlannerAllocateView.vue, which sets detail.isLtl). Open
// (not-yet-assigned) orders can never be LTL yet, so Planner Allocate's own
// "Open Orders" list — which only ever lists unassigned orders — will
// naturally only ever show Single/Multi for that reason, not because LTL is
// excluded here.
//
// Multi Shipment only applies to Order Kontrak, the only source that can
// carry more than one loading/unloading point on a single order. Spot Order
// has no multi-point model at all, so it's always Single unless flagged LTL.
export function shipmentTypeLabel(o) {
  if (o.detail?.isLtl) return 'LTL'
  // Several customers' goods on one truck. Read from the order's own record
  // of whose each shipment is, not from the agreement, because the order is
  // what was actually placed — an agreement may cover several customers and
  // an order under it still name only one.
  const customers = o.shipmentCustomers || o.detail?.shipmentCustomers || []
  if (new Set(customers.filter(Boolean)).size > 1) return 'Multi Customer'
  const loadCount = (o.loadingPoints || []).length
  const unloadCount = (o.unloadingPoints || []).length
  if (loadCount > 1 || unloadCount > 1) return 'Multi Shipment'
  return 'Single Shipment'
}
