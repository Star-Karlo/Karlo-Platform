// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
// Central status taxonomy for orders. Labels are the old order service's
// (karlo_order common/constants/status.js), the same words the business
// service and K-Trip show. — label, table-badge class, and the
// tab order used to filter the list. Keep in sync with scripts/seedEmulator.js
// demo data.
export const SPOT_ORDER_STATUSES = {
  negosiasi: { label: 'Negosiasi', badge: 'badge-wait' },
  menunggu_pembayaran: { label: 'Menunggu Pembayaran', badge: 'badge-wait' },
  penugasan_pengemudi: { label: 'Penugasan Pengemudi', badge: 'badge-wait' },
  pengemudi_ditugaskan: { label: 'Driver Dipilih', badge: 'badge-planner' },
  pengemudi_menerima_order: { label: 'Driver Menerima Order', badge: 'badge-planner' },
  menuju_lokasi_muat: { label: 'Menuju Titik Muat', badge: 'badge-planner' },
  tiba_lokasi_muat: { label: 'Sampai di Titik Muat', badge: 'badge-planner' },
  proses_muat_barang: { label: 'Mulai Muat', badge: 'badge-planner' },
  // The driver's cargo check at loading (sesuai / tidak sesuai).
  item_muat_terverifikasi: { label: 'Item Muat Telah Diverifikasi', badge: 'badge-planner' },
  item_muat_tidak_sesuai: { label: 'Item Muat Tidak Sesuai', badge: 'badge-fail' },
  verifikasi_pod_muat: { label: 'Pengecekan POD Muat', badge: 'badge-wait' },
  pod_muat_terverifikasi: { label: 'POD Muat Terverifikasi', badge: 'badge-active' },
  menuju_lokasi_bongkar: { label: 'Menuju Titik Bongkar', badge: 'badge-planner' },
  tiba_lokasi_bongkar: { label: 'Sampai di Titik Bongkar', badge: 'badge-planner' },
  // The PIC's code confirmed by the driver; unloading has started.
  otp_bongkar_terverifikasi: { label: 'OTP Bongkar Terverifikasi', badge: 'badge-planner' },
  proses_bongkar_muatan: { label: 'Mulai Bongkar', badge: 'badge-planner' },
  // The PIC's cargo check at unloading (Web-Field).
  item_bongkar_terverifikasi: { label: 'Item Bongkar Telah Diverifikasi', badge: 'badge-planner' },
  item_bongkar_tidak_sesuai: { label: 'Item Bongkar Tidak Sesuai', badge: 'badge-fail' },
  verifikasi_pod_bongkar: { label: 'Pengecekan POD Bongkar', badge: 'badge-wait' },
  pod_bongkar_terverifikasi: { label: 'POD Bongkar Terverifikasi', badge: 'badge-active' },
  // Legacy key, no longer produced: a finished shipment completes the order.
  menunggu_konfirmasi_pengiriman: { label: 'Order Selesai', badge: 'badge-active' },
  dibatalkan: { label: 'Order Dibatalkan', badge: 'badge-fail' },
  pengiriman_terkonfirmasi: { label: 'Order Selesai', badge: 'badge-active' },
  kadaluarsa: { label: 'Order Sudah Kadaluarsa', badge: 'badge-fail' },
  pencairan_proses: { label: 'Pencairan Dalam Proses', badge: 'badge-wait' },
  // Handed off to an outside vendor transporter (MyTransporter — Planner
  // Allocate's "Transporter Catalog") instead of this transporter's own
  // fleet. Deliberately NOT part of STATUS_SEQUENCE/the onduty or planned
  // sets below — the order now runs in the vendor's own separate account,
  // so there's no truck/GPS journey of ours left to track or sequence.
  diserahkan_ke_vendor: { label: 'Diserahkan ke Vendor', badge: 'badge-self' },
}

// Order these tabs appear in, after the always-first "Total" tab.
export const SPOT_ORDER_TABS = [
  'negosiasi',
  'menunggu_pembayaran',
  'penugasan_pengemudi',
  'pengemudi_ditugaskan',
  'pengemudi_menerima_order',
  'menuju_lokasi_muat',
  'tiba_lokasi_muat',
  'proses_muat_barang',
  'item_muat_terverifikasi',
  'item_muat_tidak_sesuai',
  'verifikasi_pod_muat',
  'pod_muat_terverifikasi',
  'menuju_lokasi_bongkar',
  'tiba_lokasi_bongkar',
  'otp_bongkar_terverifikasi',
  'proses_bongkar_muatan',
  'item_bongkar_terverifikasi',
  'item_bongkar_tidak_sesuai',
  'verifikasi_pod_bongkar',
  'pod_bongkar_terverifikasi',
  'dibatalkan',
  'pengiriman_terkonfirmasi',
  'kadaluarsa',
  'pencairan_proses',
]

// Order Kontrak now carries this exact same status field (see
// src/stores/orderKontrak.js's addOrder/assignFleet), but has no
// negotiation/payment/cancellation flow of its own — those 5 stay
// Spot-Order-only, so its own status tabs exclude them.
const ORDER_KONTRAK_EXCLUDED_STATUSES = new Set(['negosiasi', 'menunggu_pembayaran', 'dibatalkan', 'kadaluarsa', 'pencairan_proses'])
export const ORDER_KONTRAK_TABS = SPOT_ORDER_TABS.filter((s) => !ORDER_KONTRAK_EXCLUDED_STATUSES.has(s))

export function statusLabel(status) {
  return SPOT_ORDER_STATUSES[status]?.label ?? status
}

export function statusBadgeClass(status) {
  return SPOT_ORDER_STATUSES[status]?.badge ?? 'badge-wait'
}

// Linear progress order for milestone/journey checks — only the statuses
// that actually happen after assignment, in the sequence they happen in.
// Shared by Spot Order and Order Kontrak alike (both carry this same
// status field now) wherever something needs to know "has this order
// reached stage X yet" — Control Tower's milestone checklist/journey bar,
// and Order Kontrak's own Detail Muatan Plan/Muat/Bongkar gating.
export const STATUS_SEQUENCE = [
  'penugasan_pengemudi',
  'pengemudi_ditugaskan',
  'pengemudi_menerima_order',
  'menuju_lokasi_muat',
  'tiba_lokasi_muat',
  'proses_muat_barang',
  'item_muat_terverifikasi',
  'item_muat_tidak_sesuai',
  'verifikasi_pod_muat',
  'pod_muat_terverifikasi',
  'menuju_lokasi_bongkar',
  'tiba_lokasi_bongkar',
  'otp_bongkar_terverifikasi',
  'proses_bongkar_muatan',
  'item_bongkar_terverifikasi',
  'item_bongkar_tidak_sesuai',
  'verifikasi_pod_bongkar',
  'pod_bongkar_terverifikasi',
  'pengiriman_terkonfirmasi',
]
export function hasPassed(status, milestone) {
  const cur = STATUS_SEQUENCE.indexOf(status)
  const target = STATUS_SEQUENCE.indexOf(milestone)
  return cur > -1 && target > -1 && cur > target
}
export function atOrPassed(status, milestone) {
  const cur = STATUS_SEQUENCE.indexOf(status)
  const target = STATUS_SEQUENCE.indexOf(milestone)
  return cur > -1 && target > -1 && cur >= target
}
