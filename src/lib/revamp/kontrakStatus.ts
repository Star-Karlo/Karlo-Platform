/**
 * The one displayed status of an order, in the revamp's vocabulary.
 *
 * The prototype stored a single `status` string per order (see
 * spotOrderStatus.js). The services keep the truth in three places — the
 * order's own state, its shipment's state, and the working detail (POD
 * verification, vendor handover) — so the label a planner sees is derived
 * here, once, and every screen agrees.
 */

export interface OrderLike {
	statusCode?: string;
	shipmentStatusCode?: string;
	driverId?: string | null;
	driverUserId?: string | null;
	truckId?: string | null;
	detail?: Record<string, any> | null;
	/** Latest POD submission per stage, from the shipment (driver flow). */
	shipmentPods?: { stage: string; status: string }[] | null;
}

function podPending(o: OrderLike, stage: string): boolean {
	return !!o.shipmentPods?.some((p) => p.stage === stage && p.status === 'submitted');
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
		case 'delivered':
			// Delivered is a legacy state: a finished shipment now completes the
			// order, and "menunggu konfirmasi" is no longer a step.
			return 'pengiriman_terkonfirmasi';
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
				// The driver flow: a submitted POD waits for review while the
				// shipment is still "loading"; approval makes it "loaded".
				return podPending(o, 'loading') ? 'verifikasi_pod_muat' : 'proses_muat_barang';
			case 'loaded':
				return 'pod_muat_terverifikasi';
			case 'toUnloading':
				return 'menuju_lokasi_bongkar';
			case 'atUnloading':
				return 'tiba_lokasi_bongkar';
			case 'unloadingApproved':
			case 'unloading':
				return podPending(o, 'unloading') ? 'verifikasi_pod_bongkar' : 'proses_bongkar_muatan';
			case 'unloaded':
				return 'pod_bongkar_terverifikasi';
			case 'finished':
				return 'pengiriman_terkonfirmasi';
			case 'cancelled':
				return 'dibatalkan';
		}
		return 'pengemudi_ditugaskan';
	}
	if (o.statusCode === 'draft' || o.statusCode === 'submitted') return 'negosiasi';
	return 'penugasan_pengemudi';
}
