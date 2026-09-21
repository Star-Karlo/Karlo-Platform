// @ts-nocheck — ported from Karlo-TMS-Revamp/src/utils/truckDocuments.js.
import { parseIndonesianDate } from './date.js'

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
// today + N calendar months, clamped to the target month's last day
// (31 Jan + 1 month = 28/29 Feb, not 3 Mar).
function addMonths(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay))
}

// STNK / KIR validity, read off the truck register's own free-text period
// fields (stnkFrom/stnkTo, kirFrom/kirTo). 'active' until the end date has
// passed (the end date itself still counts), 'expired' after it, and
// 'missing' when there's no end date or it can't be read — never guessed.
export function documentState(toLabel, now = new Date()) {
  const end = parseIndonesianDate(toLabel)
  if (!end) return 'missing'
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return end < today ? 'expired' : 'active'
}

function documentOf(t, prefix, now) {
  const no = t[`no${prefix === 'stnk' ? 'Stnk' : 'Kir'}`] || ''
  const from = t[`${prefix}From`] || ''
  const to = t[`${prefix}To`] || ''
  return { no, from, to, end: parseIndonesianDate(to), state: documentState(to, now) }
}

// The last day covered by an "expires within N months" window.
export function monthsFromToday(months, now = new Date()) {
  return addMonths(startOfDay(now), months)
}

// Still active today but ending within the next N months (today <= end <=
// today + N months). Already-expired and unreadable documents never count.
export function expiresWithinMonths(doc, months, now = new Date()) {
  if (doc.state !== 'active' || !doc.end) return false
  return doc.end <= monthsFromToday(months, now)
}

// One overall bucket per truck, for filtering/summary:
//   valid   — STNK and KIR both active
//   both    — both expired
//   stnk    — STNK expired (KIR active or unknown)
//   kir     — KIR expired (STNK active or unknown)
//   missing — nothing expired, but at least one has no readable end date
export function truckDocuments(t, now = new Date()) {
  const stnk = documentOf(t, 'stnk', now)
  const kir = documentOf(t, 'kir', now)
  let overall
  if (stnk.state === 'active' && kir.state === 'active') overall = 'valid'
  else if (stnk.state === 'expired' && kir.state === 'expired') overall = 'both'
  else if (stnk.state === 'expired') overall = 'stnk'
  else if (kir.state === 'expired') overall = 'kir'
  else overall = 'missing'
  return { stnk, kir, overall }
}
