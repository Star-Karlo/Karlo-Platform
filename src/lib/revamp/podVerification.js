// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Per-stop POD verification state — shared between the order detail page
// (where a planner actually verifies each stop) and Control Tower's
// milestone bar (which just reflects it read-only), so the two can never
// disagree on what's verified.
//
// Photos themselves (detail.podPhotos.{phase}.suratJalan/muatan/pendukung)
// are NOT per-stop — they're populated by a driver-facing system outside
// this app with no per-stop tagging, so the gallery stays a single shared
// set regardless of stop count. Only the planner's own verification
// action — "I reviewed this and confirm stop N is done" — is tracked per
// stop, in detail.podPhotos.{phase}.stops[i] = { verified, note }.
//
// Backward compatible with orders written before this existed: those only
// have the old flat detail.podPhotos.{phase}.verified/.note (a single
// boolean/string) — for a single-stop order that's read as stops[0].

export function podStopCount(order, phaseKey) {
  const points = phaseKey === 'muat' ? order?.loadingPoints : order?.unloadingPoints
  return points?.length || 1
}

export function podStops(order, phaseKey) {
  const n = podStopCount(order, phaseKey)
  const phase = order?.detail?.podPhotos?.[phaseKey]
  const existing = phase?.stops
  if (Array.isArray(existing) && existing.length) {
    return Array.from({ length: n }, (_, i) => existing[i] || { verified: false, note: '' })
  }
  // Legacy single flat flag — only meaningful to carry over when this order
  // genuinely has just the one stop; a multi-stop order with no stops[]
  // array yet has honestly verified nothing.
  if (n === 1 && phase) {
    return [{ verified: !!phase.verified, note: phase.note || '' }]
  }
  return Array.from({ length: n }, () => ({ verified: false, note: '' }))
}

export function podPhaseVerified(order, phaseKey) {
  return podStops(order, phaseKey).every((s) => s.verified)
}

// First stop still awaiting verification for this phase, or -1 if every
// stop is already done.
export function podFirstUnverifiedStop(order, phaseKey) {
  return podStops(order, phaseKey).findIndex((s) => !s.verified)
}
