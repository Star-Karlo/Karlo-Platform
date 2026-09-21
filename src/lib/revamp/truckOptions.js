// @ts-nocheck — ported from Karlo-TMS-Revamp/src/utils/truckOptions.js.
import { truckTypeLabel, truckBodyIconName, truckTypeColor } from './truckTypes.js'

// An order can carry up to this many "Truck Options" — truck types chosen at
// order creation as the acceptable choices for whoever assigns a truck to it
// (Planner → Allocate shows them as a reference). Stored as the same
// "Body|Size" keys the Agreement/Cargo truck-type matrix already uses, under
// the order's detail.truckOptions.
export const MAX_TRUCK_OPTIONS = 5

export function describeTruckOption(key) {
  const [body, size] = String(key).split('|')
  if (!body || !size) return { key, label: String(key), size: '', icon: 'truckBodyOthers', color: '#7B8794' }
  return { key, label: truckTypeLabel(body, size), size, icon: truckBodyIconName(body), color: truckTypeColor(size) }
}

export function truckOptionKeysOf(order) {
  const raw = order?.detail?.truckOptions
  return Array.isArray(raw) ? raw.slice(0, MAX_TRUCK_OPTIONS) : []
}
