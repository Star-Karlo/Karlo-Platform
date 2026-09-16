// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const AGREEMENT_TYPE_OPTIONS = [
  { value: 'single-shipment', label: 'Single Shipment' },
  { value: 'multi-shipment', label: 'Multi Shipment' },
]

export function agreementTypeLabel(value) {
  return AGREEMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label || '-'
}
