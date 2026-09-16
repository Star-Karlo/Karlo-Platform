// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
const EARTH_RADIUS_KM = 6371

function toRad(deg) {
  return (deg * Math.PI) / 180
}

// Great-circle distance between two {lat, lng} points, in km.
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h))
}

// Total distance along a sequence of {lat, lng} points (point 1 -> 2 -> 3 ...).
// Returns null if any point is missing coordinates — better to show "no data"
// than a silently-wrong partial total.
export function totalRouteKm(points) {
  if (points.length < 2) return null
  if (points.some((p) => p?.lat == null || p?.lng == null)) return null
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineKm(points[i], points[i + 1])
  }
  return Math.round(total)
}
