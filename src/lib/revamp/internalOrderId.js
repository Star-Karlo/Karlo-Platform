// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Generates an Internal Order ID matching the same shape as marketplace
// order IDs (ORM260806010012 = ORM + YYMMDD + 6-digit sequence).
export function generateInternalOrderId() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ymd = String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + pad(now.getDate())
  const hms = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
  return `ORM${ymd}${hms}`
}
