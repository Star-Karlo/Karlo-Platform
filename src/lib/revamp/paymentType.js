// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const PAYMENT_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash / Bayar Langsung' },
  { value: 'top7', label: 'TOP 7 Hari' },
  { value: 'top14', label: 'TOP 14 Hari' },
  { value: 'top30', label: 'TOP 30 Hari' },
  { value: 'top45', label: 'TOP 45 Hari' },
  { value: 'top60', label: 'TOP 60 Hari' },
]

export function paymentTypeLabel(value) {
  return PAYMENT_TYPE_OPTIONS.find((o) => o.value === value)?.label || '-'
}

export const INCOME_TAX_OPTIONS = [
  { value: 'exclude', label: 'Exclude (Belum Termasuk Harga)' },
  { value: 'include', label: 'Include (Sudah Termasuk Harga)' },
]

export function incomeTaxLabel(value) {
  return INCOME_TAX_OPTIONS.find((o) => o.value === value)?.label || '-'
}
