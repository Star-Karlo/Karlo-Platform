// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
import { formatIDR } from './currency.js'

function averageRatio(ratioByTruckType) {
  const values = Object.values(ratioByTruckType || {}).filter((v) => Number(v) > 0)
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + Number(v), 0) / values.length
}

/**
 * Pre-trip "Uang Sangu" (driver allowance) estimate — auto-generated from the
 * planner's Trip Allowance configuration (src/stores/tripAllowanceSettings.js)
 * combined with this order's planned route (order.detail.tripEstimate).
 *
 * Toll follows the specific route's preset (set by the planner or the
 * system's default route), not the general Trip Allowance config. Ferry only
 * applies when this order's route is flagged as passing through a port
 * (port-to-port) crossing.
 */
export function computeUangSangu(order, tripAllowance) {
  const est = order?.detail?.tripEstimate || {}
  const jarakKm = Number(est.jarakKm) || 0
  const etaJam = Number(est.etaJam) || 0
  const overrides = order?.detail?.uangSanguOverrides || {}

  // Biaya BBM
  let bbm = 0
  let bbmFormula = '-'
  if (tripAllowance.fuel.method === 'perKm') {
    bbm = jarakKm * (tripAllowance.fuel.costPerKm || 0)
    bbmFormula = `${jarakKm} Km × ${formatIDR(tripAllowance.fuel.costPerKm)}`
  } else {
    const ratio =
      (est.truckType && Number(tripAllowance.fuel.ratioByTruckType?.[est.truckType])) ||
      averageRatio(tripAllowance.fuel.ratioByTruckType)
    bbm = ratio > 0 ? (jarakKm / ratio) * (tripAllowance.fuel.pricePerLiter || 0) : 0
    bbmFormula = ratio > 0 ? `(${jarakKm} Km ÷ ${ratio}) × ${formatIDR(tripAllowance.fuel.pricePerLiter)}` : 'Rasio BBM belum diatur'
  }
  const bbmOverridden = overrides.bbm !== undefined && overrides.bbm !== null
  if (bbmOverridden) {
    bbm = Number(overrides.bbm) || 0
    bbmFormula = 'Direvisi manual oleh planner'
  }

  // Biaya Tol — preset per rute, bukan dari Trip Allowance Configuration.
  // Not actually knowable until the order is paired with a truck: the real
  // toll segments only get detected at that point (Planner Allocate's own
  // pairFleet() writes that computed figure into uangSanguOverrides.tol
  // right when assignment happens). So this reads as "not yet available"
  // while still at penugasan_pengemudi with no override landed yet, and
  // only falls back to the route's baked-in preset once the order has
  // actually moved past assignment.
  const tolOverridden = overrides.tol !== undefined && overrides.tol !== null
  const tolNeedsAssignment = !tolOverridden && order?.status === 'penugasan_pengemudi'
  let tol = 0
  let tolFormula = 'Menunggu penugasan driver'
  if (tolOverridden) {
    tol = Number(overrides.tol) || 0
    tolFormula = 'Direvisi manual oleh planner'
  } else if (!tolNeedsAssignment) {
    tol = Number(est.tollPreset) || 0
    tolFormula = 'Preset tol order'
  }

  // Uang Makan
  let hari = 0
  let mealFormula = '-'
  if (tripAllowance.meal.method === 'km') {
    const kmPerDay = tripAllowance.meal.kmPerDay || 0
    hari = kmPerDay > 0 ? jarakKm / kmPerDay : 0
    mealFormula = kmPerDay > 0 ? `(${jarakKm} Km ÷ ${kmPerDay}) × ${formatIDR(tripAllowance.meal.nominalPerDay)}` : 'Setting km/hari belum diatur'
  } else {
    hari = etaJam / 24
    mealFormula = `(ETA ${etaJam} Jam ÷ 24) × ${formatIDR(tripAllowance.meal.nominalPerDay)}`
  }
  let uangMakan = hari * (tripAllowance.meal.nominalPerDay || 0)
  const uangMakanOverridden = overrides.uangMakan !== undefined && overrides.uangMakan !== null
  if (uangMakanOverridden) {
    uangMakan = Number(overrides.uangMakan) || 0
    mealFormula = 'Direvisi manual oleh planner'
  }

  // Biaya Perjalanan Menuju Lokasi Muat — the truck's own empty-run leg from
  // wherever it is to this order's pickup point (Planner Allocate's "Rute
  // Menuju Lokasi Muat" table), summed across BBM+Tol+Uang Makan for just
  // that leg and persisted as one lump figure the moment the truck is
  // actually assigned (src/views/PlannerAllocateView.vue's pairFleet()) —
  // same "not knowable until assignment" story as Biaya Tol above, since
  // there's no truck (and so no starting point for this leg) before then.
  const menujuMuatOverridden = overrides.menujuMuat !== undefined && overrides.menujuMuat !== null
  const menujuMuatNeedsAssignment = !menujuMuatOverridden && order?.detail?.biayaMenujuMuat == null
  let menujuMuat = 0
  let menujuMuatFormula = 'Menunggu penugasan driver'
  if (menujuMuatOverridden) {
    menujuMuat = Number(overrides.menujuMuat) || 0
    menujuMuatFormula = 'Direvisi manual oleh planner'
  } else if (!menujuMuatNeedsAssignment) {
    menujuMuat = Number(order.detail.biayaMenujuMuat) || 0
    // A real, already-assigned order that just never went through Planner
    // Allocate's own assignment flow (seed data, an older assignment from
    // before this component existed, etc.) falls back to a straight-line
    // estimate computed on the fly (see OrderKontrakDetailView.vue/
    // SpotOrderDetailView.vue's estimatedBiayaMenujuMuat) instead of
    // sitting at "Menunggu penugasan driver" forever — flagged here so the
    // formula stays honest about not having real toll/road data behind it.
    menujuMuatFormula = order.detail.biayaMenujuMuatEstimated
      ? 'Estimasi jarak lurus truck ke lokasi muat (BBM + Uang Makan) — assign ulang di Allocate untuk rute & tol akurat'
      : 'Estimasi rute truck menuju lokasi muat (BBM + Tol + Uang Makan)'
  }

  // Biaya Ferry — hanya berlaku jika rute order ini melewati penyeberangan
  // (port-to-port). Platform belum punya master data harga kapal, jadi
  // nominalnya TIDAK di-preset otomatis — planner input manual per order
  // sebelum penugasan driver. Sebelum diisi, biayanya 0.
  const melewatiFerry = !!est.melewatiFerry
  const biayaFerryManual = order?.detail?.biayaFerryManual
  const ferryNeedsInput = melewatiFerry && (biayaFerryManual === undefined || biayaFerryManual === null || biayaFerryManual === '')
  const ferry = melewatiFerry ? Number(biayaFerryManual) || 0 : 0
  let ferryFormula = 'Tidak ada penyeberangan'
  if (melewatiFerry) {
    ferryFormula = ferryNeedsInput
      ? 'Rute ini terdeteksi melewati port penyebrangan'
      : 'Diisi manual oleh planner (harga kapal)'
  }

  // Komponen tambahan — biaya lain yang belum punya field di Trip Allowance
  // Configuration, diinput bebas oleh planner per order (mis. biaya khusus
  // rute, izin masuk kawasan tertentu, dsb).
  const custom = (order?.detail?.customComponents || []).map((c, i) => ({
    index: i,
    label: c.label,
    nominal: Number(c.nominal) || 0,
    formula: 'Komponen tambahan — diinput manual oleh planner',
  }))
  const customTotal = custom.reduce((sum, c) => sum + c.nominal, 0)

  const subtotal = bbm + tol + uangMakan + menujuMuat + ferry + customTotal

  return {
    bbm: { value: bbm, formula: bbmFormula, overridden: bbmOverridden },
    tol: { value: tol, formula: tolFormula, overridden: tolOverridden, needsAssignment: tolNeedsAssignment },
    uangMakan: { value: uangMakan, formula: mealFormula, overridden: uangMakanOverridden },
    menujuMuat: { value: menujuMuat, formula: menujuMuatFormula, overridden: menujuMuatOverridden, needsAssignment: menujuMuatNeedsAssignment },
    ferry: { value: ferry, formula: ferryFormula, melewatiFerry, needsInput: ferryNeedsInput },
    custom,
    customTotal,
    subtotal,
  }
}

/**
 * Post-trip reconciliation — only relevant once the order has actually been
 * driven (order.detail.postTrip is set by the driver/system after "Order
 * Selesai"). Compares the actual trip duration (driver menerima order →
 * order selesai) against what was estimated pre-trip:
 *  - Biaya Uang Inap: not estimated pre-trip at all, so the full actual
 *    amount (nights × nominal) is billed here.
 *  - Uang Makan: only the shortfall between actual days and the pre-trip
 *    estimate is billed (never negative — a shorter-than-estimated trip
 *    isn't clawed back here).
 *  - Reimburse: ad-hoc expenses the driver submitted via K-Trip.
 */
export function computePostTripReconciliation(order, tripAllowance, preTripUangMakanValue) {
  const post = order?.detail?.postTrip
  if (!post) return null

  const nights = Number(post.actualNights) || 0
  const days = Number(post.actualDays) || 0
  const overrides = post.overrides || {}

  let biayaInap = nights * (tripAllowance.lodging.nominalPerNight || 0)
  let lodgingFormula = `${nights} malam × ${formatIDR(tripAllowance.lodging.nominalPerNight)} (aktual)`
  const lodgingOverridden = overrides.lodging !== undefined && overrides.lodging !== null
  if (lodgingOverridden) {
    biayaInap = Number(overrides.lodging) || 0
    lodgingFormula = 'Direvisi manual oleh planner'
  }

  const uangMakanAktual = days * (tripAllowance.meal.nominalPerDay || 0)
  let kekuranganUangMakan = Math.max(0, uangMakanAktual - (preTripUangMakanValue || 0))
  let mealFormula = `${days} hari aktual × ${formatIDR(tripAllowance.meal.nominalPerDay)} − uang makan pre-trip`
  const mealOverridden = overrides.meal !== undefined && overrides.meal !== null
  if (mealOverridden) {
    kekuranganUangMakan = Number(overrides.meal) || 0
    mealFormula = 'Direvisi manual oleh planner'
  }

  const reimburse = post.reimburse || []
  const reimburseTotal = reimburse.reduce((sum, r) => sum + (Number(r.nominal) || 0), 0)

  const total = biayaInap + kekuranganUangMakan + reimburseTotal

  // Each cost component is finalized independently — the "Belum Diproses" /
  // "Sudah Diproses" card status reflects whether every component here has
  // been checked off in the Finalisasi popup.
  const components = [
    {
      id: 'lodging',
      label: 'Biaya Uang Inap',
      formula: lodgingFormula,
      nominal: biayaInap,
      attachment: null,
      finalized: !!post.finalized?.lodging,
    },
    {
      id: 'meal',
      label: 'Kekurangan Uang Makan',
      formula: mealFormula,
      nominal: kekuranganUangMakan,
      attachment: null,
      finalized: !!post.finalized?.meal,
    },
    ...reimburse.map((r, i) => ({
      id: `reimburse_${i}`,
      label: `Reimburse: ${r.label}`,
      formula: 'Diajukan driver via aplikasi K-Trip',
      nominal: Number(r.nominal) || 0,
      isReimburse: true,
      attachment: r.attachment || null,
      status: r.status || 'pending', // 'pending' | 'approved' | 'rejected'
      note: r.note || '',
      finalized: r.status === 'approved',
    })),
  ]

  const status = components.every((c) => c.finalized) ? 'sudah_diproses' : 'belum_diproses'

  return {
    nights,
    days,
    biayaInap,
    uangMakanAktual,
    kekuranganUangMakan,
    reimburse,
    reimburseTotal,
    total,
    components,
    status,
  }
}

// Order Kontrak has no driver-submission flow of its own to originate real
// post-trip data — unlike Spot Order, whose detail.postTrip only ever
// arrives via a driver's own submission (or seed data), Order Kontrak
// simply has no such source. But reconciliation still has to happen once
// an order reaches confirmation stages, so this synthesizes a "no
// difference yet" starting point automatically — 0 inap nights (never
// pre-estimated, so 0 is the honest "nothing extra happened" default) and
// just enough days to net the exact same Uang Makan as pre-trip (so the
// difference comes out to 0 rather than some arbitrary number) — instead
// of leaving the whole section unreachable behind a form. The moment the
// order has real detail.postTrip (the user edited/finalized something),
// that always wins over this synthesized default — this function only
// ever fills the gap before that happens.
const ORDER_KONTRAK_RECON_STATUSES = new Set(['menunggu_konfirmasi_pengiriman', 'pengiriman_terkonfirmasi'])
export function computeOrderKontrakRecon(order, tripAllowance, preTripUangMakanValue) {
  if (!ORDER_KONTRAK_RECON_STATUSES.has(order?.status)) return null
  if (order.detail?.postTrip) return computePostTripReconciliation(order, tripAllowance, preTripUangMakanValue)
  const nominalPerDay = tripAllowance.meal.nominalPerDay || 0
  const defaultPostTrip = {
    actualNights: 0,
    actualDays: nominalPerDay > 0 ? preTripUangMakanValue / nominalPerDay : 0,
    overrides: {},
    finalized: {},
    reimburse: [],
  }
  return computePostTripReconciliation({ ...order, detail: { ...order.detail, postTrip: defaultPostTrip } }, tripAllowance, preTripUangMakanValue)
}

export function reconStatusLabel(status) {
  if (status === 'approved') return 'Disetujui'
  if (status === 'rejected') return 'Dikembalikan ke Driver'
  return 'Menunggu Review'
}
