// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const ADDITIONAL_NEEDS_OPTIONS = [
  { value: 'asuransi', label: 'Asuransi Barang' },
  { value: 'terpal', label: 'Terpal' },
  { value: 'kawal', label: 'Kawal Barang' },
]

export function additionalNeedsLabel(value) {
  return ADDITIONAL_NEEDS_OPTIONS.find((o) => o.value === value)?.label || value
}
