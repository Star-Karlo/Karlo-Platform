// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const BULAN_FULL = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

export function todayLabel() {
  const d = new Date()
  return String(d.getDate()).padStart(2, '0') + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear()
}

// dateStr: "YYYY-MM-DD" (native <input type="date"> value), timeStr: "HH:MM"
// -> "06 Agustus 2026, 08.00 WIB"
export function formatDateTimeLabel(dateStr, timeStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const jam = timeStr ? timeStr.replace(':', '.') : '00.00'
  return `${String(d).padStart(2, '0')} ${BULAN_FULL[m - 1]} ${y}, ${jam} WIB`
}

// "06 Agustus 2026, 08.00 WIB" -> Date, or null if it doesn't match this
// exact label format (the only format tanggalPickup is ever written in —
// see formatDateTimeLabel above).
export function parseDateTimeLabel(label) {
  if (!label) return null
  const m = /^(\d{1,2}) (\p{L}+) (\d{4}), (\d{1,2})\.(\d{2})/u.exec(label.trim())
  if (!m) return null
  const monthIdx = BULAN_FULL.findIndex((b) => b.toLowerCase() === m[2].toLowerCase())
  if (monthIdx === -1) return null
  const d = new Date(Number(m[3]), monthIdx, Number(m[1]), Number(m[4]), Number(m[5]))
  return Number.isNaN(d.getTime()) ? null : d
}

// ts: Firestore Timestamp (has .toDate()) or a Date -> "06 Agustus 2026, 08.00 WIB"
export function formatTimestampLabel(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  const jam = `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`
  return `${String(d.getDate()).padStart(2, '0')} ${BULAN_FULL[d.getMonth()]} ${d.getFullYear()}, ${jam} WIB`
}
