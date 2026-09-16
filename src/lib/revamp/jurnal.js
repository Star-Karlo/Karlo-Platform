// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
import { computeInvoiceTotal } from './orderPricing.js'
import { computeUangSangu, computeOrderKontrakRecon } from './uangSangu.js'
import { parseDateTimeLabel } from './date.js'

// Kodes match the seeded system accounts (scripts/seedData.js`coaAccounts`)
// — the automatic postings below always route through these fixed accounts.
export const KAS_BANK = '1-1000'
export const PIUTANG_USAHA = '1-1100'
export const HUTANG_USAHA = '2-1000'
export const PENDAPATAN_JASA = '4-1000'
export const BEBAN_UANG_SANGU = '5-1000'

function toDateSafe(ts) {
  if (!ts) return null
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return Number.isNaN(d.getTime()) ? null : d
}
function isoDate(d) {
  if (!d) return ''
  return d.toISOString().slice(0, 10)
}

// Derives read-only "Jurnal Otomatis" postings straight from Order Kontrak
// data — no separate ledger is persisted for these, so the journal always
// reflects the order/uang-sangu data as it stands right now (source of
// truth stays in one place, per this app's "no fabricated numbers"
// convention throughout the Finance pages).
export function computeAutoJurnalEntries(orders, agreements, tripAllowance) {
  const entries = []

  for (const order of orders || []) {
    const agreement = agreements?.find((a) => a.idAgreement === order.agreementId) || null
    const detail = order.detail || {}

    // --- Income: invoice finalized -> Piutang Usaha (Unpaid) or Kas/Bank (Paid) ---
    if (detail.invoiceFinalized) {
      const jumlah = computeInvoiceTotal(order, agreement)
      if (jumlah > 0) {
        const paid = detail.invoiceProgress?.billing?.status === 'paid'
        const at = paid ? toDateSafe(detail.invoiceProgress.billing.at) : toDateSafe(detail.invoiceFinalizedAt)
        const tanggal = at || toDateSafe(order.createdAt) || new Date()
        entries.push({
          id: `${order.id}-income`,
          tanggal,
          tanggalLabel: isoDate(tanggal),
          keterangan: 'Pendapatan Jasa Angkutan',
          ref: order.idOrder,
          akunDebitKode: paid ? KAS_BANK : PIUTANG_USAHA,
          akunKreditKode: PENDAPATAN_JASA,
          jumlah,
          tipe: 'otomatis',
          refType: 'order',
          refId: order.id,
        })
      }
    }

    // Trip date used for both uang sangu lines below — no separate
    // "finalized at" timestamp exists on either the pre-trip or post-trip
    // uang sangu data, so the trip's own scheduled date is the most
    // meaningful real date available.
    const tripDate = parseDateTimeLabel(order.tanggalPickup) || toDateSafe(order.createdAt) || new Date()

    // --- Expense: pre-trip Uang Sangu -> Kas/Bank (finalized) or Hutang Usaha (belum) ---
    const sangu = computeUangSangu(order, tripAllowance)
    if (sangu.subtotal > 0) {
      const finalized = !!detail.uangSanguFinalized
      entries.push({
        id: `${order.id}-sangu`,
        tanggal: tripDate,
        tanggalLabel: isoDate(tripDate),
        keterangan: 'Uang Sangu',
        ref: order.idOrder,
        akunDebitKode: BEBAN_UANG_SANGU,
        akunKreditKode: finalized ? KAS_BANK : HUTANG_USAHA,
        jumlah: sangu.subtotal,
        tipe: 'otomatis',
        refType: 'order',
        refId: order.id,
      })
    }

    // --- Expense: post-trip reconciliation -> Kas/Bank (sudah diproses) or Hutang Usaha (belum) ---
    const recon = computeOrderKontrakRecon(order, tripAllowance, sangu.uangMakan.value)
    if (recon && recon.total > 0) {
      const finalized = recon.status === 'sudah_diproses'
      entries.push({
        id: `${order.id}-recon`,
        tanggal: tripDate,
        tanggalLabel: isoDate(tripDate),
        keterangan: 'Rekonsiliasi Uang Sangu',
        ref: order.idOrder,
        akunDebitKode: BEBAN_UANG_SANGU,
        akunKreditKode: finalized ? KAS_BANK : HUTANG_USAHA,
        jumlah: recon.total,
        tipe: 'otomatis',
        refType: 'order',
        refId: order.id,
      })
    }
  }

  return entries.sort((a, b) => b.tanggal - a.tanggal)
}

// Normalizes a manual jurnalManual Firestore doc into the same shape as an
// auto entry so the Jurnal/Laporan tables can render both uniformly.
export function normalizeManualEntry(doc) {
  const tanggal = doc.tanggal ? new Date(doc.tanggal) : toDateSafe(doc.createdAt) || new Date()
  return {
    id: doc.id,
    tanggal,
    tanggalLabel: doc.tanggal || isoDate(tanggal),
    keterangan: doc.keterangan || '',
    ref: null,
    akunDebitKode: doc.akunDebitKode,
    akunKreditKode: doc.akunKreditKode,
    jumlah: Number(doc.jumlah) || 0,
    tipe: 'manual',
    refType: 'manual',
    refId: doc.id,
  }
}
