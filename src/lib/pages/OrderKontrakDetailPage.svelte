<script lang="ts">
	/**
	 * Port of the prototype's OrderKontrakDetailView.vue (1:1).
	 *
	 * The prototype read one Firestore doc; here the order's first-class
	 * columns plus its free-form `detail` are folded back into the prototype's
	 * shape (`order`) so the template stays a straight transcription.
	 */
	import { onMount, tick } from 'svelte';
	import GeofencingToggle from '$lib/components/revamp/GeofencingToggle.svelte';
	import { goto } from '$app/navigation';
	import {
		ChevronDown,
		Search,
		Eye,
		Minus,
		Plus,
		Pencil,
		Check,
		X,
		RefreshCw,
		Copy,
		Download,
		FileText
	} from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { downloadUrl } from '$lib/utils/upload';
	import TestModeStrip from '$lib/components/revamp/TestModeStrip.svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';
	import FleetDriverInfoCard from '$lib/components/revamp/FleetDriverInfoCard.svelte';
	import { initials } from '$lib/revamp/initials.js';
	import { additionalNeedsLabel } from '$lib/revamp/additionalNeeds.js';
	import { describeTruckOption } from '$lib/revamp/truckOptions.js';
	import { orderSafetyLabel } from '$lib/revamp/orderSafety.js';
	import { computeUangSangu, computeOrderKontrakRecon, reconStatusLabel } from '$lib/revamp/uangSangu.js';
	import { statusLabel, statusBadgeClass, atOrPassed, STATUS_SEQUENCE } from '$lib/revamp/spotOrderStatus.js';
	import { formatIDR, formatThousands, parseThousands } from '$lib/revamp/currency.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { totalRouteKm, haversineKm } from '$lib/revamp/geo.js';
	import { coordsForCity } from '$lib/revamp/idCityCoords.js';
	import { shipmentTypeLabel } from '$lib/revamp/shipmentType.js';
	import {
		podStopCount,
		podStops,
		podPhaseVerified,
		podFirstUnverifiedStop
	} from '$lib/revamp/podVerification.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';

	let { id, basePath = '/t' }: { id: string; basePath?: string } = $props();

	const TRANSPORTER_NAME_FALLBACK = 'PT Star Karlo Indonesia';

	// ---------- data loading ----------
	let raw = $state<any>(null);
	let loaded = $state(false);
	let companyName = $state('');
	let warehouses = $state<Record<string, any>>({});
	let warehouseList = $state<any[]>([]);
	let haulKm = $state<number | null>(null);
	let approachKm = $state<number | null>(null);
	let vehicle = $state<any>(null);
	let siblingOrders = $state<any[]>([]);
	let tripAllowance = $state<any>(seedTripAllowance());

	let TRANSPORTER_NAME = $derived(companyName || TRANSPORTER_NAME_FALLBACK);

	function seedTripAllowance() {
		return {
			fuel: {
				method: 'ratio',
				pricePerLiter: 6800,
				ratioByTruckType: {
					'Trailer Flatbed 45 ft': 6,
					'Tronton Box': 5,
					'CDD Box': 7,
					'Fuso Box': 6,
					'Trailer Container 20ft': 5.5,
					'Trailer Container 40ft': 5,
					'Double Engkel': 8,
					'Trailer Wingbox 45ft': 5.5
				},
				costPerKm: 2500
			},
			meal: { nominalPerDay: 100000, method: 'eta', kmPerDay: 300 },
			lodging: { nominalPerNight: 100000 }
		};
	}

	function toProtoWarehouse(w: any) {
		if (!w) return null;
		const lat = w.latitude ?? w.location?.coordinates?.[1] ?? null;
		const lng = w.longitude ?? w.location?.coordinates?.[0] ?? null;
		return {
			idWarehouse: w.id,
			nama: w.name || '',
			kota: w.city || '',
			alamat: w.address || '',
			lat: lat == null ? null : Number(lat),
			lng: lng == null ? null : Number(lng),
			pic: w.picName || ''
		};
	}

	async function loadCompany() {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			const c = res.data?.data ?? {};
			companyName = c.name || '';
			const ta = c.settings?.tripAllowance;
			if (ta) {
				const base = seedTripAllowance();
				tripAllowance = {
					fuel: { ...base.fuel, ...(ta.fuel || {}) },
					meal: { ...base.meal, ...(ta.meal || {}) },
					lodging: { ...base.lodging, ...(ta.lodging || {}) }
				};
			}
		} catch {
			/* keep the seed defaults */
		}
	}

	async function loadWarehouses(o: any) {
		const d = o.detail || {};
		const ids: string[] = Array.from(
			new Set<string>(
				[
					...(d.loadingPoints || []),
					...(d.unloadingPoints || []),
					o.originWarehouseId,
					o.destinationWarehouseId
				].filter(Boolean)
			)
		);
		const map: Record<string, any> = {};
		await Promise.all(
			ids.map(async (wid) => {
				try {
					const res = await api.get(ENDPOINTS.warehouses.one(wid));
					map[wid] = toProtoWarehouse(res.data?.data);
				} catch {
					map[wid] = null;
				}
			})
		);
		warehouses = map;
		// Legacy orders only kept the flat `rute` string — resolve by name.
		if (!(d.loadingPoints?.length && d.unloadingPoints?.length) && d.rute) {
			try {
				const res = await api.get(ENDPOINTS.warehouses.list, { pageSize: 500 });
				warehouseList = (res.data?.data ?? []).map(toProtoWarehouse);
			} catch {
				warehouseList = [];
			}
		}
	}

	async function loadRoutes() {
		try {
			const res = await api.get(ENDPOINTS.orders.routes(id));
			const legs = res.data?.data ?? [];
			const list = Array.isArray(legs) ? legs : legs.legs || [];
			const haul = list.find((l: any) => l.leg === 'haul');
			const approach = list.find((l: any) => l.leg === 'approach');
			haulKm = haul?.distanceMeters ? Math.round(Number(haul.distanceMeters) / 1000) : null;
			approachKm = approach?.distanceMeters ? Math.round(Number(approach.distanceMeters) / 100) / 10 : null;
		} catch {
			haulKm = null;
			approachKm = null;
		}
	}

	async function loadVehicle(o: any) {
		if (!o.truckId) {
			vehicle = null;
			return;
		}
		try {
			const res = await api.get(ENDPOINTS.vehicles.one(o.truckId));
			vehicle = res.data?.data ?? null;
		} catch {
			vehicle = null;
		}
	}

	async function loadSiblings(o: any) {
		const d = o.detail || {};
		if (!d.isLtl || !d.ltlGroupId) {
			siblingOrders = [];
			return;
		}
		try {
			const res = await api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 200 });
			siblingOrders = (res.data?.data ?? []).filter(
				(x: any) => x.id !== o.id && x.detail?.ltlGroupId === d.ltlGroupId
			);
		} catch {
			siblingOrders = [];
		}
	}

	async function loadOrder() {
		try {
			const res = await api.get(ENDPOINTS.orders.one(id));
			raw = res.data?.data ?? null;
		} catch {
			raw = null;
		}
		loaded = true;
		if (raw) {
			await Promise.all([loadWarehouses(raw), loadRoutes(), loadVehicle(raw), loadSiblings(raw), loadShipment()]);
		}
	}

	// The driver flow's shipment: cargo checks, handover state and the
	// latest POD submission per stage (`pods`). The review buttons act on
	// the submission; approval is what moves the shipment on.
	let shipment = $state<any>(null);
	async function loadShipment() {
		try {
			const res = await api.get(ENDPOINTS.orders.shipment(id));
			shipment = res.data?.data ?? null;
		} catch {
			shipment = null;
		}
	}
	function driverPod(phaseKey: string): any | null {
		const stage = phaseKey === 'muat' ? 'loading' : 'unloading';
		return (shipment?.pods ?? []).find((p: any) => p.stage === stage) ?? null;
	}
	/** The driver's photos of one type for a phase, from the latest submission. */
	function driverPodPhotos(phaseKey: string, typeKey: string): string[] {
		const pod = driverPod(phaseKey);
		if (!pod) return [];
		return (pod.photos ?? []).filter((p: any) => p.docType === typeKey).map((p: any) => p.fileUrl as string);
	}

	onMount(() => {
		loadCompany();
		loadOrder();
	});

	/** `PATCH /orders/{id}/detail` — top-level keys replaced wholesale. */
	async function patchDetail(payload: Record<string, any>) {
		try {
			const res = await api.patch(`/orders/${id}/detail`, payload);
			const updated = res.data?.data;
			if (updated && updated.detail !== undefined) raw = updated;
			else {
				const again = await api.get(ENDPOINTS.orders.one(id));
				raw = again.data?.data ?? raw;
			}
		} catch (e: any) {
			toast(e?.response?.data?.message || 'Gagal menyimpan perubahan');
			throw e;
		}
	}

	// ---------- prototype-shaped order ----------
	let order = $derived.by(() => {
		if (!raw) return null;
		const d = raw.detail || {};
		return {
			...d,
			id: raw.id,
			idOrder: raw.orderNumber || raw.id,
			shipperName: raw.shipperCompanyName || d.shipperName || '',
			status: kontrakStatus({ ...raw, shipmentPods: shipment?.pods ?? raw.shipmentPods, shipmentAcceptedAt: shipment?.acceptedAt ?? raw.shipmentAcceptedAt }),
			assignedTruckPlate: raw.truckPoliceNumber || '',
			assignedTruckType: raw.truckTypeName || '',
			assignedDriverName: raw.driverName || '',
			createdAt: raw.createdAt,
			// Null means this order follows the company setting.
			geofencingEnabled: raw.geofencingEnabled ?? null,
			tanggalPickup: d.tanggalPickup || (raw.pickupAt ? formatTimestampLabel(new Date(raw.pickupAt)) : ''),
			agreementId: d.agreementId || raw.agreementId || '',
			loadingPoints: d.loadingPoints || (raw.originWarehouseId ? [raw.originWarehouseId] : []),
			unloadingPoints: d.unloadingPoints || (raw.destinationWarehouseId ? [raw.destinationWarehouseId] : []),
			items: d.items || [],
			totalTonnage: d.totalTonnage ?? (raw.weightKg != null ? Number(raw.weightKg) : 0),
			additionalNeeds: d.additionalNeeds || [],
			muatan: d.muatan || '',
			rute: d.rute || '',
			detail: d
		};
	});
	let detail = $derived<any>(order?.detail || {});

	let assignedDriverPhone = $derived<string>(vehicle?.driver?.phone || '');
	let assignedDriverUsername = $derived<string>(vehicle?.driver?.username || '');
	let assignedTruckCapacity = $derived.by(() => {
		const a = vehicle?.attributes || {};
		const rawKg =
			a.maxWeightKg ??
			a.maxWeight ??
			vehicle?.truckBody?.attributes?.maxWeightKg ??
			vehicle?.truckBody?.maxWeightKg ??
			'';
		const kg = Number(String(rawKg || '').replace(/[^0-9]/g, ''));
		if (!kg) return '';
		const ton = kg / 1000;
		return `${Number.isInteger(ton) ? ton : ton.toFixed(1)} Ton`;
	});

	let shipmentType = $derived(order ? shipmentTypeLabel(order) : '');
	let ltlSiblingOrders = $derived(
		siblingOrders.map((o: any) => ({
			id: o.id,
			idOrder: o.orderNumber || o.id,
			shipperName: o.shipperCompanyName || o.detail?.shipperName || ''
		}))
	);
	function goToSiblingOrder(o: any) {
		goto(`${basePath}/order/kontrak/${o.id}`);
	}

	function warehouseFor(wid: string) {
		return warehouses[wid] || null;
	}
	function warehouseByName(name: string) {
		const n = (name || '').trim().toLowerCase();
		if (!n) return null;
		return warehouseList.find((w) => (w.nama || '').trim().toLowerCase() === n) || null;
	}

	let totalKuantitas = $derived(
		(order?.items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0)
	);
	let totalVolumeM3 = $derived.by(() => {
		const v = (order?.items || []).reduce(
			(sum: number, it: any) =>
				sum + (Number(it.dimP) || 0) * (Number(it.dimL) || 0) * (Number(it.dimT) || 0),
			0
		);
		return Math.round(v * 100) / 100;
	});

	function cargoValueNumber(v: any) {
		const match = String(v).match(/^-?[\d.,]+/);
		return match ? match[0] : String(v);
	}
	const CARGO_FIELDS = [
		{ key: 'totalBerat', label: 'Tonase (Kg)' },
		{ key: 'kuantitas', label: 'Qty (Pcs)' },
		{ key: 'totalVolume', label: 'Volume (m³)' }
	];
	let canShowMuatanMuat = $derived(atOrPassed(order?.status, 'pod_muat_terverifikasi'));
	let canShowMuatanBongkar = $derived(atOrPassed(order?.status, 'pod_bongkar_terverifikasi'));
	let cargoComparison = $derived.by(() => {
		if (!order) return null;
		const okDetail = detail;
		const phases = [
			{
				key: 'plan',
				label: 'Plan',
				data: { totalBerat: order.totalTonnage, kuantitas: totalKuantitas, totalVolume: totalVolumeM3 } as any
			},
			{ key: 'muat', label: 'Muat', data: canShowMuatanMuat ? okDetail.muatanMuat || null : null },
			{ key: 'bongkar', label: 'Bongkar', data: canShowMuatanBongkar ? okDetail.muatanBongkar || null : null }
		];
		const rows = CARGO_FIELDS.map((f) => ({
			...f,
			values: phases.map((p) =>
				p.data && p.data[f.key] != null && p.data[f.key] !== '' ? cargoValueNumber(p.data[f.key]) : null
			)
		}));
		return { phases, rows };
	});

	// ---------- Foto POD ----------
	const POD_PHOTO_TYPES = [
		{ key: 'suratJalan', label: 'Foto Surat Jalan' },
		{ key: 'muatan', label: 'Foto Muatan' },
		{ key: 'pendukung', label: 'Foto Pendukung' }
	];
	const POD_PHOTO_MAX = 2;
	let canShowPodPhotosMuat = $derived(api.testMode() || atOrPassed(order?.status, 'verifikasi_pod_muat'));
	let canShowPodPhotosBongkar = $derived(api.testMode() || atOrPassed(order?.status, 'verifikasi_pod_bongkar'));
	/**
	 * Every photo of one type for one phase: what the driver submitted from
	 * K-Trip first (it is the POD of record), then anything added here. One
	 * list, so the review dialog, the E-POD document and the photo grid all
	 * show the same pictures — the document used to read only the console's
	 * own uploads, which left the driver's POD out of Linimasa Dokumen.
	 */
	function podPhotosOf(phaseKey: string, typeKey: string): string[] {
		const canShow = phaseKey === 'muat' ? canShowPodPhotosMuat : canShowPodPhotosBongkar;
		if (!canShow) return [];
		return [...driverPodPhotos(phaseKey, typeKey), ...(detail.podPhotos?.[phaseKey]?.[typeKey] || [])];
	}
	function podPhotoSlots(phaseKey: string, typeKey: string): (string | null)[] {
		const uploaded = podPhotosOf(phaseKey, typeKey);
		return Array.from({ length: Math.max(POD_PHOTO_MAX, uploaded.length) }, (_, i) => uploaded[i] || null);
	}
	function podPhotoSlotsForStop(phaseKey: string, typeKey: string, stopIndex: number): (string | null)[] {
		const uploaded = podPhotosOf(phaseKey, typeKey);
		const base = stopIndex * POD_PHOTO_MAX;
		return Array.from({ length: POD_PHOTO_MAX }, (_, i) => uploaded[base + i] || null);
	}
	function podPhotoSlotsAll(phaseKey: string, typeKey: string): (string | null)[] {
		const canShow = phaseKey === 'muat' ? canShowPodPhotosMuat : canShowPodPhotosBongkar;
		const uploaded = canShow ? podPhotosOf(phaseKey, typeKey) : [];
		const stops = stopCountFor(phaseKey);
		const count = Math.max(stops > 1 ? stops * POD_PHOTO_MAX : POD_PHOTO_MAX, uploaded.length);
		return Array.from({ length: count }, (_, i) => uploaded[i] || null);
	}
	function podPhotosPresent(phaseKey: string, typeKey: string): string[] {
		return podPhotoSlotsAll(phaseKey, typeKey).filter((s): s is string => !!s);
	}

	let photoModalOpen = $state(false);
	let photoModalData = $state({ title: '', src: '' });
	let photoZoom = $state(1);
	const PHOTO_ZOOM_MIN = 1;
	const PHOTO_ZOOM_MAX = 3;
	const PHOTO_ZOOM_STEP = 0.5;
	const PHOTO_FRAME_MAX_W = 460;
	const PHOTO_FRAME_MAX_H = 460;
	let photoNatural = $state({ width: 0, height: 0 });
	function onPhotoImgLoad(e: Event) {
		const img = e.target as HTMLImageElement;
		photoNatural = { width: img.naturalWidth, height: img.naturalHeight };
	}
	let photoDisplayStyle = $derived.by(() => {
		if (!photoNatural.width || !photoNatural.height) return '';
		const containScale = Math.min(
			PHOTO_FRAME_MAX_W / photoNatural.width,
			PHOTO_FRAME_MAX_H / photoNatural.height,
			1
		);
		const scale = containScale * photoZoom;
		return `width:${Math.round(photoNatural.width * scale)}px;height:${Math.round(photoNatural.height * scale)}px;`;
	});
	function openPhotoModal(title: string, src: string | null) {
		if (!src) return;
		photoModalData = { title, src };
		photoZoom = 1;
		photoNatural = { width: 0, height: 0 };
		photoModalOpen = true;
	}
	function closePhotoModal() {
		photoModalOpen = false;
	}
	function zoomIn() {
		photoZoom = Math.min(PHOTO_ZOOM_MAX, Math.round((photoZoom + PHOTO_ZOOM_STEP) * 10) / 10);
	}
	function zoomOut() {
		photoZoom = Math.max(PHOTO_ZOOM_MIN, Math.round((photoZoom - PHOTO_ZOOM_STEP) * 10) / 10);
	}
	function onPhotoModalOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closePhotoModal();
	}

	// ---------- Verifikasi Muatan/Bongkaran (E-POD review) ----------
	function stopCountFor(phaseKey: string) {
		return podStopCount(order, phaseKey);
	}
	function phaseStops(phaseKey: string): { verified: boolean; note: string }[] {
		return podStops(order, phaseKey);
	}
	function isPhaseVerified(phaseKey: string) {
		return podPhaseVerified(order, phaseKey);
	}
	function isStopVerified(phaseKey: string, stopIndex: number) {
		return !!phaseStops(phaseKey)[stopIndex]?.verified;
	}
	function phaseHasAnyPhoto(phaseKey: string, stopIndex: number | null = null) {
		if (stopIndex != null)
			return POD_PHOTO_TYPES.some((t) => podPhotoSlotsForStop(phaseKey, t.key, stopIndex).some((s) => s));
		return POD_PHOTO_TYPES.some((t) => podPhotoSlots(phaseKey, t.key).some((s) => s));
	}
	const UNIT_BY_FIELD: Record<string, string> = { totalBerat: 'Kg', kuantitas: 'Pcs', totalVolume: 'm³' };
	let verifyModalOpen = $state(false);
	let verifyModalPhase = $state('muat');
	let verifyModalStopIndex = $state(0);
	let verifyDraft = $state<Record<string, any>>({ totalBerat: '', kuantitas: '', totalVolume: '' });
	let verifyNote = $state('');
	let verifyStopCount = $derived(stopCountFor(verifyModalPhase));
	let verifyPhaseLabel = $derived.by(() => {
		const base = verifyModalPhase === 'muat' ? 'Muat' : 'Bongkar';
		return verifyStopCount > 1 ? `${base} ${verifyModalStopIndex + 1}` : base;
	});
	let verifyStopVerified = $derived(isStopVerified(verifyModalPhase, verifyModalStopIndex));
	let verifyPlanValues = $derived<Record<string, any>>({
		totalBerat: order?.totalTonnage ?? 0,
		kuantitas: totalKuantitas,
		totalVolume: totalVolumeM3
	});
	let verifyFirstSuratJalanPhoto = $derived(
		verifyStopCount > 1
			? podPhotoSlotsForStop(verifyModalPhase, 'suratJalan', verifyModalStopIndex)[0] || null
			: podPhotoSlots(verifyModalPhase, 'suratJalan')[0] || null
	);
	function verifyPhotosFor(typeKey: string): string[] {
		if (verifyStopCount > 1) {
			return podPhotoSlotsForStop(verifyModalPhase, typeKey, verifyModalStopIndex).filter(
				(s): s is string => !!s
			);
		}
		return podPhotoSlots(verifyModalPhase, typeKey).filter((s): s is string => !!s);
	}
	function parseMuatanField(fieldKey: string, rawValue: any) {
		if (rawValue == null || rawValue === '') return null;
		const clean = cargoValueNumber(rawValue);
		return fieldKey === 'totalVolume' ? Number(String(clean).replace(',', '.')) : parseThousands(clean);
	}
	function openVerifyModal(phaseKey: string, stopIndex = 0) {
		verifyModalPhase = phaseKey;
		verifyModalStopIndex = stopIndex;
		const field = phaseKey === 'muat' ? 'muatanMuat' : 'muatanBongkar';
		const existing = detail[field];
		const plan = verifyPlanValues;
		verifyDraft = {
			totalBerat:
				existing?.totalBerat != null ? parseMuatanField('totalBerat', existing.totalBerat) : plan.totalBerat,
			kuantitas:
				existing?.kuantitas != null ? parseMuatanField('kuantitas', existing.kuantitas) : plan.kuantitas,
			totalVolume:
				existing?.totalVolume != null
					? parseMuatanField('totalVolume', existing.totalVolume)
					: plan.totalVolume
		};
		verifyNote = phaseStops(phaseKey)[stopIndex]?.note || '';
		verifyModalOpen = true;
	}
	function closeVerifyModal() {
		verifyModalOpen = false;
	}
	let verifyDraftValid = $derived(
		['totalBerat', 'kuantitas', 'totalVolume'].every(
			(k) => verifyDraft[k] !== '' && !Number.isNaN(Number(verifyDraft[k]))
		)
	);
	async function confirmVerification() {
		if (!order) return;
		const phaseKey = verifyModalPhase;
		const stopIndex = verifyModalStopIndex;
		const newStops = phaseStops(phaseKey).map((s, i) =>
			i === stopIndex ? { verified: true, note: verifyNote.trim() } : s
		);
		// No status write here: the server owns the state machine, and once
		// every stop is verified kontrakStatus() itself reads
		// pod_{muat|bongkar}_terverifikasi off the updated detail.
		const muatanField = phaseKey === 'muat' ? 'muatanMuat' : 'muatanBongkar';
		const podPhotos = {
			...(detail.podPhotos || {}),
			[phaseKey]: { ...((detail.podPhotos || {})[phaseKey] || {}), stops: newStops }
		};
		const label = verifyPhaseLabel;
		await patchDetail({
			[muatanField]: {
				totalBerat: Number(verifyDraft.totalBerat),
				kuantitas: Number(verifyDraft.kuantitas),
				totalVolume: Number(verifyDraft.totalVolume)
			},
			podPhotos
		});
		// The driver's submission, when there is one: approving it is what
		// moves the shipment to loaded / unloaded (and finishes it).
		const pod = driverPod(phaseKey);
		if (pod && pod.status === 'submitted' && shipment && newStops.every((s) => s.verified)) {
			try {
				await api.put(`/shipments/${shipment.id}/pod/${pod.id}/review`, { approved: true });
				await Promise.all([loadShipment(), loadOrder()]);
			} catch (e: any) {
				toast(e?.response?.data?.message || 'Gagal menyetujui POD');
				return;
			}
		}
		toast(`POD ${label} berhasil diverifikasi`);
		closeVerifyModal();
		const nextUnverified = newStops.findIndex((s) => !s.verified);
		if (nextUnverified !== -1) openVerifyModal(phaseKey, nextUnverified);
	}
	// ------------------------------------------------------------------------
	// POD photos come from the driver app only. The console shows them and
	// verifies them; it never uploads, so nobody wonders which side's photo
	// is the real one. A stored value is either a URL (legacy / driver app)
	// or a private storage key, which is resolved to a signed URL when shown.
	// ------------------------------------------------------------------------
	let resolvedPodSrc = $state<Record<string, string>>({});
	/**
	 * A POD photo is stored as a key; the viewable URL is fetched once and
	 * kept. The fetch is started AFTER the render pass, not during it:
	 * writing state while a template is rendering is a hard error in Svelte
	 * 5 (state_unsafe_mutation), and it aborted the whole E-POD dialog —
	 * which is why "Selanjutnya" appeared to do nothing. `requestedPodSrc`
	 * is a plain Set on purpose, so touching it never counts as state.
	 */
	const requestedPodSrc = new Set<string>();
	function podSrc(src: string | null | undefined): string {
		if (!src) return '';
		if (/^(https?:|data:|blob:)/.test(src)) return src;
		const known = resolvedPodSrc[src];
		if (known) return known;
		if (!requestedPodSrc.has(src)) {
			requestedPodSrc.add(src);
			queueMicrotask(() => {
				downloadUrl(src)
					.then((u) => (resolvedPodSrc = { ...resolvedPodSrc, [src]: u }))
					.catch(() => requestedPodSrc.delete(src));
			});
		}
		return '';
	}

	async function rejectVerification() {
		const pod = driverPod(verifyModalPhase);
		if (pod && pod.status === 'submitted' && shipment) {
			const reason = verifyNote.trim();
			if (!reason) {
				toast('Tulis alasan penolakan di kolom Pesan agar driver tahu apa yang harus diperbaiki');
				return;
			}
			try {
				await api.put(`/shipments/${shipment.id}/pod/${pod.id}/review`, { approved: false, reason });
				await loadShipment();
				toast(`POD ${verifyPhaseLabel} ditolak — driver diminta upload ulang`);
			} catch (e: any) {
				toast(e?.response?.data?.message || 'Gagal menolak POD');
				return;
			}
		} else {
			toast(`Verifikasi ${verifyPhaseLabel} dibatalkan`);
		}
		closeVerifyModal();
	}

	// ---------- E-POD verification gate ----------
	let gateModalOpen = $state(false);
	let gatePhase = $state('muat');
	let gateShown = $state(false);
	$effect(() => {
		const o = order;
		// The banner above the dialog reads the shipment's cargo check, so
		// the gate waits for it: opening first would show the dialog with no
		// "sesuai / tidak sesuai" flag and never bring it back.
		if (!o || gateShown || (o.statusCode === 'assigned' && !shipment)) return;
		if (o.status === 'verifikasi_pod_muat' || o.status === 'verifikasi_pod_bongkar') {
			gatePhase = o.status === 'verifikasi_pod_muat' ? 'muat' : 'bongkar';
			gateModalOpen = true;
		}
		gateShown = true;
	});
	let gatePhaseLabel = $derived(gatePhase === 'muat' ? 'Muat' : 'Bongkar');
	function proceedFromGate() {
		gateModalOpen = false;
		const firstUnverified = podFirstUnverifiedStop(order, gatePhase);
		openVerifyModal(gatePhase, firstUnverified === -1 ? 0 : firstUnverified);
	}
	/**
	 * The "sesuai / tidak sesuai" banner above the verification dialog.
	 *
	 * The answer comes from whoever checked the cargo on the spot — the
	 * driver at muat, the receiving PIC at bongkar — which the shipment
	 * records. Only when no one has answered (an order verified entirely in
	 * the console) does it fall back to comparing the figures already typed
	 * against the plan.
	 */
	let gateFlag = $derived.by(() => {
		const checked =
			gatePhase === 'muat'
				? { at: shipment?.loadingCargoCheckedAt, matches: shipment?.loadingCargoMatches }
				: { at: shipment?.unloadingCargoCheckedAt, matches: shipment?.unloadingCargoMatches };
		if (checked.at) return checked.matches === false ? 'tidak_sesuai' : 'sesuai';
		const field = gatePhase === 'muat' ? 'muatanMuat' : 'muatanBongkar';
		const actual = detail[field];
		if (!actual) return null;
		const plan = verifyPlanValues;
		const matches = CARGO_FIELDS.every((f) => parseMuatanField(f.key, actual[f.key]) === Number(plan[f.key]));
		return matches ? 'sesuai' : 'tidak_sesuai';
	});
	/** What the driver or the PIC wrote when they said "tidak sesuai". */
	/** What the receiving PIC counted, as read back from the shipment. */
	let picAudit = $derived.by(() => {
		const rows: string[] = [];
		const w = shipment?.unloadingAuditWeightKg;
		const v = shipment?.unloadingAuditVolumeM3;
		const q = shipment?.unloadingAuditQuantity;
		if (w != null) rows.push(`${Number(w).toLocaleString('id-ID')} kg`);
		if (v != null) rows.push(`${Number(v).toLocaleString('id-ID')} m³`);
		if (q != null) rows.push(`${Number(q).toLocaleString('id-ID')} koli`);
		return rows;
	});

	let gateFlagNote = $derived(
		gatePhase === 'muat' ? (shipment?.loadingCargoNote ?? '') : (shipment?.unloadingCargoNote ?? '')
	);

	// ---------- Route ----------
	let routeAllPoints = $derived.by(() => {
		if (!order) return [] as { warehouse: any; label: string; pic?: { name?: string; phone?: string } | null }[];
		if ((order.loadingPoints?.length || 0) > 0 && (order.unloadingPoints?.length || 0) > 0) {
			const loading: string[] = order.loadingPoints;
			const unloading: string[] = order.unloadingPoints;
			return [
				...loading.map((wid, i) => ({
					warehouse: warehouseFor(wid),
					label: `Alamat Muat${loading.length > 1 ? ` ${i + 1}` : ''}`,
					pic: order.loadingPics?.[i] ?? (i === 0 ? order.loadingPic : null)
				})),
				...unloading.map((wid, i) => ({
					warehouse: warehouseFor(wid),
					label: `Alamat Bongkar${unloading.length > 1 ? ` ${i + 1}` : ''}`,
					pic: order.unloadingPics?.[i] ?? (i === unloading.length - 1 ? order.unloadingPic : null)
				}))
			];
		}
		if (!order.rute || !order.rute.includes(' — ')) return [];
		const [muatSide, bongkarSide] = order.rute.split(' — ');
		const loadingNames = (muatSide || '')
			.split(' + ')
			.map((s: string) => s.trim())
			.filter(Boolean);
		const unloadingNames = (bongkarSide || '')
			.split(' + ')
			.map((s: string) => s.trim())
			.filter(Boolean);
		return [
			...loadingNames.map((name: string, i: number) => ({
				warehouse: warehouseByName(name),
				label: `Alamat Muat${loadingNames.length > 1 ? ` ${i + 1}` : ''}`
			})),
			...unloadingNames.map((name: string, i: number) => ({
				warehouse: warehouseByName(name),
				label: `Alamat Bongkar${unloadingNames.length > 1 ? ` ${i + 1}` : ''}`
			}))
		];
	});
	let hasRoutePoints = $derived(routeAllPoints.length > 0);
	let routeTotalKm = $derived.by(() => {
		if (haulKm) return haulKm;
		const points = routeAllPoints.map((p) => p.warehouse);
		if (points.length < 2 || points.some((w) => !w)) return null;
		return totalRouteKm(points);
	});

	// ---------- Uang Sangu ----------
	const AVERAGE_TRUCK_SPEED_KMH = 40;
	function truckLocationCoords() {
		const v = vehicle;
		if (!v) return null;
		if (v.lastLocation?.latitude != null && v.lastLocation?.longitude != null) {
			return { lat: Number(v.lastLocation.latitude), lng: Number(v.lastLocation.longitude) };
		}
		const city = v.location || v.attributes?.location || '';
		const w = Object.values(warehouses).find(
			(x: any) => x && (x.kota || '').trim().toLowerCase() === String(city).trim().toLowerCase()
		);
		if (w && w.lat != null && w.lng != null) return { lat: w.lat, lng: w.lng };
		return city ? coordsForCity(city) : null;
	}
	let estimatedBiayaMenujuMuat = $derived.by(() => {
		if (!order?.assignedTruckPlate) return null;
		let distanceKm: number | null = approachKm;
		if (distanceKm == null) {
			const truckCoords = truckLocationCoords();
			const muatWarehouse = warehouseFor((order.loadingPoints || [])[0]);
			if (!truckCoords || !muatWarehouse || muatWarehouse.lat == null || muatWarehouse.lng == null)
				return null;
			distanceKm =
				Math.round(haversineKm(truckCoords, { lat: muatWarehouse.lat, lng: muatWarehouse.lng }) * 10) / 10;
		}
		const etaJam = Math.round((distanceKm / AVERAGE_TRUCK_SPEED_KMH) * 10) / 10;
		const leg = computeUangSangu(
			{ detail: { tripEstimate: { jarakKm: distanceKm, etaJam, truckType: order.assignedTruckType || '' } } },
			tripAllowance
		);
		return Math.round(leg.bbm.value + leg.uangMakan.value);
	});
	let orderForUangSangu = $derived.by(() => {
		if (!order) return null;
		return {
			...order,
			detail: {
				...(order.detail || {}),
				biayaMenujuMuat: order.detail?.biayaMenujuMuat ?? estimatedBiayaMenujuMuat,
				biayaMenujuMuatEstimated: order.detail?.biayaMenujuMuat == null,
				tripEstimate: {
					jarakKm: routeTotalKm || 0,
					etaJam: routeTotalKm ? Math.round((routeTotalKm / AVERAGE_TRUCK_SPEED_KMH) * 10) / 10 : 0,
					truckType: order.assignedTruckType || ''
				}
			}
		};
	});
	let uangSangu = $derived<any>(
		orderForUangSangu ? computeUangSangu(orderForUangSangu, tripAllowance) : null
	);

	let uangSanguFinalized = $derived(!!detail.uangSanguFinalized);
	let canEditPreTripEstimate = $derived(!uangSanguFinalized);
	let canFinalizeUangSangu = $derived(!!order?.assignedTruckPlate && !uangSanguFinalized);
	let sanguEditMode = $state(false);
	let showSanguEdit = $derived(canEditPreTripEstimate && sanguEditMode);
	let finalizeSanguOpen = $state(false);
	let finalizeSanguBusy = $state(false);
	function confirmFinalizeUangSangu() {
		if (!canFinalizeUangSangu) return;
		finalizeSanguOpen = true;
	}
	async function doFinalizeUangSangu() {
		finalizeSanguBusy = true;
		try {
			await patchDetail({ uangSanguFinalized: true });
			toast('Uang Sangu berhasil difinalisasi');
			finalizeSanguOpen = false;
		} catch {
			/* toasted */
		} finally {
			finalizeSanguBusy = false;
		}
	}

	// ---------- Rekonsiliasi Post-Trip ----------
	let postTripRecon = $derived<any>(
		order ? computeOrderKontrakRecon(order, tripAllowance, uangSangu?.uangMakan.value ?? 0) : null
	);

	let reconModalOpen = $state(false);
	let reconDraft = $state<{ components: any[] }>({ components: [] });
	let reconDraftTotal = $derived(reconDraft.components.reduce((sum, c) => sum + (Number(c.nominal) || 0), 0));
	let editingReconField = $state<string | null>(null);
	function openReconModal() {
		if (!postTripRecon) return;
		reconDraft = { components: postTripRecon.components.map((c: any) => ({ ...c })) };
		reconModalOpen = true;
	}
	function closeReconModal() {
		reconModalOpen = false;
		editingReconField = null;
	}
	function startEditReconField(c: any) {
		editingReconField = c.id;
		c.nominalDisplay = formatThousands(Math.round(c.nominal));
	}
	function onReconFieldInput(c: any, e: Event) {
		c.nominalDisplay = formatThousands((e.target as HTMLInputElement).value);
	}
	function confirmReconField(c: any) {
		c.nominal = parseThousands(c.nominalDisplay);
		editingReconField = null;
	}
	function onReconOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeReconModal();
	}
	async function saveReconModal() {
		if (!order) return;
		const rejectedWithoutNote = reconDraft.components.some(
			(c) => c.isReimburse && c.status === 'rejected' && !(c.note || '').trim()
		);
		if (rejectedWithoutNote) {
			toast('Isi catatan untuk driver sebelum menolak pengajuan reimburse');
			return;
		}
		const byId: Record<string, any> = Object.fromEntries(reconDraft.components.map((c) => [c.id, c]));
		const basePostTrip = order.detail?.postTrip || {
			actualNights: postTripRecon.nights,
			actualDays: postTripRecon.days,
			reimburse: []
		};
		const reimburse = (basePostTrip.reimburse || []).map((r: any, i: number) => {
			const c = byId[`reimburse_${i}`];
			return c ? { ...r, status: c.status, note: c.note } : r;
		});
		await patchDetail({
			postTrip: {
				...basePostTrip,
				reimburse,
				finalized: { lodging: byId.lodging.finalized, meal: byId.meal.finalized },
				overrides: { lodging: byId.lodging.nominal, meal: byId.meal.nominal }
			}
		});
		toast('Rekonsiliasi post-trip diperbarui');
		reconModalOpen = false;
	}

	let overrideDraft = $state<Record<string, number | null>>({
		bbm: null,
		tol: null,
		uangMakan: null,
		menujuMuat: null
	});
	let editingField = $state<string | null>(null);
	let overrideDisplay = $state<Record<string, string>>({ bbm: '', tol: '', uangMakan: '', menujuMuat: '' });

	function openSanguEdit() {
		sanguEditMode = true;
		const existing = detail.uangSanguOverrides || {};
		overrideDraft = {
			bbm: existing.bbm ?? null,
			tol: existing.tol ?? null,
			uangMakan: existing.uangMakan ?? null,
			menujuMuat: existing.menujuMuat ?? null
		};
	}
	function closeSanguEdit() {
		sanguEditMode = false;
		addingComponentOpen = false;
		editingField = null;
	}
	function startEditField(field: string) {
		editingField = field;
		const current = overrideDraft[field] ?? uangSangu[field].value;
		overrideDisplay[field] = formatThousands(Math.round(current));
	}
	function onOverrideInput(field: string, e: Event) {
		overrideDisplay[field] = formatThousands((e.target as HTMLInputElement).value);
	}
	function confirmEditField(field: string) {
		overrideDraft[field] = parseThousands(overrideDisplay[field]);
		editingField = null;
	}
	async function saveUangSanguUpdate() {
		const overrides: Record<string, number> = {};
		if (overrideDraft.bbm !== null) overrides.bbm = overrideDraft.bbm;
		if (overrideDraft.tol !== null) overrides.tol = overrideDraft.tol;
		if (overrideDraft.uangMakan !== null) overrides.uangMakan = overrideDraft.uangMakan;
		if (overrideDraft.menujuMuat !== null) overrides.menujuMuat = overrideDraft.menujuMuat;
		await patchDetail({ uangSanguOverrides: overrides });
		toast('Data Uang Sangu diperbarui');
		closeSanguEdit();
	}

	let sanguSubtotalDisplay = $derived.by(() => {
		if (!uangSangu) return 0;
		const bbm = overrideDraft.bbm ?? uangSangu.bbm.value;
		const tol = overrideDraft.tol ?? uangSangu.tol.value;
		const uangMakan = overrideDraft.uangMakan ?? uangSangu.uangMakan.value;
		const menujuMuat = overrideDraft.menujuMuat ?? uangSangu.menujuMuat.value;
		return bbm + tol + uangMakan + menujuMuat + uangSangu.ferry.value + uangSangu.customTotal;
	});

	let ferryPriceDisplay = $state('');
	function onFerryPriceInput(e: Event) {
		ferryPriceDisplay = formatThousands((e.target as HTMLInputElement).value);
	}
	async function saveFerryPrice() {
		const value = parseThousands(ferryPriceDisplay);
		if (!value) {
			toast('Isi harga kapal terlebih dahulu');
			return;
		}
		await patchDetail({ biayaFerryManual: value });
		toast('Harga kapal disimpan');
		ferryPriceDisplay = '';
	}

	let addingComponentOpen = $state(false);
	let newComponentLabel = $state('');
	let newComponentNominalDisplay = $state('');
	function openAddComponent() {
		addingComponentOpen = true;
		newComponentLabel = '';
		newComponentNominalDisplay = '';
	}
	function onNewComponentNominalInput(e: Event) {
		newComponentNominalDisplay = formatThousands((e.target as HTMLInputElement).value);
	}
	async function addCustomComponent() {
		const nominal = parseThousands(newComponentNominalDisplay);
		if (!newComponentLabel.trim() || !nominal) {
			toast('Isi nama komponen dan nominal terlebih dahulu');
			return;
		}
		const components = [...(detail.customComponents || []), { label: newComponentLabel.trim(), nominal }];
		await patchDetail({ customComponents: components });
		toast('Komponen biaya ditambahkan');
		addingComponentOpen = false;
	}
	async function removeCustomComponent(index: number) {
		const components = (detail.customComponents || []).filter((_: any, i: number) => i !== index);
		await patchDetail({ customComponents: components });
		toast('Komponen biaya dihapus');
	}

	let sectionOpen = $state<Record<string, boolean>>({
		pengiriman: true,
		muatan: true,
		podPhotos: true,
		permintaan: true,
		sangu: true,
		recon: true,
		ltl: true
	});
	function toggleSection(key: string) {
		sectionOpen[key] = !sectionOpen[key];
	}

	// ---------- Linimasa ----------
	let linimasaTab = $state('order');
	/**
	 * Linimasa Order — what actually happened, and when.
	 *
	 * It used to walk the status sequence and stamp every milestone with the
	 * order's creation time, which put the wrong hour on every line, invented
	 * steps the delivery never took (the sequence lists both the sesuai and
	 * tidak-sesuai branches), and missed the ones the sequence has no status
	 * for — the OTP, each POD submission and its review. Each entry below is
	 * a recorded timestamp: no timestamp, no line.
	 */
	let orderTimeline = $derived.by(() => {
		if (!order) return [] as { time: string; title: string; actor: string; role: string; at: number }[];
		const driver = order.assignedDriverName || 'Driver';
		const pic = shipment?.unloadingCargoCheckedVia === 'field' ? 'PIC Gudang' : TRANSPORTER_NAME;
		const events: { time: string; title: string; actor: string; role: string; at: number }[] = [];
		const add = (iso: string | null | undefined, title: string, actor: string, role: string) => {
			if (!iso) return;
			const at = new Date(iso).getTime();
			if (Number.isNaN(at)) return;
			events.push({ time: formatTimestampLabel(iso), title, actor, role, at });
		};

		/**
		 * Every round of one stage's POD, not just the last.
		 *
		 * A rejected POD is re-submitted, and the sheet counts each round:
		 * submit, pengecekan, ditolak, submit again, pengecekan again,
		 * terverifikasi. Reading only the latest submission — which is what
		 * this did — erased the rejection and the attempt that earned it,
		 * which is exactly the history somebody looks here to find.
		 */
		const podRounds = (stage: string, label: string) => {
			const all = (shipment?.podHistory ?? []).filter((p: any) => p.stage === stage);
			// podHistory is newest first; fall back to the latest-per-stage
			// read for a server that predates it.
			const rounds = all.length
				? [...all].sort((a: any, b: any) => String(a.submittedAt).localeCompare(String(b.submittedAt)))
				: [driverPod(stage === 'loading' ? 'muat' : 'bongkar')].filter(Boolean);
			for (const pod of rounds) {
				add(pod.submittedAt, `Submit POD & Selesai ${label}`, driver, 'Driver');
				add(pod.submittedAt, `Pengecekan POD ${label}`, TRANSPORTER_NAME, 'Planner');
				if (pod.status === 'rejected') {
					add(pod.reviewedAt, `POD ${label} Ditolak`, TRANSPORTER_NAME, 'Planner');
				} else if (pod.status === 'approved') {
					add(pod.reviewedAt, `POD ${label} Terverifikasi`, TRANSPORTER_NAME, 'Planner');
				}
			}
		};

		// The titles are the sheet's Status Order column, word for word. Where
		// the sheet lists several statuses against one trigger ("Submit POD"),
		// all of them are shown: the planner reads this list expecting the
		// steps they were promised, and folding them lost three of the four
		// the loading POD is supposed to raise. Sesuai / tidak sesuai is NOT a
		// status — the answer itself lives on the E-POD card.
		add(order.createdAt, 'Order Dibuat', TRANSPORTER_NAME, 'Planner');
		if (order.assignedTruckPlate) {
			add(
				shipment?.createdAt ?? order.createdAt,
				'Driver Dipilih',
				`${order.assignedDriverName || 'Driver'} · ${order.assignedTruckPlate}`,
				'Planner'
			);
		}
		add(shipment?.acceptedAt, 'Driver Menerima Order', driver, 'Driver');
		add(shipment?.startedToLoadingAt, 'Menuju Titik Muat', driver, 'Driver');
		add(shipment?.arrivedLoadingAt, 'Sampai di Titik Muat', driver, 'Driver');
		add(shipment?.loadingStartedAt, 'Mulai Muat', driver, 'Driver');
		add(shipment?.loadingCargoCheckedAt, 'Verifikasi Item Muat', driver, 'Driver');
		add(shipment?.loadingCargoCheckedAt, 'Item Muatan Telah Diverifikasi', driver, 'Driver');
		podRounds('loading', 'Muat');
		add(shipment?.startedToUnloadingAt, 'Menuju Titik Bongkar', driver, 'Driver');
		add(shipment?.arrivedUnloadingAt, 'Sampai di Titik Bongkar', driver, 'Driver');
		add(shipment?.handoverVerifiedAt, 'OTP Bongkar Terverifikasi', driver, 'Driver');
		add(shipment?.unloadingStartedAt, 'Mulai Bongkar', driver, 'Driver');
		add(shipment?.unloadingCargoCheckedAt, 'Verifikasi Item Bongkar', pic, 'PIC');
		add(shipment?.unloadingCargoCheckedAt, 'Item Muatan Telah Diverifikasi', pic, 'PIC');
		podRounds('unloading', 'Bongkar');
		add(shipment?.finishedAt, 'Order Selesai', TRANSPORTER_NAME, 'Planner');

		// Recorded order, not declared order: a step taken late shows late.
		return events.map((e, i) => ({ ...e, i })).sort((a, b) => a.at - b.at || a.i - b.i);
	});

	async function refreshData() {
		await loadOrder();
		toast('Data diperbarui');
	}

	// ---------- Linimasa Dokumen ----------
	const SYSTEM_DOCUMENTS = [
		{
			key: 'settlement',
			label: 'Dokumen Settlement Summary',
			milestone: 'pengiriman_terkonfirmasi',
			ext: 'jpeg'
		},
		{ key: 'epodMuat', label: 'E-POD Proses Muat', milestone: 'pod_muat_terverifikasi', ext: 'pdf' },
		{ key: 'epodBongkar', label: 'E-POD Proses Bongkar', milestone: 'pod_bongkar_terverifikasi', ext: 'pdf' }
	];
	let systemDocuments = $derived(
		SYSTEM_DOCUMENTS.map((d) => ({
			...d,
			available: atOrPassed(order?.status, d.milestone),
			filename: `E-POD - (${order?.idOrder}).${d.ext}`
		}))
	);
	const SHIPPER_DOCUMENTS = [
		{ key: 'do', label: 'Delivery Order (DO)', filename: 'Delivery Order (DO).pdf' },
		{ key: 'suratJalan', label: 'Surat Jalan', filename: 'Surat Jalan.pdf' },
		{ key: 'spk', label: 'Surat Perintah Kerja (SPK)', filename: 'Surat Perintah Kerja.pdf' },
		{ key: 'pickSlip', label: 'Pick Slip', filename: 'Pick Slip.pdf' }
	].map((d) => ({ ...d, available: false }));
	const TRANSPORTER_UPLOAD_FIELDS = [
		{ key: 'resi', label: 'Unggah Resi', formatHint: 'Format: JPG, PNG, PDF (Maks. 5 MB)' },
		{
			key: 'kuitansi',
			label: 'Unggah Kuitansi Biaya Tambahan',
			formatHint: 'Format: JPG, JPEG, PNG (Maks. 5 MB)'
		},
		{ key: 'pendukung', label: 'Unggah Dokumen Pendukung', formatHint: 'Format: JPG, PNG, PDF (Maks. 5 MB)' }
	];
	let transporterUploads = $state(TRANSPORTER_UPLOAD_FIELDS.map((u) => ({ ...u, filename: '' })));
	function onTransporterFileChosen(field: { label: string; filename: string }, e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		field.filename = file.name;
		toast(`${field.label}: ${file.name} dipilih`);
	}
	const EPOD_DOC_KEYS = new Set(['epodMuat', 'epodBongkar']);
	let epodDocOpen = $state(false);
	function openEpodDocument() {
		epodDocOpen = true;
	}
	function closeEpodDocument() {
		epodDocOpen = false;
	}
	function onEpodDocOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeEpodDocument();
	}
	async function printEpodDocument() {
		epodDocOpen = true;
		await tick();
		document.body.classList.add('epod-printing');
		window.print();
		document.body.classList.remove('epod-printing');
	}
	function epodDocValue(phaseField: string, fieldKey: string) {
		const actual = detail[phaseField];
		return actual ? `${cargoValueNumber(actual[fieldKey])} ${UNIT_BY_FIELD[fieldKey]}` : null;
	}
	// The note on the E-POD document: what the driver wrote with their
	// submission, else the console's own note for that phase.
	let epodMuatNote = $derived<string>(driverPod('muat')?.note || detail.podPhotos?.muat?.note || '');
	let epodBongkarNote = $derived<string>(driverPod('bongkar')?.note || detail.podPhotos?.bongkar?.note || '');

	function viewDocument(d: { key: string; label: string }) {
		if (EPOD_DOC_KEYS.has(d.key)) {
			openEpodDocument();
			return;
		}
		toast(`Pratinjau ${d.label} segera hadir`);
	}
	function downloadDocument(d: { key: string; label: string }) {
		if (EPOD_DOC_KEYS.has(d.key)) {
			printEpodDocument();
			return;
		}
		toast(`Unduh ${d.label} segera hadir`);
	}
	function downloadAllDocuments() {
		if (!systemDocuments.some((d) => d.available)) {
			toast('Belum ada dokumen yang bisa diunduh');
			return;
		}
		toast('Unduh semua dokumen segera hadir');
	}

	// ---------- Linimasa Invoice ----------
	let invoiceAvailable = $derived(atOrPassed(order?.status, 'pengemudi_ditugaskan'));
	let invoiceFinalized = $derived(!!detail.invoiceFinalized);
	let invoicePaid = $derived(detail.invoiceProgress?.billing?.status === 'paid');
	function viewInvoice() {
		goto(`${basePath}/order/kontrak/${id}/invoice`);
	}
	function downloadInvoice() {
		toast('Unduh Invoice segera hadir');
	}

	function backToList() {
		goto(`${basePath}/order/kontrak`);
	}

	let currentStatusKey = $derived(order?.status || 'penugasan_pengemudi');
</script>

{#snippet routeRows(showReq: boolean)}
	<div class="route-rows" style="grid-template-rows: repeat({routeAllPoints.length}, auto);">
		{#each routeAllPoints as pt, i (`${pt.label}-${i}`)}
			<div class="route-label" class:route-label--bongkar={i > 0} style="grid-row: {i + 1};">
				<b>{pt.label}</b>
				{#if showReq}<span class="req">*</span>{/if}
			</div>
			<div class="route-value" class:route-value--bongkar={i > 0} style="grid-row: {i + 1};">
				<div class="addr-kota">{pt.warehouse?.kota || '-'}</div>
				<div class="addr-label">{pt.warehouse?.nama || '-'}</div>
				<div class="addr-detail">{pt.warehouse?.alamat || '-'}</div>
				{#if pt.pic?.name}
					<div class="addr-detail">PIC: {pt.pic.name}{pt.pic.phone ? ` · ${pt.pic.phone}` : ''}</div>
				{/if}
			</div>
		{/each}
		<div class="route-marker" style="grid-row: 1 / {routeAllPoints.length + 1};">
			<span class="route-marker-line"></span>
			<span class="route-marker-distance">{routeTotalKm ? `${routeTotalKm} Km` : '-'}</span>
			<span class="route-marker-line"></span>
		</div>
	</div>
{/snippet}

{#snippet podSlots(slots: (string | null)[], title: string)}
	<div class="pod-photo-cell">
		{#each slots as src, i (i)}
			{#if src}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="pod-photo-slot filled" onclick={() => openPhotoModal(title, podSrc(src))}>
					{#if podSrc(src)}<img src={podSrc(src)} alt="" />{/if}
					<button
						type="button"
						class="pod-photo-eye"
						title="Lihat foto"
						onclick={(e) => {
							e.stopPropagation();
							openPhotoModal(title, podSrc(src));
						}}
					>
						<span class="icon-wrap"><Eye size={16} /></span>
					</button>
				</div>
			{:else}
				<div class="pod-photo-slot"></div>
			{/if}
		{/each}
	</div>
{/snippet}

{#snippet epodInfoOrder()}
	<div class="epod-card epod-card--auto">
		<div class="epod-card-head">Informasi Order</div>
		<div class="epod-card-body epod-info-grid">
			<div class="epod-info-row"><span>ID Order</span><b>{order?.idOrder}</b></div>
			<div class="epod-info-row"><span>Tanggal Rilis</span><b>{order?.tanggalPickup || '-'}</b></div>
			<div class="epod-info-row">
				<span>Status</span>
				<span class="badge {statusBadgeClass(currentStatusKey)}">{statusLabel(currentStatusKey)}</span>
			</div>
		</div>
	</div>
{/snippet}

{#snippet epodRouteGrid()}
	<div class="epod-route-grid">
		<div class="epod-card">
			<div class="epod-card-head">Rute</div>
			{#if hasRoutePoints}
				<div class="epod-card-body">
					{@render routeRows(false)}
				</div>
			{:else}
				<div class="epod-card-body hint">{order?.rute || '-'}</div>
			{/if}
		</div>
		<FleetDriverInfoCard
			truckPlate={order?.assignedTruckPlate}
			truckType={order?.assignedTruckType}
			truckCapacity={assignedTruckCapacity}
			driverName={order?.assignedDriverName}
			driverPhone={assignedDriverPhone}
		/>
	</div>
{/snippet}

<div class="spot-detail-page">
	<!-- TEMPORARY: Mode Uji (end-to-end testing) -->
	<TestModeStrip orderId={id} {basePath} onchanged={() => loadOrder()} />
	{#if !order}
		{#if loaded}
			<div class="card card-pad">
				<div class="empty">
					<div class="eic">📄</div>
					Order Kontrak tidak ditemukan.<br />
					<button class="btn btn-text" style="margin-top:10px;" onclick={backToList}
						>&larr; Kembali ke daftar Order Kontrak</button
					>
				</div>
			</div>
		{/if}
	{:else}
		<button class="btn btn-outline btn-sm" style="margin-bottom:14px;" onclick={backToList}
			>&larr; Kembali ke Daftar Order</button
		>

		<div class="spot-detail-breadcrumb">
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<span style="cursor:pointer;" onclick={backToList}>ORDER KONTRAK</span>
			<span class="sep">&gt;</span>
			<b>{order.idOrder}</b>
		</div>

		<div class="spot-detail-grid">
			<!-- LEFT COLUMN -->
			<div>
				<div class="shipper-block shipper-block--row">
					<div class="shipper-block-title">Shipper</div>
					<div class="shipper-block-id">
						<div class="shipper-logo">
							{initials(order.shipperName)}
							<span class="verified-dot">&#10003;</span>
						</div>
						<div>
							<div class="shipper-block-name">{order.shipperName}</div>
						</div>
					</div>
				</div>

				<!-- Informasi Pengiriman -->
				<div class="detail-section">
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="detail-section-head"
						class:open={sectionOpen.pengiriman}
						onclick={() => toggleSection('pengiriman')}
					>
						<h3>Informasi Pengiriman</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					<div class="detail-section-body" style:display={sectionOpen.pengiriman ? undefined : 'none'}>
						<div class="detail-row">
							<div class="detail-row-label"><b>Status</b></div>
							<div class="detail-row-value">
								<span class="badge {statusBadgeClass(currentStatusKey)}">{statusLabel(currentStatusKey)}</span
								>
							</div>
						</div>
						<div class="detail-row">
							<div class="detail-row-label"><b>Tipe Pengiriman</b></div>
							<div class="detail-row-value">
								<span
									class="badge {shipmentType === 'Multi Shipment'
										? 'badge-active'
										: shipmentType === 'LTL'
											? 'badge-self'
											: 'badge-planner'}"
								>
									{shipmentType}
								</span>
							</div>
						</div>
						<div class="detail-row">
							<div class="detail-row-label"><b>Jadwal Muat</b></div>
							<div class="detail-row-value">{order.tanggalPickup || '-'}</div>
						</div>
						<div class="detail-row">
							<div class="detail-row-label"><b>Agreement</b></div>
							<div class="detail-row-value">{order.agreementId || '-'}</div>
						</div>

						{#if hasRoutePoints}
							{@render routeRows(true)}
						{:else}
							<div class="detail-row">
								<div class="detail-row-label"><b>Rute</b></div>
								<div class="detail-row-value">{order.rute || '-'}</div>
							</div>
						{/if}
					</div>
				</div>

				<!-- Pengiriman Gabungan (LTL) -->
				{#if ltlSiblingOrders.length}
					<div class="detail-section">
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="detail-section-head"
							class:open={sectionOpen.ltl}
							onclick={() => toggleSection('ltl')}
						>
							<h3>Pengiriman Gabungan (LTL)</h3>
							<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
						</div>
						<div class="detail-section-body" style:display={sectionOpen.ltl ? undefined : 'none'}>
							<div class="hint" style="margin-bottom:10px;">
								Order ini berbagi 1 truck ({order.assignedTruckPlate}) dengan {ltlSiblingOrders.length} order lain:
							</div>
							{#each ltlSiblingOrders as o (o.id)}
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
								<div class="ltl-sibling-row" onclick={() => goToSiblingOrder(o)}>
									<div>
										<div class="ltl-sibling-id mono">{o.idOrder}</div>
										<div class="ltl-sibling-name">{o.shipperName}</div>
									</div>
									<span class="icon-wrap"><Search size={16} /></span>
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Detail Muatan -->
				<div class="detail-section">
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="detail-section-head"
						class:open={sectionOpen.muatan}
						onclick={() => toggleSection('muatan')}
					>
						<h3>Detail Muatan</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					<div class="detail-section-body" style:display={sectionOpen.muatan ? undefined : 'none'}>
						<div class="detail-row">
							<div class="detail-row-label">
								<b>Tipe Muatan</b> <span class="req">*</span>
								<span class="hint">Tipe muatan yang akan diangkut</span>
							</div>
							<div class="detail-row-value"><b>{order.muatan || '-'}</b></div>
						</div>
						{#if cargoComparison}
							<div class="muatan-compare-row muatan-compare-row--head">
								<span></span>
								{#each cargoComparison.phases as p (p.key)}
									<span>{p.label}</span>
								{/each}
							</div>
							{#each cargoComparison.rows as row (row.key)}
								<div class="muatan-compare-row">
									<span class="muatan-compare-field">{row.label}</span>
									{#each row.values as v, i (i)}
										<span class="muatan-compare-value">{v ?? '0'}</span>
									{/each}
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Foto POD -->
				<div class="detail-section">
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="detail-section-head"
						class:open={sectionOpen.podPhotos}
						onclick={() => toggleSection('podPhotos')}
					>
						<h3>Foto POD</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					<div class="detail-section-body" style:display={sectionOpen.podPhotos ? undefined : 'none'}>
						<div class="pod-photo-grid">
							<div class="pod-photo-grid-row pod-photo-grid-row--head">
								<span></span>
								{#each POD_PHOTO_TYPES as type (type.key)}
									<span>{type.label}</span>
								{/each}
							</div>
							{#if stopCountFor('muat') > 1}
								{#each phaseStops('muat') as _st, si (`muat-photo-row-${si}`)}
									<div class="pod-photo-grid-row">
										<span class="pod-photo-grid-label">Muat {si + 1}</span>
										{#each POD_PHOTO_TYPES as type (`muat-${si}-${type.key}`)}
											{@render podSlots(podPhotoSlotsForStop('muat', type.key, si), `${type.label} — Muat ${si + 1}`)}
										{/each}
									</div>
								{/each}
							{:else}
								<div class="pod-photo-grid-row">
									<span class="pod-photo-grid-label">Muat</span>
									{#each POD_PHOTO_TYPES as type (`muat-${type.key}`)}
										{@render podSlots(podPhotoSlots('muat', type.key), `${type.label} — Muat`)}
									{/each}
								</div>
							{/if}
							{#if stopCountFor('bongkar') > 1}
								{#each phaseStops('bongkar') as _st, si (`bongkar-photo-row-${si}`)}
									<div class="pod-photo-grid-row">
										<span class="pod-photo-grid-label">Bongkar {si + 1}</span>
										{#each POD_PHOTO_TYPES as type (`bongkar-${si}-${type.key}`)}
											{@render podSlots(podPhotoSlotsForStop('bongkar', type.key, si), `${type.label} — Bongkar ${si + 1}`)}
										{/each}
									</div>
								{/each}
							{:else}
								<div class="pod-photo-grid-row">
									<span class="pod-photo-grid-label">Bongkar</span>
									{#each POD_PHOTO_TYPES as type (`bongkar-${type.key}`)}
										{@render podSlots(podPhotoSlots('bongkar', type.key), `${type.label} — Bongkar`)}
									{/each}
								</div>
							{/if}
							<div class="pod-photo-grid-row pod-photo-grid-row--status">
								<span class="pod-photo-grid-label">Status</span>
								<div class="pod-photo-status-columns">
									<div class="pod-photo-status-col">
										{#if stopCountFor('muat') > 1}
											{#each phaseStops('muat') as s, i (`muat-status-${i}`)}
												<div class="pod-photo-status-cell">
													<span>Muat {i + 1}:</span>
													<span class="badge {s.verified ? 'badge-active' : 'badge-wait'}"
														>{s.verified ? 'Terverifikasi' : 'Belum Terverifikasi'}</span
													>
												</div>
											{/each}
										{:else}
											<div class="pod-photo-status-cell">
												<span>Muat:</span>
												<span class="badge {isPhaseVerified('muat') ? 'badge-active' : 'badge-wait'}"
													>{isPhaseVerified('muat') ? 'Terverifikasi' : 'Belum Terverifikasi'}</span
												>
											</div>
										{/if}
									</div>
									<div class="pod-photo-status-col">
										{#if stopCountFor('bongkar') > 1}
											{#each phaseStops('bongkar') as s, i (`bongkar-status-${i}`)}
												<div class="pod-photo-status-cell">
													<span>Bongkar {i + 1}:</span>
													<span class="badge {s.verified ? 'badge-active' : 'badge-wait'}"
														>{s.verified ? 'Terverifikasi' : 'Belum Terverifikasi'}</span
													>
												</div>
											{/each}
										{:else}
											<div class="pod-photo-status-cell">
												<span>Bongkar:</span>
												<span class="badge {isPhaseVerified('bongkar') ? 'badge-active' : 'badge-wait'}"
													>{isPhaseVerified('bongkar') ? 'Terverifikasi' : 'Belum Terverifikasi'}</span
												>
											</div>
										{/if}
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<!-- Detail Permintaan -->
				<div class="detail-section">
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<div
						class="detail-section-head"
						class:open={sectionOpen.permintaan}
						onclick={() => toggleSection('permintaan')}
					>
						<h3>Detail Permintaan</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					<div class="detail-section-body" style:display={sectionOpen.permintaan ? undefined : 'none'}>
						{#if order.detail?.truckOptions?.length}
							<div class="review-chip-group">
								<span class="review-chip-label">Truck Options</span>
								{#each order.detail.truckOptions as key (key)}
									<span class="review-chip">{describeTruckOption(key).label}</span>
								{/each}
							</div>
						{/if}
						{#if order.additionalNeeds?.length}
							<div class="review-chip-group">
								<span class="review-chip-label">Additional Needs</span>
								{#each order.additionalNeeds as v (v)}
									<span class="review-chip">{additionalNeedsLabel(v)}</span>
								{/each}
							</div>
						{/if}
						{#if order.description}
							<div class="detail-row">
								<div class="detail-row-label"><b>Description</b></div>
								<div class="detail-row-value">{order.description}</div>
							</div>
						{/if}
						{#if order.warehouseLabel}
							<div class="detail-row">
								<div class="detail-row-label"><b>Warehouse Label</b></div>
								<div class="detail-row-value">{order.warehouseLabel}</div>
							</div>
						{/if}
						{#if order.externalId}
							<div class="detail-row">
								<div class="detail-row-label"><b>External ID</b></div>
								<div class="detail-row-value">{order.externalId}</div>
							</div>
						{/if}
						{#if order.orderSafety}
							<div class="detail-row">
								<div class="detail-row-label"><b>Order Safety</b></div>
								<div class="detail-row-value">{orderSafetyLabel(order.orderSafety)}</div>
							</div>
						{/if}
						{#if !order.additionalNeeds?.length && !order.description && !order.warehouseLabel && !order.externalId && !order.orderSafety}
							<div class="hint">Tidak ada permintaan tambahan.</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- RIGHT COLUMN -->
			<div>
				<!-- Geofencing for THIS order. Unset follows the company
				     setting, so the switch shows what will actually happen to
				     this delivery, and changing it here changes nothing else. -->
				<div class="linimasa-geofence">
					<GeofencingToggle
						orderId={order?.id ?? ''}
						orderValue={order?.geofencingEnabled ?? null}
						onchanged={(v) => raw && (raw = { ...raw, geofencingEnabled: v })}
					/>
				</div>
				<div class="linimasa-panel-head">
					<h3>Linimasa</h3>
					<button class="btn btn-outline btn-sm" onclick={refreshData}
						><span class="icon-wrap"><RefreshCw size={14} /></span> Perbarui Data</button
					>
				</div>
				<div class="method-tabs linimasa-tabs" style="margin-bottom:16px;">
					<button
						class="method-tab"
						class:active={linimasaTab === 'order'}
						onclick={() => (linimasaTab = 'order')}>Linimasa Order</button
					>
					<button
						class="method-tab"
						class:active={linimasaTab === 'driver'}
						onclick={() => (linimasaTab = 'driver')}>Linimasa Driver</button
					>
					<button
						class="method-tab"
						class:active={linimasaTab === 'dokumen'}
						onclick={() => (linimasaTab = 'dokumen')}>Linimasa Dokumen</button
					>
					<button
						class="method-tab"
						class:active={linimasaTab === 'invoice'}
						onclick={() => (linimasaTab = 'invoice')}>Linimasa Invoice</button
					>
				</div>

				{#if linimasaTab === 'order'}
					<FleetDriverInfoCard
						bare
						truckPlate={order.assignedTruckPlate}
						truckType={order.assignedTruckType}
						truckCapacity={assignedTruckCapacity}
						driverName={order.assignedDriverName}
						driverUsername={assignedDriverUsername}
						driverPhone={assignedDriverPhone}
					/>
					<div class="linimasa-timeline">
						{#each orderTimeline as event, i (i)}
							<div class="timeline-item">
								<div class="timeline-time">{event.time}</div>
								<div class="timeline-marker">
									<span class="timeline-dot"></span>
									{#if i < orderTimeline.length - 1}<span class="timeline-line"></span>{/if}
								</div>
								<div class="timeline-content">
									<div class="timeline-title">{event.title}</div>
									{#if event.actor}<div class="timeline-actor">{event.actor}</div>{/if}
									{#if event.role}<div class="timeline-role">{event.role}</div>{/if}
								</div>
							</div>
						{/each}
					</div>
				{:else if linimasaTab === 'driver'}
					<FleetDriverInfoCard
						truckPlate={order.assignedTruckPlate}
						truckType={order.assignedTruckType}
						truckCapacity={assignedTruckCapacity}
						driverName={order.assignedDriverName}
						driverPhone={assignedDriverPhone}
					/>
				{:else if linimasaTab === 'dokumen'}
					<div class="epod-doc-panel">
						<div class="epod-doc-header">
							<div class="epod-doc-header-title">
								<span class="icon-wrap"><Copy size={15} /></span> Lampiran Dokumen
							</div>
							<button type="button" class="btn btn-outline btn-sm" onclick={downloadAllDocuments}
								><span class="icon-wrap"><Download size={15} /></span> Unduh semua</button
							>
						</div>

						<div class="epod-doc-section-label">Sistem Auto-generated</div>
						{#each systemDocuments as d (d.key)}
							<div class="epod-doc-item" class:epod-doc-item--locked={!d.available}>
								<div class="epod-doc-item-row">
									<span class="epod-doc-item-icon" class:epod-doc-item-icon--muted={!d.available}
										><span class="icon-wrap"><FileText size={16} /></span></span
									>
									<div class="epod-doc-item-info">
										<div class="epod-doc-item-name">{d.label}</div>
										<div class="epod-doc-item-file">{d.available ? d.filename : 'Belum tersedia'}</div>
									</div>
									{#if d.available}
										<div class="epod-doc-item-actions">
											<button
												type="button"
												class="epod-doc-action-btn"
												title="Lihat"
												onclick={() => viewDocument(d)}
												><span class="icon-wrap"><Eye size={16} /></span></button
											>
											<button
												type="button"
												class="epod-doc-action-btn"
												title="Unduh"
												onclick={() => downloadDocument(d)}
												><span class="icon-wrap"><Download size={15} /></span></button
											>
										</div>
									{/if}
								</div>
								{#if d.available}
									<div class="epod-doc-item-timestamp">{formatTimestampLabel(order.createdAt)}</div>
								{/if}
							</div>
						{/each}

						<div class="epod-doc-section-label">Lampiran dari Transporter</div>
						{#each transporterUploads as u (u.key)}
							<div class="epod-doc-upload">
								<div class="epod-doc-upload-row">
									<span class="epod-doc-item-icon epod-doc-item-icon--muted"
										><span class="icon-wrap"><FileText size={16} /></span></span
									>
									<div class="epod-doc-item-info">
										<div class="epod-doc-item-name">{u.label}</div>
										<div class="epod-doc-item-file">{u.filename || 'File belum diupload'}</div>
									</div>
									<label class="epod-doc-upload-link">
										Pilih File
										<input type="file" hidden onchange={(e) => onTransporterFileChosen(u, e)} />
									</label>
								</div>
								<div class="epod-doc-upload-hint">{u.formatHint}</div>
							</div>
						{/each}

						<div class="epod-doc-section-label">Lampiran dari Shipper</div>
						{#each SHIPPER_DOCUMENTS as d (d.key)}
							<div class="epod-doc-item epod-doc-item--locked">
								<div class="epod-doc-item-row">
									<span class="epod-doc-item-icon epod-doc-item-icon--muted"
										><span class="icon-wrap"><FileText size={16} /></span></span
									>
									<div class="epod-doc-item-info">
										<div class="epod-doc-item-name">{d.label}</div>
										<div class="epod-doc-item-file">Belum diunggah shipper</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="epod-doc-panel">
						<div class="epod-doc-header">
							<div class="epod-doc-header-title">
								<span class="icon-wrap"><Copy size={15} /></span> Invoice
							</div>
						</div>

						<div class="epod-doc-item" class:epod-doc-item--locked={!invoiceAvailable}>
							<div class="epod-doc-item-row">
								<span class="epod-doc-item-icon" class:epod-doc-item-icon--muted={!invoiceAvailable}
									><span class="icon-wrap"><FileText size={16} /></span></span
								>
								<div class="epod-doc-item-info">
									<div class="epod-doc-item-name">Invoice Order</div>
									<div class="epod-doc-item-file">
										{invoiceAvailable ? `Invoice - (${order.idOrder}).pdf` : 'Belum tersedia'}
									</div>
								</div>
								{#if invoiceAvailable}
									<span class="badge {invoiceFinalized ? 'badge-active' : 'badge-wait'}"
										>{invoiceFinalized ? 'Final' : 'Draft'}</span
									>
								{/if}
								{#if invoiceFinalized}
									<span class="badge {invoicePaid ? 'badge-active' : 'badge-wait'}"
										>{invoicePaid ? 'Paid' : 'Unpaid'}</span
									>
								{/if}
								{#if invoiceAvailable}
									<div class="epod-doc-item-actions">
										<button type="button" class="epod-doc-action-btn" title="Lihat" onclick={viewInvoice}
											><span class="icon-wrap"><Eye size={16} /></span></button
										>
										<button type="button" class="epod-doc-action-btn" title="Unduh" onclick={downloadInvoice}
											><span class="icon-wrap"><Download size={15} /></span></button
										>
									</div>
								{/if}
							</div>
							{#if invoiceAvailable}
								<div class="epod-doc-item-timestamp">{formatTimestampLabel(order.createdAt)}</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Uang Sangu Driver (trip allowance) -->
				{#if uangSangu}
					<div class="detail-section">
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="detail-section-head"
							class:open={sectionOpen.sangu}
							onclick={() => toggleSection('sangu')}
						>
							<h3>Uang Sangu Driver</h3>
							<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
						</div>
						<div class="detail-section-body" style:display={sectionOpen.sangu ? undefined : 'none'}>
							{#each [{ key: 'menujuMuat', label: 'Biaya Perjalanan Menuju Lokasi Muat' }, { key: 'bbm', label: 'Biaya BBM' }, { key: 'tol', label: 'Biaya Tol' }, { key: 'uangMakan', label: 'Uang Makan' }] as row (row.key)}
								<div
									class="sangu-row"
									style:border-bottom={row.key === 'uangMakan' &&
									!(uangSangu.ferry.melewatiFerry || uangSangu.custom.length || canEditPreTripEstimate)
										? 'none'
										: undefined}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">{row.label}</div>
										<div class="sangu-row-formula">{uangSangu[row.key].formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if editingField === row.key}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={overrideDisplay[row.key]}
													oninput={(e) => onOverrideInput(row.key, e)}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button class="icon-btn" title="Konfirmasi" onclick={() => confirmEditField(row.key)}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={(overrideDraft[row.key] ?? uangSangu[row.key].value) === 0}>
												{formatIDR(overrideDraft[row.key] ?? uangSangu[row.key].value)}
											</span>
											{#if showSanguEdit}
												<button
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditField(row.key)}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>
											{/if}
										{/if}
									</div>
								</div>
							{/each}

							{#if uangSangu.ferry.melewatiFerry}
								<div
									class="sangu-row"
									style:border-bottom={uangSangu.custom.length || canEditPreTripEstimate ? undefined : 'none'}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">
											Biaya Ferry
											{#if uangSangu.ferry.needsInput}<span class="sangu-needs-input-tag">Perlu Diinput</span
												>{/if}
										</div>
										<div class="sangu-row-formula">{uangSangu.ferry.formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if uangSangu.ferry.needsInput && showSanguEdit}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={ferryPriceDisplay}
													oninput={onFerryPriceInput}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button class="icon-btn" title="Simpan" onclick={saveFerryPrice}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={uangSangu.ferry.value === 0}>{formatIDR(uangSangu.ferry.value)}</span>
										{/if}
									</div>
								</div>
							{/if}

							{#each uangSangu.custom as c (c.index)}
								<div
									class="sangu-row"
									style:border-bottom={c.index === uangSangu.custom.length - 1 && !canEditPreTripEstimate
										? 'none'
										: undefined}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">
											{c.label}
											<span class="sangu-tambahan-tag">Tambahan</span>
										</div>
										<div class="sangu-row-formula">{c.formula}</div>
									</div>
									<div class="sangu-row-value">{formatIDR(c.nominal)}</div>
									{#if showSanguEdit}
										<button
											class="icon-btn sangu-remove-component"
											title="Hapus komponen"
											onclick={() => removeCustomComponent(c.index)}
										>
											<span class="icon-wrap"><X size={15} /></span>
										</button>
									{/if}
								</div>
							{/each}

							{#if canEditPreTripEstimate && !showSanguEdit}
								<div class="sangu-row" style="border-bottom:none;">
									<div class="sangu-row-body">
										<div class="sangu-row-label">+ Tambahkan Komponen Biaya</div>
									</div>
								</div>
							{/if}

							{#if showSanguEdit && !addingComponentOpen}
								<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
								<div
									class="sangu-row sangu-add-trigger"
									style="border-bottom:none;"
									onclick={openAddComponent}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">+ Tambah Komponen Biaya</div>
									</div>
								</div>
							{/if}

							{#if showSanguEdit && addingComponentOpen}
								<div class="sangu-add-component" style="border-bottom:none;">
									<div class="sangu-row-label" style="margin-bottom:8px;">Tambah Komponen Biaya</div>
									<div class="sangu-add-component-form">
										<input
											type="text"
											bind:value={newComponentLabel}
											placeholder="Nama komponen, cth. Izin Kawasan"
										/>
										<input
											type="text"
											inputmode="numeric"
											value={newComponentNominalDisplay}
											oninput={onNewComponentNominalInput}
											placeholder="Nominal (Rp)"
										/>
										<button class="btn btn-outline btn-sm" onclick={addCustomComponent}>Tambah</button>
									</div>
								</div>
							{/if}

							<div class="sangu-subtotal">
								<div>
									<div class="sangu-subtotal-label">Subtotal Uang Sangu Pre-Trip</div>
									<div class="sangu-subtotal-hint">Pembayaran awal tetap ke driver</div>
								</div>
								<div class="sangu-subtotal-value">{formatIDR(sanguSubtotalDisplay)}</div>
							</div>

							{#if uangSanguFinalized}
								<div class="sangu-finalized-badge">
									<span class="icon-wrap"><Check size={13} /></span> Uang Sangu sudah difinalisasi — tidak bisa
									diperbarui lagi.
								</div>
							{:else}
								<div class="sangu-recon-actions sangu-recon-actions--split">
									<div class="sangu-recon-actions-left">
										{#if !sanguEditMode}
											<button
												type="button"
												class="btn btn-outline"
												disabled={!canFinalizeUangSangu}
												title={canFinalizeUangSangu
													? ''
													: 'Tunggu truck ditugaskan sebelum bisa memfinalisasi Uang Sangu'}
												onclick={confirmFinalizeUangSangu}
											>
												<span class="icon-wrap"><Check size={13} /></span> Finalisasi
											</button>
										{/if}
									</div>
									<div class="sangu-recon-actions-right">
										{#if !sanguEditMode}
											<button class="btn btn-primary" onclick={openSanguEdit}>
												<span class="icon-wrap"><Pencil size={16} /></span> Update Uang Sangu
											</button>
										{:else}
											<button class="btn btn-primary" onclick={saveUangSanguUpdate}>Update Data</button>
										{/if}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Rekonsiliasi Post-Trip -->
				{#if postTripRecon}
					<div class="detail-section">
						<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
						<div
							class="detail-section-head"
							class:open={sectionOpen.recon}
							onclick={() => toggleSection('recon')}
						>
							<div style="display:flex; align-items:center; gap:10px;">
								<h3>Rekonsiliasi Post-Trip</h3>
								<span
									class="badge {postTripRecon.status === 'sudah_diproses' ? 'badge-active' : 'badge-wait'}"
								>
									{postTripRecon.status === 'sudah_diproses' ? 'Sudah Diproses' : 'Belum Diproses'}
								</span>
							</div>
							<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
						</div>
						<div class="detail-section-body" style:display={sectionOpen.recon ? undefined : 'none'}>
							{#each postTripRecon.components as c, i (c.id)}
								<div
									class="sangu-row"
									style={i === postTripRecon.components.length - 1 ? 'border-bottom:none;' : ''}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">
											{c.label}
											{#if !c.isReimburse && c.finalized}<span class="sangu-final-tag">Final</span>{/if}
											{#if c.isReimburse}<span class="recon-status-tag {c.status}"
													>{reconStatusLabel(c.status)}</span
												>{/if}
										</div>
										<div class="sangu-row-formula">{c.formula}</div>
										{#if c.isReimburse && c.status === 'rejected' && c.note}
											<div class="sangu-row-note">Catatan: {c.note}</div>
										{/if}
									</div>
									<div class="sangu-row-value" class:zero={c.nominal === 0}>{formatIDR(c.nominal)}</div>
								</div>
							{/each}

							<div class="sangu-subtotal">
								<div>
									<div class="sangu-subtotal-label">Subtotal Rekonsiliasi Post-Trip</div>
									<div class="sangu-subtotal-hint">Tambahan pembayaran ke driver</div>
								</div>
								<div class="sangu-subtotal-value">{formatIDR(postTripRecon.total)}</div>
							</div>

							<div class="sangu-recon-actions">
								<button class="btn btn-primary" onclick={openReconModal}>
									<span class="icon-wrap"><Check size={13} /></span> Finalisasi Rekonsiliasi
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Finalisasi Uang Sangu confirm -->
		<ConfirmModal
			open={finalizeSanguOpen}
			title="Finalisasi Uang Sangu?"
			message="Setelah difinalisasi, seluruh komponen Uang Sangu Pre-Trip order ini terkunci dan tidak bisa diperbarui lagi. Pastikan semua nilainya sudah benar sebelum melanjutkan."
			confirmLabel="Ya, Finalisasi"
			danger={true}
			busy={finalizeSanguBusy}
			onConfirm={doFinalizeUangSangu}
			onClose={() => (finalizeSanguOpen = false)}
		/>

		<!-- Finalisasi Rekonsiliasi Post-Trip -->
		{#if reconModalOpen && postTripRecon}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal-overlay" onclick={onReconOverlayClick}>
				<div class="modal-box modal-box-lg">
					<h3>Finalisasi Rekonsiliasi Post-Trip</h3>
					<p>
						Periksa tiap komponen biaya di bawah ini. Untuk komponen reimburse, nominal adalah nilai yang
						diajukan driver (tidak dapat diubah) — Anda dapat melihat lampiran buktinya lalu menyetujui atau
						menolaknya. Finalisasi dilakukan per komponen biaya.
					</p>

					<div class="recon-modal-list">
						{#each reconDraft.components as c (c.id)}
							<div class="recon-modal-item">
								<div class="recon-modal-item-head">
									<div>
										<div class="recon-modal-item-label">{c.label}</div>
										<div class="recon-modal-item-formula">{c.formula}</div>
									</div>
									{#if !c.isReimburse}
										<label class="recon-modal-finalize">
											<input type="checkbox" bind:checked={c.finalized} />
											Finalisasi
										</label>
									{:else}
										<span class="recon-status-tag {c.status}">{reconStatusLabel(c.status)}</span>
									{/if}
								</div>

								{#if c.attachment}
									<div class="recon-modal-attachment">
										<div class="doc-photo-placeholder">
											<span class="icon-wrap"><FileText size={26} /></span>
										</div>
										<span>{c.attachment}</span>
									</div>
								{/if}

								<div class="recon-modal-nominal">
									<label>Nominal</label>
									{#if editingReconField === c.id}
										<div class="sangu-inline-edit">
											<input
												type="text"
												inputmode="numeric"
												value={c.nominalDisplay}
												oninput={(e) => onReconFieldInput(c, e)}
												placeholder="0"
												class="sangu-inline-value-input"
											/>
											<button class="icon-btn" title="Konfirmasi" onclick={() => confirmReconField(c)}
												><span class="icon-wrap"><Check size={13} /></span></button
											>
										</div>
									{:else}
										<div class="recon-modal-nominal-readonly">
											{formatIDR(c.nominal)}
											{#if !c.isReimburse}
												<button
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditReconField(c)}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>
											{/if}
										</div>
									{/if}
								</div>

								{#if c.isReimburse}
									<div class="recon-modal-approval">
										<div class="recon-modal-approval-actions">
											<button
												type="button"
												class="btn btn-outline btn-sm recon-approve-btn"
												class:active={c.status === 'approved'}
												onclick={() => (c.status = 'approved')}
											>
												<span class="icon-wrap"><Check size={13} /></span> Setujui
											</button>
											<button
												type="button"
												class="btn btn-outline btn-sm recon-reject-btn"
												class:active={c.status === 'rejected'}
												onclick={() => (c.status = 'rejected')}
											>
												<span class="icon-wrap"><X size={15} /></span> Tolak &amp; Kembalikan ke Driver
											</button>
										</div>
										<div class="field" style="margin:10px 0 0;">
											<!-- svelte-ignore a11y_label_has_associated_control -->
											<label
												>Catatan untuk Driver {c.status === 'rejected'
													? '(wajib diisi)'
													: '(opsional)'}</label
											>
											<textarea
												bind:value={c.note}
												rows="2"
												placeholder="cth. Foto struk blur, mohon mengambil foto struk yang sesuai."
											></textarea>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>

					<div class="recon-modal-total">
						<span>Total Rekonsiliasi</span>
						<b>{formatIDR(reconDraftTotal)}</b>
					</div>

					<div class="modal-actions">
						<button class="btn btn-outline" onclick={closeReconModal}>Batal</button>
						<button class="btn btn-primary" onclick={saveReconModal}>Simpan Finalisasi</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Foto POD — detail viewer -->
		{#if photoModalOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal-overlay" onclick={onPhotoModalOverlayClick}>
				<div class="modal-box pod-photo-modal-box">
					<div class="pod-photo-modal-head">
						<h3>{photoModalData.title}</h3>
						<div class="pod-photo-zoom-controls">
							<button
								type="button"
								class="icon-btn"
								title="Perkecil"
								disabled={photoZoom <= PHOTO_ZOOM_MIN}
								onclick={zoomOut}><span class="icon-wrap"><Minus size={14} /></span></button
							>
							<span class="pod-photo-zoom-level">{Math.round(photoZoom * 100)}%</span>
							<button
								type="button"
								class="icon-btn"
								title="Perbesar"
								disabled={photoZoom >= PHOTO_ZOOM_MAX}
								onclick={zoomIn}><span class="icon-wrap"><Plus size={14} /></span></button
							>
						</div>
					</div>
					<div class="pod-photo-modal-frame" class:zoomed={photoZoom > 1}>
						<img src={photoModalData.src} alt="" style={photoDisplayStyle} onload={onPhotoImgLoad} />
					</div>
					<div class="modal-actions">
						<button class="btn btn-outline" onclick={closePhotoModal}>Tutup</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- E-POD verification gate — flag banner -->
		{#if gateModalOpen && gateFlag}
			<div class="epod-gate-flag {gateFlag === 'sesuai' ? 'epod-gate-flag--ok' : 'epod-gate-flag--bad'}">
				<div class="epod-gate-flag-title">
					{gateFlag === 'sesuai'
						? `Berat, Kuantitas, Volume muatan pada saat Proses ${gatePhaseLabel} sesuai.`
						: `Berat, Kuantitas, Volume muatan pada saat Proses ${gatePhaseLabel} tidak sesuai.`}
				</div>
				<div class="epod-gate-flag-sub">
					{gateFlag === 'sesuai'
						? 'Terimakasih telah berkomitmen untuk mengantarkan muatan dengan baik.'
						: `Anda harus mengisi form E-POD dengan menyesuaikan berat, jumlah, volume muatan ${gatePhase === 'muat' ? 'muat' : 'bongkar'}.`}
					{#if gateFlag === 'tidak_sesuai' && gateFlagNote}
						<div class="epod-gate-flag-note">
							Catatan {gatePhase === 'muat' ? 'driver' : 'PIC'}: “{gateFlagNote}”
						</div>
					{/if}
					{#if gatePhase === 'bongkar' && picAudit.length}
						<!-- What the PIC counted at the gate on Web-Field, beside the
						     ordered figures. The reviewer is verifying a POD against
						     these numbers, so they belong on this banner. -->
						<div class="epod-gate-flag-note">
							Audit PIC di Web-Field: {picAudit.join(' · ')}
							{#if shipment?.manifestFinalizedAt}
								— manifest difinalisasi {shipment.manifestFinalizedBy ?? ''}
							{/if}
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- E-POD verification gate — forced entry point, no close/backdrop-dismiss -->
		{#if gateModalOpen}
			<div class="modal-overlay">
				<div class="modal-box epod-gate-modal-box">
					<div class="epod-gate-head">
						<span class="icon-wrap"><FileText size={16} /></span>
						<span>Verifikasi E-POD Proses {gatePhaseLabel}</span>
					</div>
					<div class="epod-gate-body">
						<svg class="epod-gate-illustration" viewBox="0 0 120 120" width="104" height="104">
							<path
								d="M15 40h30l8 10h52a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z"
								fill="#BBD1F8"
							/>
							<rect
								x="30"
								y="16"
								width="46"
								height="58"
								rx="4"
								fill="#fff"
								stroke="#0B57D0"
								stroke-width="2"
							/>
							<line
								x1="38"
								y1="28"
								x2="68"
								y2="28"
								stroke="#0B57D0"
								stroke-width="2"
								stroke-linecap="round"
							/>
							<line
								x1="38"
								y1="38"
								x2="68"
								y2="38"
								stroke="#0B57D0"
								stroke-width="2"
								stroke-linecap="round"
							/>
							<line
								x1="38"
								y1="48"
								x2="56"
								y2="48"
								stroke="#0B57D0"
								stroke-width="2"
								stroke-linecap="round"
							/>
							<path
								d="M12 52h74a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V58a6 6 0 0 1 6-6z"
								fill="#0B57D0"
							/>
							<circle cx="88" cy="82" r="18" fill="#fff" stroke="#1A1C1E" stroke-width="4" />
							<line
								x1="100"
								y1="94"
								x2="112"
								y2="106"
								stroke="#1A1C1E"
								stroke-width="6"
								stroke-linecap="round"
							/>
							<path
								d="M80 82l5 5 9-9"
								stroke="#0B57D0"
								stroke-width="3"
								fill="none"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<div class="epod-gate-text">
							<p class="epod-gate-text-main">
								Truk {order.assignedTruckPlate || '-'} dengan Driver {order.assignedDriverName || '-'} selesai {gatePhaseLabel}.<br
								/>
								Silahkan verifikasi E-POD agar truk dapat melanjutkan perjalanan
							</p>
							<p class="epod-gate-text-sub">
								Periksa kembali berat, jumlah, volume barang yang berhasil di {gatePhase === 'muat'
									? 'muat'
									: 'bongkar'} pada truk dengan memeriksa dan menyesuaikan dokumen E-POD.
							</p>
						</div>
					</div>
					<div class="epod-gate-footer">
						<button class="btn btn-primary" onclick={proceedFromGate}>Selanjutnya</button>
					</div>
				</div>
			</div>
		{/if}

		<!-- Verifikasi Muatan/Bongkaran (E-POD review) -->
		{#if verifyModalOpen}
			<div class="modal-overlay">
				<div class="modal-box epod-modal-box">
					<div class="epod-header">
						<span class="epod-header-icon"><span class="icon-wrap"><FileText size={26} /></span></span>
						<span class="epod-header-title">E-POD {order.idOrder} — Proses {verifyPhaseLabel}</span>
					</div>

					<div class="epod-body">
						<div class="epod-doc-title">
							<span class="epod-brand">K-Fleet</span>
							<h2>SURAT JALAN ELEKTRONIK ( E-POD ) — Proses {verifyPhaseLabel}</h2>
						</div>

						{@render epodInfoOrder()}

						<!-- Verifikasi Muatan/Bongkaran -->
						<div class="epod-card epod-verify-card">
							<div class="epod-card-head">
								Verifikasi {verifyModalPhase === 'muat' ? 'Muatan' : 'Bongkaran'}
							</div>
							<div class="epod-verify-layout">
								<div class="epod-verify-photo">
									{#if verifyFirstSuratJalanPhoto}
										<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
										<div
											class="epod-verify-photo-frame"
											onclick={() =>
												openPhotoModal(`Foto Surat Jalan — ${verifyPhaseLabel}`, podSrc(verifyFirstSuratJalanPhoto))}
										>
											<img src={podSrc(verifyFirstSuratJalanPhoto)} alt="" />
										</div>
									{:else}
										<div class="epod-verify-photo-empty">Belum ada foto surat jalan</div>
									{/if}
									<div class="epod-verify-photo-caption">Foto Surat Jalan</div>
								</div>
								<div class="epod-verify-table">
									<div class="epod-verify-row epod-verify-row--head">
										<span>Parameter</span>
										<span>Plan</span>
										<span>Muatan</span>
										<span>Bongkaran</span>
									</div>
									{#each CARGO_FIELDS as f (f.key)}
										<div class="epod-verify-row">
											<span class="epod-verify-param">{f.label}</span>
											<span class="epod-verify-plan">{verifyPlanValues[f.key]} {UNIT_BY_FIELD[f.key]}</span>

											<span class="epod-verify-cell">
												{#if verifyModalPhase === 'muat' && !verifyStopVerified}
													<span class="epod-verify-input-wrap" class:disabled={!canShowPodPhotosMuat}>
														<input
															type="number"
															bind:value={verifyDraft[f.key]}
															disabled={!canShowPodPhotosMuat}
														/>
														<span class="epod-verify-unit">{UNIT_BY_FIELD[f.key]}</span>
													</span>
												{:else if detail.muatanMuat && (verifyModalPhase === 'muat' ? verifyStopVerified : isPhaseVerified('muat'))}
													{cargoValueNumber(detail.muatanMuat[f.key])} {UNIT_BY_FIELD[f.key]}
												{:else}
													<span class="epod-verify-placeholder">Driver belum sampai tahap ini</span>
												{/if}
											</span>

											<span class="epod-verify-cell">
												{#if verifyModalPhase === 'bongkar' && !verifyStopVerified}
													<span class="epod-verify-input-wrap" class:disabled={!canShowPodPhotosBongkar}>
														<input
															type="number"
															bind:value={verifyDraft[f.key]}
															disabled={!canShowPodPhotosBongkar}
														/>
														<span class="epod-verify-unit">{UNIT_BY_FIELD[f.key]}</span>
													</span>
												{:else if detail.muatanBongkar && (verifyModalPhase === 'bongkar' ? verifyStopVerified : isPhaseVerified('bongkar'))}
													{cargoValueNumber(detail.muatanBongkar[f.key])} {UNIT_BY_FIELD[f.key]}
												{:else}
													<span class="epod-verify-placeholder">Driver belum sampai tahap ini</span>
												{/if}
											</span>
										</div>
									{/each}
								</div>
							</div>
						</div>

						{@render epodRouteGrid()}

						<!-- Foto -->
						{#each POD_PHOTO_TYPES as type (type.key)}
							<div class="epod-photo-section">
								<div class="epod-photo-head">{type.label} {verifyPhaseLabel}</div>
								{#if verifyPhotosFor(type.key).length}
									{#each verifyPhotosFor(type.key) as src, i (i)}
										<div class="epod-photo-item">
											<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
											<img
												src={podSrc(src)}
												alt=""
												onclick={() => openPhotoModal(`${type.label} — ${verifyPhaseLabel}`, podSrc(src))}
											/>
											<div class="epod-photo-caption">{type.label.replace('Foto ', '')} {i + 1}</div>
											<div class="epod-photo-timestamp">Diunggah {formatTimestampLabel(order.createdAt)}</div>
										</div>
									{/each}
								{:else}
									<div class="epod-photo-empty">Belum ada foto</div>
								{/if}
							</div>
						{/each}

						<!-- Pesan -->
						<div class="epod-card">
							<div class="epod-card-head">Pesan</div>
							<div class="epod-card-body">
								<textarea
									class="epod-message-input"
									placeholder="Foto Blur, upload ulang foto yang baik"
									bind:value={verifyNote}
									readonly={verifyStopVerified}></textarea>
							</div>
						</div>
					</div>

					<div class="epod-footer">
						{#if !verifyStopVerified}
							<button class="btn btn-outline" onclick={rejectVerification}>Tolak</button>
							<button
								class="btn btn-primary"
								disabled={(!api.testMode() &&
									!phaseHasAnyPhoto(verifyModalPhase, verifyStopCount > 1 ? verifyModalStopIndex : null)) ||
									!verifyDraftValid}
								title={api.testMode() && !phaseHasAnyPhoto(verifyModalPhase, verifyStopCount > 1 ? verifyModalStopIndex : null)
									? 'Mode Uji: verifikasi tanpa foto POD'
									: ''}
								onclick={confirmVerification}
							>
								Setuju{#if api.testMode() && !phaseHasAnyPhoto(verifyModalPhase, verifyStopCount > 1 ? verifyModalStopIndex : null)} (Mode Uji){/if}
							</button>
						{:else}
							<button class="btn btn-primary" onclick={closeVerifyModal}>Tutup</button>
						{/if}
					</div>
				</div>
			</div>
		{/if}

		<!-- E-POD Document Viewer (Lihat/Unduh from Linimasa Dokumen) -->
		{#if epodDocOpen}
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal-overlay" onclick={onEpodDocOverlayClick}>
				<div class="modal-box epod-modal-box">
					<div class="epod-header">
						<span class="epod-header-icon"><span class="icon-wrap"><FileText size={26} /></span></span>
						<span class="epod-header-title">E-POD {order.idOrder}</span>
						<button type="button" class="epod-header-close" title="Tutup" onclick={closeEpodDocument}
							><span class="icon-wrap"><X size={15} /></span></button
						>
					</div>

					<div class="epod-body">
						<div class="epod-doc-title">
							<span class="epod-brand">K-Fleet</span>
							<h2>SURAT JALAN ELEKTRONIK ( E-POD )</h2>
						</div>

						{@render epodInfoOrder()}

						<div class="epod-card epod-verify-card">
							<div class="epod-card-head">Verifikasi Muatan</div>
							<div class="epod-verify-table">
								<div class="epod-verify-row epod-verify-row--head">
									<span>Parameter</span>
									<span>Plan</span>
									<span>Muatan</span>
									<span>Bongkaran</span>
								</div>
								{#each CARGO_FIELDS as f (f.key)}
									<div class="epod-verify-row">
										<span class="epod-verify-param">{f.label}</span>
										<span class="epod-verify-plan">{verifyPlanValues[f.key]} {UNIT_BY_FIELD[f.key]}</span>
										<span class="epod-verify-cell"
											>{epodDocValue('muatanMuat', f.key) ?? 'Belum tersedia'}</span
										>
										<span class="epod-verify-cell"
											>{epodDocValue('muatanBongkar', f.key) ?? 'Belum tersedia'}</span
										>
									</div>
								{/each}
							</div>
						</div>

						{@render epodRouteGrid()}

						<!-- Pesan -->
						<div class="epod-card">
							<div class="epod-card-head">Pesan</div>
							<div class="epod-card-body epod-doc-notes">
								<div class="epod-doc-note">
									<div class="epod-doc-note-label">Pesan pada saat proses Muat</div>
									<div class="epod-doc-note-text">{epodMuatNote || 'Tidak ada catatan.'}</div>
								</div>
								<div class="epod-doc-note">
									<div class="epod-doc-note-label">Pesan pada saat proses Bongkar</div>
									<div class="epod-doc-note-text">{epodBongkarNote || 'Tidak ada catatan.'}</div>
								</div>
							</div>
						</div>

						<!-- Foto — Muat & Bongkar side by side per type -->
						{#each POD_PHOTO_TYPES as type (type.key)}
							<div class="epod-photo-section">
								<div class="epod-photo-head">{type.label}</div>
								<div class="epod-photo-doc-grid">
									<div class="epod-photo-doc-col">
										{#if podPhotosPresent('muat', type.key).length}
											{#each podPhotosPresent('muat', type.key) as src, i (i)}
												<div class="epod-photo-doc-item">
													<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
													<img src={podSrc(src)} alt="" onclick={() => openPhotoModal(`${type.label} — Muat`, podSrc(src))} />
													<div class="epod-photo-caption">{type.label.replace('Foto ', '')} Muat {i + 1}</div>
												</div>
											{/each}
										{:else}
											<div class="epod-photo-empty">Belum ada foto</div>
										{/if}
									</div>
									<div class="epod-photo-doc-col">
										{#if podPhotosPresent('bongkar', type.key).length}
											{#each podPhotosPresent('bongkar', type.key) as src, i (i)}
												<div class="epod-photo-doc-item">
													<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
													<img src={podSrc(src)} alt="" onclick={() => openPhotoModal(`${type.label} — Bongkar`, podSrc(src))} />
													<div class="epod-photo-caption">
														{type.label.replace('Foto ', '')} Bongkar {i + 1}
													</div>
												</div>
											{/each}
										{:else}
											<div class="epod-photo-empty">Belum ada foto</div>
										{/if}
									</div>
								</div>
								<div class="epod-photo-timestamp">Created at {formatTimestampLabel(order.createdAt)}</div>
							</div>
						{/each}
					</div>

					<div class="epod-footer">
						<button class="btn btn-outline" onclick={printEpodDocument}
							><span class="icon-wrap"><Download size={15} /></span> Unduh PDF</button
						>
						<button class="btn btn-primary" onclick={closeEpodDocument}>Tutup</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
