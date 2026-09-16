// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export function formatRupiah(value) {
  return 'Rp' + Math.round(value || 0).toLocaleString('id-ID')
}

export function formatIDR(value) {
  return 'IDR ' + Math.round(value || 0).toLocaleString('id-ID')
}

// Live thousand-separator formatting for numeric text inputs (e.g. "450.000"
// while typing), so planners can visually verify large nominals as they type.
export function formatThousands(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits).toLocaleString('id-ID') : ''
}

export function parseThousands(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits ? Number(digits) : 0
}
