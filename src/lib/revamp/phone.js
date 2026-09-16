// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export function normalizePhone(telp) {
  let t = (telp || '').replace(/[^0-9]/g, '')
  if (t.startsWith('0')) t = '62' + t.slice(1)
  if (t.startsWith('8')) t = '62' + t
  return t
}

export function formatPhoneDisplay(telp) {
  const t = normalizePhone(telp)
  return t ? '+' + t : '—'
}
