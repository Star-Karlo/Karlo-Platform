// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// "Order Safety" isn't backed by an existing system concept yet — this is a
// reasonable starting option set (security/insurance handling level for the
// shipment) until product defines the real list.
export const ORDER_SAFETY_OPTIONS = [
  { value: 'standard', label: 'Standar' },
  { value: 'gps-tracking', label: 'GPS Tracking' },
  { value: 'security-escort', label: 'Kawalan Keamanan' },
  { value: 'high-value', label: 'Barang Bernilai Tinggi' },
]

export function orderSafetyLabel(value) {
  return ORDER_SAFETY_OPTIONS.find((o) => o.value === value)?.label || '-'
}
