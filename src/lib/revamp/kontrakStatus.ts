/**
 * The one displayed status of an order, in the revamp's vocabulary.
 *
 * The prototype stored a single `status` string per order (see
 * spotOrderStatus.js). The services keep the truth in three places — the
 * order's own state, its shipment's state, and the working detail (POD
 * verification, vendor handover) — so the label a planner sees is derived
 * here, once, and every screen agrees.
 */
import { podPhaseVerified } from './podVerification.js';

export interface OrderLike {
	statusCode?: string;
	shipmentStatusCode?: string;
	driverId?: string | null;
	driverUserId?: string | null;
	truckId?: string | null;
	detail?: Record<string, any> | null;
}

export function kontrakStatus(o: OrderLike): string {
	const d = o.detail ?? {};
	if (d.assignedVendor) return 'diserahkan_ke_vendor';
	switch (o.statusCode) {
		case 'cancelled':
		case 'rejected':
			return 'dibatalkan';
		case 'expired':
			return 'kadaluarsa';
		case 'completed':
			return 'pengiriman_terkonfirmasi';
		case 'delivered':
			return 'menunggu_konfirmasi_pengiriman';
	}
	// Assigned: the shipment says how far the truck has got.
	if (o.statusCode === 'assigned' || o.shipmentStatusCode) {
		switch (o.shipmentStatusCode) {
			case 'toLoading':
				return 'menuju_lokasi_muat';
			case 'atLoading':
				return 'tiba_lokasi_muat';
			case 'loadingApproved':
			case 'loading':
				return 'proses_muat_barang';
			case 'loaded':
				return podPhaseVerified({ detail: d }, 'muat') ? 'pod_muat_terverifikasi' : 'verifikasi_pod_muat';
			case 'toUnloading':
				return 'menuju_lokasi_bongkar';
			case 'atUnloading':
				return 'tiba_lokasi_bongkar';
			case 'unloadingApproved':
			case 'unloading':
				return 'proses_bongkar_muatan';
			case 'unloaded':
				return podPhaseVerified({ detail: d }, 'bongkar') ? 'pod_bongkar_terverifikasi' : 'verifikasi_pod_bongkar';
			case 'finished':
				return 'menunggu_konfirmasi_pengiriman';
			case 'cancelled':
				return 'dibatalkan';
		}
		return 'pengemudi_ditugaskan';
	}
	if (o.statusCode === 'draft' || o.statusCode === 'submitted') return 'negosiasi';
	return 'penugasan_pengemudi';
}
