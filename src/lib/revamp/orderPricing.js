// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Rough order-value estimate derived from an Agreement's pricing type.
// per-kg scales with the shipment's declared tonnage; other pricing types
// (per-trip, per-ritase, per-km, lumpsum) don't have enough data in the
// wizard yet to compute a precise total, so the base tarif is used as-is.
export function estimatedOrderValue(agreement, shipment) {
  if (!agreement) return 0
  if (agreement.pricingType === 'per-kg') return agreement.tarif * (Number(shipment.totalTonnage) || 0)
  return agreement.tarif || 0
}

// Same total the Invoice page (OrderKontrakInvoiceView.vue) shows as
// "Sub Total Shipment" — factored out here so other pages (the Jurnal/
// Laporan auto-postings) recognize the exact same revenue figure instead of
// re-deriving it and risking drift.
export function computeInvoiceTotal(order, agreement) {
  const detail = order?.detail || {}
  const finalTonnage = detail.invoiceFinal?.totalTonnage ?? (order?.totalTonnage || 0)
  const baseRate = estimatedOrderValue(agreement, { totalTonnage: finalTonnage })
  const needsPricing = detail.invoiceFinal?.additionalNeedsPricing || {}
  const needsTotal = Object.values(needsPricing).reduce((sum, v) => sum + (Number(v) || 0), 0)
  const transportCost = baseRate + needsTotal
  const pakaiMinimum = !!detail.invoiceFinal?.pakaiHargaMinimum
  const hargaMinimal = Number(detail.invoiceFinal?.hargaMinimal) || 0
  return pakaiMinimum && hargaMinimal > transportCost ? hargaMinimal : transportCost
}
