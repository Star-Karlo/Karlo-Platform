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

// Free-text Indonesian dates ('12 Maret 2027', '12/03/2027', '2027-03-12') — the truck register's STNK/KIR periods.
const MONTH_ALIASES = {
  jan: 0, januari: 0, january: 0,
  feb: 1, februari: 1, february: 1, pebruari: 1,
  mar: 2, maret: 2, march: 2,
  apr: 3, april: 3,
  mei: 4, may: 4,
  jun: 5, juni: 5, june: 5,
  jul: 6, juli: 6, july: 6,
  agu: 7, agt: 7, ags: 7, agustus: 7, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9, oct: 9, october: 9,
  nov: 10, november: 10, nop: 10, nopember: 10,
  des: 11, desember: 11, dec: 11, december: 11,
}
export function parseIndonesianDate(label) {
  if (!label || typeof label !== 'string') return null
  const s = label.trim()
  let y, m, d
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (match) {
    y = Number(match[1]); m = Number(match[2]) - 1; d = Number(match[3])
  } else if ((match = /^(\d{1,2})[\s\-/.]+(\d{1,2})[\s\-/.]+(\d{4})$/.exec(s))) {
    d = Number(match[1]); m = Number(match[2]) - 1; y = Number(match[3])
  } else if ((match = /^(\d{1,2})[\s\-/.]+(\p{L}+)\.?[\s\-/.,]+(\d{4})$/u.exec(s))) {
    d = Number(match[1]); y = Number(match[3])
    m = MONTH_ALIASES[match[2].toLowerCase()]
    if (m == null) return null
  } else {
    return null
  }
  const date = new Date(y, m, d)
  // Rejects overflow like "31 Februari" (Date would roll it into March).
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null
  return date
}
