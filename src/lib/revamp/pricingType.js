// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const PRICING_TYPE_OPTIONS = [
  { value: 'per-kg', label: 'Per-Kg' },
  { value: 'per-truk', label: 'Per-Truk' },
  { value: 'per-meter-cubic', label: 'Per-Meter Cubic' },
  { value: 'per-pallet', label: 'Per-Pallet' },
  { value: 'per-zak', label: 'Per-Zak' },
  { value: 'per-unit', label: 'Per-Unit' },
  { value: 'per-pcs', label: 'Per-Pcs' },
]

export function pricingTypeLabel(value) {
  return PRICING_TYPE_OPTIONS.find((o) => o.value === value)?.label || '-'
}
