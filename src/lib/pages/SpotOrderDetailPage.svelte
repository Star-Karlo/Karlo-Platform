<script lang="ts">
	/**
	 * Spot Order detail (prototype SpotOrderDetailView.vue, 1:1).
	 *
	 * The prototype read one Firestore doc; here the order's own columns give
	 * the identity/route/cargo and `detail` (JSONB) holds every prototype-only
	 * field (alamatMuat, tripEstimate, uangSanguOverrides, postTrip ...).
	 * Working data written from this page goes back through
	 * `PATCH /orders/{id}/detail`.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ChevronDown, RefreshCw, Pencil, Check, X, FileText } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import TestModeStrip from '$lib/components/revamp/TestModeStrip.svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';
	import { statusLabel, statusBadgeClass } from '$lib/revamp/spotOrderStatus.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { initials } from '$lib/revamp/initials.js';
	import {
		computeUangSangu,
		computePostTripReconciliation,
		reconStatusLabel
	} from '$lib/revamp/uangSangu.js';
	import { formatIDR, formatThousands, parseThousands } from '$lib/revamp/currency.js';
	import { formatDateTimeLabel, formatTimestampLabel } from '$lib/revamp/date.js';
	import { haversineKm } from '$lib/revamp/geo.js';
	import { coordsForCity } from '$lib/revamp/idCityCoords.js';

	let { id, basePath = '/t' }: { id: string; basePath?: string } = $props();

	// ── Trip allowance settings (prototype settings/tripAllowance) ─────────
	function tripAllowanceDefaults() {
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
				} as Record<string, number>,
				costPerKm: 2500
			},
			meal: { nominalPerDay: 100000, method: 'eta', kmPerDay: 300 },
			lodging: { nominalPerNight: 100000 }
		};
	}
	let tripAllowance = $state<any>(tripAllowanceDefaults());
	let companyName = $state('PT Star Karlo Indonesia');

	// ── Data ───────────────────────────────────────────────────────────────
	let raw = $state<any>(null);
	let loaded = $state(false);
	let originWarehouse = $state<any>(null);
	let destinationWarehouse = $state<any>(null);
	let routeLegs = $state<any[]>([]);
	let truck = $state<any>(null);

	function pickupLabel(o: any): string {
		if (o.detail?.tanggalPickup) return o.detail.tanggalPickup;
		if (!o.pickupAt) return '';
		const d = new Date(o.pickupAt);
		if (Number.isNaN(d.getTime())) return '';
		const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
		return formatDateTimeLabel(date, time);
	}

	let haulLeg = $derived(routeLegs.find((l) => l.leg === 'haul') ?? null);
	let approachLeg = $derived(routeLegs.find((l) => l.leg === 'approach') ?? null);

	/** The prototype's spot-order record shape, assembled from the API order. */
	let order = $derived.by(() => {
		if (!raw) return null;
		const d = { ...(raw.detail ?? {}) };
		if (!d.tripEstimate && haulLeg?.distanceMeters) {
			d.tripEstimate = {
				jarakKm: Math.round(haulLeg.distanceMeters / 100) / 10,
				etaJam: Math.round(((haulLeg.durationSeconds ?? 0) / 3600) * 10) / 10,
				truckType: raw.truckTypeName ?? '',
				tollPreset: 0,
				melewatiFerry: false
			};
		}
		if (!d.driver && raw.driverName) d.driver = raw.driverName;
		if (!d.assignedTruckPlate && raw.truckPoliceNumber) d.assignedTruckPlate = raw.truckPoliceNumber;
		if (!d.assignedTruckType && raw.truckTypeName) d.assignedTruckType = raw.truckTypeName;
		return {
			id: raw.id,
			idSpotOrder: raw.orderNumber ?? raw.id,
			tanggalPickup: pickupLabel(raw),
			rute: d.rute ?? `${raw.originWarehouseName ?? ''} - ${raw.destinationWarehouseName ?? ''}`,
			shipperName: raw.shipperCompanyName ?? d.shipperName ?? '',
			shipperVerified: !!d.shipperVerified,
			muatan: d.muatan ?? raw.cargoTypeName ?? raw.cargoType?.name ?? '',
			status: kontrakStatus(raw),
			createdAt: raw.createdAt,
			detail: d
		};
	});
	let detail = $derived<any>(order?.detail ?? {});

	let alamatMuat = $derived.by(() => {
		if (detail.alamatMuat) return detail.alamatMuat;
		return {
			kota: originWarehouse?.city ?? '',
			label: originWarehouse?.name ?? raw?.originWarehouseName ?? '',
			detail: originWarehouse?.address ?? ''
		};
	});
	let alamatBongkar = $derived.by(() => {
		if (detail.alamatBongkar) return detail.alamatBongkar;
		return {
			kota: destinationWarehouse?.city ?? '',
			label: destinationWarehouse?.name ?? raw?.destinationWarehouseName ?? '',
			detail: destinationWarehouse?.address ?? ''
		};
	});

	let totalBerat = $derived(
		detail.totalBerat ??
			(raw?.weightKg ? `${formatThousands(String(Math.round(Number(raw.weightKg))))} Kg` : '')
	);
	let kuantitas = $derived(detail.kuantitas ?? (raw?.quantity != null ? String(raw.quantity) : ''));
	let totalVolume = $derived(detail.totalVolume ?? raw?.volumeM3 ?? 0);

	async function load() {
		try {
			const res = await api.get(ENDPOINTS.orders.one(id));
			raw = res.data?.data ?? null;
		} catch {
			raw = null;
		}
		loaded = true;
		if (!raw) return;
		const jobs: Promise<any>[] = [];
		if (!raw.detail?.alamatMuat && raw.originWarehouseId) {
			jobs.push(
				api
					.get(ENDPOINTS.warehouses.one(raw.originWarehouseId))
					.then((r) => (originWarehouse = r.data?.data ?? null))
					.catch(() => {})
			);
		}
		if (!raw.detail?.alamatBongkar && raw.destinationWarehouseId) {
			jobs.push(
				api
					.get(ENDPOINTS.warehouses.one(raw.destinationWarehouseId))
					.then((r) => (destinationWarehouse = r.data?.data ?? null))
					.catch(() => {})
			);
		}
		jobs.push(
			api
				.get(ENDPOINTS.orders.routes(raw.id))
				.then((r) => (routeLegs = r.data?.data ?? []))
				.catch(() => {})
		);
		if (raw.truckId) {
			jobs.push(
				api
					.get(ENDPOINTS.vehicles.one(raw.truckId))
					.then((r) => (truck = r.data?.data ?? null))
					.catch(() => {})
			);
		}
		await Promise.all(jobs);
	}
	async function loadSettings() {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			const data = res.data?.data ?? {};
			if (data.name) companyName = data.name;
			const ta = data.settings?.tripAllowance;
			if (ta) {
				const base = tripAllowanceDefaults();
				tripAllowance = {
					fuel: { ...base.fuel, ...(ta.fuel ?? {}) },
					meal: { ...base.meal, ...(ta.meal ?? {}) },
					lodging: { ...base.lodging, ...(ta.lodging ?? {}) }
				};
			}
		} catch {
			/* keep the seed defaults */
		}
	}
	onMount(() => {
		load();
		loadSettings();
	});

	async function patchDetail(patch: Record<string, unknown>) {
		const res = await api.patch(`${ENDPOINTS.orders.one(id)}/detail`, patch);
		const updated = res.data?.data;
		if (updated) raw = updated;
		else raw = { ...raw, detail: { ...(raw?.detail ?? {}), ...patch } };
	}

	// ── Uang Sangu ─────────────────────────────────────────────────────────
	// Same city-name-then-fallback coordinate lookup the prototype used for a
	// truck's position or a plain city address.
	function cityCoords(kota: string | undefined | null) {
		if (!kota) return null;
		return coordsForCity(kota);
	}
	const AVERAGE_TRUCK_SPEED_KMH = 40;
	// Biaya Perjalanan Menuju Lokasi Muat normally comes from Planner
	// Allocate's own real road route + toll detection, persisted once at
	// assignment time (detail.biayaMenujuMuat). Orders assigned any other way
	// never get that persisted figure — this fallback keeps the component
	// from sitting at "Menunggu penugasan driver" forever once a truck
	// genuinely is assigned: the server's planned approach leg when it has
	// one, else a straight line from the truck's last position to the
	// loading city. BBM + Uang Makan only, clearly labeled as an estimate.
	let estimatedBiayaMenujuMuat = $derived.by(() => {
		if (!order) return null;
		const plate = order.detail?.assignedTruckPlate;
		if (!plate) return null;
		let distanceKm: number | null = null;
		let etaJam = 0;
		if (approachLeg?.distanceMeters) {
			distanceKm = Math.round(approachLeg.distanceMeters / 100) / 10;
			etaJam = approachLeg.durationSeconds
				? Math.round((approachLeg.durationSeconds / 3600) * 10) / 10
				: Math.round((distanceKm / AVERAGE_TRUCK_SPEED_KMH) * 10) / 10;
		} else {
			const truckCoords =
				truck?.lastLocation?.latitude != null && truck?.lastLocation?.longitude != null
					? { lat: Number(truck.lastLocation.latitude), lng: Number(truck.lastLocation.longitude) }
					: cityCoords(truck?.location);
			const muatCoords =
				originWarehouse?.latitude != null && originWarehouse?.longitude != null
					? { lat: Number(originWarehouse.latitude), lng: Number(originWarehouse.longitude) }
					: cityCoords(alamatMuat?.kota);
			if (!truckCoords || !muatCoords) return null;
			distanceKm = Math.round(haversineKm(truckCoords, muatCoords) * 10) / 10;
			etaJam = Math.round((distanceKm / AVERAGE_TRUCK_SPEED_KMH) * 10) / 10;
		}
		const leg = computeUangSangu(
			{
				detail: {
					tripEstimate: { jarakKm: distanceKm, etaJam, truckType: order.detail?.assignedTruckType || '' }
				}
			},
			tripAllowance
		);
		return Math.round(leg.bbm.value + leg.uangMakan.value);
	});
	let orderForUangSangu = $derived.by(() => {
		if (!order) return null;
		const existing = order.detail?.biayaMenujuMuat;
		return {
			...order,
			detail: {
				...(order.detail || {}),
				biayaMenujuMuat: existing ?? estimatedBiayaMenujuMuat,
				biayaMenujuMuatEstimated: existing == null
			}
		};
	});
	let uangSangu = $derived<any>(
		orderForUangSangu ? computeUangSangu(orderForUangSangu, tripAllowance) : null
	);
	let jarakTempuhKm = $derived(detail?.tripEstimate?.jarakKm);
	let postTripRecon = $derived<any>(
		order ? computePostTripReconciliation(order, tripAllowance, uangSangu?.uangMakan.value ?? 0) : null
	);

	// Statuses at or after the point a driver is actually assigned — this is
	// when Biaya Tol first has a real (non-placeholder) value.
	const ASSIGNED_OR_LATER_STATUSES = new Set([
		'pengemudi_ditugaskan',
		'pengemudi_menerima_order',
		'menuju_lokasi_muat',
		'tiba_lokasi_muat',
		'proses_muat_barang',
		'verifikasi_pod_muat',
		'pod_muat_terverifikasi',
		'menuju_lokasi_bongkar',
		'tiba_lokasi_bongkar',
		'proses_bongkar_muatan',
		'verifikasi_pod_bongkar',
		'pod_bongkar_terverifikasi',
		'menunggu_konfirmasi_pengiriman',
		'pengiriman_terkonfirmasi'
	]);
	let uangSanguFinalized = $derived(!!detail.uangSanguFinalized);
	let canEditPreTripEstimate = $derived.by(() => {
		if (uangSanguFinalized) return false;
		const status = order?.status ?? '';
		return status === 'penugasan_pengemudi' || ASSIGNED_OR_LATER_STATUSES.has(status);
	});
	let canFinalizeUangSangu = $derived(
		!uangSanguFinalized && ASSIGNED_OR_LATER_STATUSES.has(order?.status ?? '')
	);
	let sanguEditMode = $state(false);
	let showSanguEdit = $derived(canEditPreTripEstimate && sanguEditMode);

	let finalizeModalOpen = $state(false);
	let finalizeBusy = $state(false);
	function confirmFinalizeUangSangu() {
		if (!canFinalizeUangSangu) return;
		finalizeModalOpen = true;
	}
	async function doFinalizeUangSangu() {
		finalizeBusy = true;
		try {
			await patchDetail({ uangSanguFinalized: true });
			toast('Uang Sangu berhasil difinalisasi');
			finalizeModalOpen = false;
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memfinalisasi Uang Sangu');
		} finally {
			finalizeBusy = false;
		}
	}

	// BBM/Tol/Uang Makan are system-calculated — planner can override each with
	// a pencil icon, but the override only lands once "Update Data" is pressed
	// (batched, unlike ferry/custom components which save instantly).
	type OverrideKey = 'bbm' | 'tol' | 'uangMakan' | 'menujuMuat';
	let overrideDraft = $state<Record<OverrideKey, number | null>>({
		bbm: null,
		tol: null,
		uangMakan: null,
		menujuMuat: null
	});
	let editingField = $state<OverrideKey | null>(null);
	let overrideDisplay = $state<Record<OverrideKey, string>>({
		bbm: '',
		tol: '',
		uangMakan: '',
		menujuMuat: ''
	});

	function openSanguEdit() {
		sanguEditMode = true;
		const existing = detail.uangSanguOverrides || {};
		overrideDraft.bbm = existing.bbm ?? null;
		overrideDraft.tol = existing.tol ?? null;
		overrideDraft.uangMakan = existing.uangMakan ?? null;
		overrideDraft.menujuMuat = existing.menujuMuat ?? null;
	}
	function closeSanguEdit() {
		sanguEditMode = false;
		addingComponentOpen = false;
		editingField = null;
	}
	function startEditField(field: OverrideKey) {
		editingField = field;
		const current = overrideDraft[field] ?? uangSangu[field].value;
		overrideDisplay[field] = formatThousands(Math.round(current));
	}
	function onOverrideInput(field: OverrideKey, e: Event) {
		overrideDisplay[field] = formatThousands((e.target as HTMLInputElement).value);
	}
	function confirmEditField(field: OverrideKey) {
		overrideDraft[field] = parseThousands(overrideDisplay[field]);
		editingField = null;
	}
	async function saveUangSanguUpdate() {
		const overrides: Record<string, number> = {};
		if (overrideDraft.bbm !== null) overrides.bbm = overrideDraft.bbm;
		if (overrideDraft.tol !== null) overrides.tol = overrideDraft.tol;
		if (overrideDraft.uangMakan !== null) overrides.uangMakan = overrideDraft.uangMakan;
		if (overrideDraft.menujuMuat !== null) overrides.menujuMuat = overrideDraft.menujuMuat;
		try {
			await patchDetail({ uangSanguOverrides: overrides });
			toast('Data Uang Sangu diperbarui');
			closeSanguEdit();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memperbarui Uang Sangu');
		}
	}

	// Subtotal shown while editing reflects pending (unsaved) overrides too.
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
		try {
			await patchDetail({ biayaFerryManual: value });
			toast('Harga kapal disimpan');
			ferryPriceDisplay = '';
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan harga kapal');
		}
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
		try {
			await patchDetail({ customComponents: components });
			toast('Komponen biaya ditambahkan');
			addingComponentOpen = false;
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menambahkan komponen biaya');
		}
	}
	async function removeCustomComponent(index: number) {
		const components = (detail.customComponents || []).filter((_: unknown, i: number) => i !== index);
		try {
			await patchDetail({ customComponents: components });
			toast('Komponen biaya dihapus');
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus komponen biaya');
		}
	}

	let sectionOpen = $state({ pengiriman: true, muatan: true, permintaan: true, sangu: true, recon: true });
	function toggleSection(key: keyof typeof sectionOpen) {
		sectionOpen[key] = !sectionOpen[key];
	}

	// ── Linimasa ───────────────────────────────────────────────────────────
	let linimasaTab = $state<'order' | 'driver' | 'dokumen'>('order');

	let createdAtLabel = $derived(order?.createdAt ? formatTimestampLabel(new Date(order.createdAt)) : '');

	// Base trail — every order goes through this before a driver is assigned.
	// The prototype hard-coded these events; the dates follow the order's
	// createdAt here.
	let baseTimeline = $derived([
		{ time: createdAtLabel, title: 'draft', actor: 'Karlo Shipper 99', role: 'Shipper' },
		{ time: createdAtLabel, title: 'Offer Updated By Transporter' },
		{ time: createdAtLabel, title: 'Offer Accepted, Agreement Complete' },
		{ time: createdAtLabel, title: 'Offer Accepted, Waiting Payment' },
		{ time: createdAtLabel, title: 'Payment in Progress' },
		{ time: createdAtLabel, title: 'Payment Done' }
	]);

	// Extra events once the order has actually progressed past driver
	// assignment (muat → bongkar → selesai).
	function progressedTimeline(driverName: string) {
		const t = createdAtLabel;
		return [
			{ time: t, title: 'Driver dipilih', actor: companyName, role: 'Manager' },
			{ time: t, title: 'Order siap diproses', actor: companyName, role: 'Manager' },
			{ time: t, title: 'Driver menerima Order', actor: driverName, role: 'Driver' },
			{ time: t, title: 'Setting geofencing telah diubah Aktif', actor: driverName, role: 'Driver' },
			{ time: t, title: 'Submit POD & Selesai Muat #1', actor: driverName, role: 'Driver' },
			{ time: t, title: 'Pengecekan POD Muat #1', actor: driverName, role: 'Driver' },
			{ time: t, title: 'POD Muat Terverifikasi #1', actor: companyName, role: 'Manager' },
			{ time: t, title: 'Menuju titik bongkar', actor: companyName, role: 'Manager' },
			{ time: t, title: 'Setting geofencing telah diubah Tidak Aktif', actor: driverName, role: 'Driver' },
			{ time: t, title: 'Submit POD & Selesai Bongkar #1', actor: driverName, role: 'Driver' },
			{ time: t, title: 'Pengecekan POD Bongkar #1', actor: driverName, role: 'Driver' },
			{ time: t, title: 'POD Bongkar Terverifikasi #1', actor: companyName, role: 'Manager' },
			{ time: t, title: 'Order Selesai', actor: companyName, role: 'Manager' }
		];
	}

	let orderTimeline = $derived.by((): { time: string; title: string; actor?: string; role?: string }[] => {
		if (!order || order.status === 'penugasan_pengemudi') return baseTimeline;
		return [...baseTimeline, ...progressedTimeline(detail.driver || 'Driver')];
	});

	async function refreshData() {
		await load();
		toast('Data diperbarui');
	}
	function backToList() {
		goto(`${basePath}/order/spot`);
	}

	// ── Rekonsiliasi Post-Trip ─────────────────────────────────────────────
	let reconModalOpen = $state(false);
	let reconDraft = $state<{ components: any[] }>({ components: [] });
	let reconDraftTotal = $derived(reconDraft.components.reduce((sum, c) => sum + (Number(c.nominal) || 0), 0));

	function openReconModal() {
		if (!postTripRecon) return;
		reconDraft.components = postTripRecon.components.map((c: any) => ({ ...c }));
		reconModalOpen = true;
	}
	function closeReconModal() {
		reconModalOpen = false;
		editingReconField = null;
	}

	// Biaya Uang Inap / Kekurangan Uang Makan are system-calculated too — same
	// pencil-to-edit pattern, staged on the reconDraft item directly.
	let editingReconField = $state<string | null>(null);
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
		const rejectedWithoutNote = reconDraft.components.some(
			(c) => c.isReimburse && c.status === 'rejected' && !c.note.trim()
		);
		if (rejectedWithoutNote) {
			toast('Isi catatan untuk driver sebelum menolak pengajuan reimburse');
			return;
		}
		const byId: Record<string, any> = Object.fromEntries(reconDraft.components.map((c) => [c.id, c]));
		const reimburse = (detail.postTrip.reimburse || []).map((r: any, i: number) => {
			const c = byId[`reimburse_${i}`];
			return { ...r, status: c.status, note: c.note };
		});
		try {
			await patchDetail({
				postTrip: {
					...detail.postTrip,
					reimburse,
					finalized: { lodging: byId.lodging.finalized, meal: byId.meal.finalized },
					overrides: { lodging: byId.lodging.nominal, meal: byId.meal.nominal }
				}
			});
			toast('Rekonsiliasi post-trip diperbarui');
			reconModalOpen = false;
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memperbarui rekonsiliasi post-trip');
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="spot-detail-page">
	<!-- TEMPORARY: Mode Uji (end-to-end testing) -->
	<TestModeStrip orderId={id} {basePath} onchanged={() => load()} />
	{#if !order}
		{#if loaded}
			<div class="card card-pad">
				<div class="empty">
					<div class="eic">📦</div>
					Spot Order tidak ditemukan.<br />
					<button type="button" class="btn btn-text" style="margin-top:10px;" onclick={backToList}
						>&larr; Kembali ke daftar Spot Order</button
					>
				</div>
			</div>
		{/if}
	{:else}
		<div class="spot-detail-breadcrumb">
			<span style="cursor:pointer;" onclick={backToList}>SPOT ORDER</span>
			<span class="sep">&gt;</span>
			<b>{statusLabel(order.status)} ({order.idSpotOrder})</b>
		</div>

		<div class="spot-detail-grid">
			<!-- LEFT COLUMN -->
			<div>
				<div style="font-size:13px; font-weight:700; color:var(--on-surface-variant); margin-bottom:12px;">
					Shipper
				</div>
				<div class="shipper-block">
					<div class="shipper-logo">
						{initials(order.shipperName)}
						{#if order.shipperVerified}<span class="verified-dot">&#10003;</span>{/if}
					</div>
					<div>
						<div class="shipper-block-name">{order.shipperName}</div>
						<div class="shipper-block-sub">{detail.shipperUsername || '-'}</div>
					</div>
				</div>

				<!-- Informasi Pengiriman -->
				<div class="detail-section">
					<div
						class="detail-section-head"
						class:open={sectionOpen.pengiriman}
						onclick={() => toggleSection('pengiriman')}
					>
						<h3>Informasi Pengiriman</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					{#if sectionOpen.pengiriman}
						<div class="detail-section-body">
							<div class="detail-row">
								<div class="detail-row-label"><b>Status</b></div>
								<div class="detail-row-value">
									<span class="badge {statusBadgeClass(order.status)}">{statusLabel(order.status)}</span>
								</div>
							</div>
							<div class="detail-row">
								<div class="detail-row-label"><b>Jadwal Muat</b> <span class="req">*</span></div>
								<div class="detail-row-value">{order.tanggalPickup}</div>
							</div>
							<div class="route-rows">
								<div class="route-label"><b>Alamat Muat</b> <span class="req">*</span></div>
								<div class="route-marker">
									<span class="route-marker-line"></span>
									<span class="route-marker-distance">{jarakTempuhKm ? `${jarakTempuhKm} Km` : '-'}</span>
									<span class="route-marker-line"></span>
								</div>
								<div class="route-value">
									<div class="addr-kota">{alamatMuat?.kota}</div>
									<div class="addr-label">{alamatMuat?.label}</div>
									<div class="addr-detail">{alamatMuat?.detail}</div>
								</div>

								<div class="route-label route-label--bongkar">
									<b>Alamat Bongkar</b> <span class="req">*</span>
								</div>
								<div class="route-value route-value--bongkar">
									<div class="addr-kota">{alamatBongkar?.kota}</div>
									<div class="addr-label">{alamatBongkar?.label}</div>
									<div class="addr-detail">{alamatBongkar?.detail}</div>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<!-- Detail Muatan -->
				<div class="detail-section">
					<div
						class="detail-section-head"
						class:open={sectionOpen.muatan}
						onclick={() => toggleSection('muatan')}
					>
						<h3>Detail Muatan</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					{#if sectionOpen.muatan}
						<div class="detail-section-body">
							<div class="detail-row">
								<div class="detail-row-label">
									<b>Tipe Muatan</b> <span class="req">*</span>
									<span class="hint">Tipe muatan yang akan diangkut</span>
								</div>
								<div class="detail-row-value">{order.muatan}</div>
							</div>
							<div class="muatan-phase-title">Muatan pada saat Plan</div>
							<div class="detail-row">
								<div class="detail-row-label">
									<b>Total Berat</b> <span class="req">*</span>
									<span class="hint">Jumlah Berat Muatan</span>
								</div>
								<div class="detail-row-value">{totalBerat}</div>
							</div>
							<div class="detail-row">
								<div class="detail-row-label">
									<b>Kuantitas</b>
									<span class="hint">Kuantitas satuan muatan</span>
								</div>
								<div class="detail-row-value">{kuantitas}</div>
							</div>
							<div class="detail-row">
								<div class="detail-row-label"><b>Panjang x Lebar x Tinggi</b></div>
								<div class="detail-row-value" style="display:flex; gap:60px; flex-wrap:wrap;">
									<div>{detail.dimP ?? 0}m x {detail.dimL ?? 0}m x {detail.dimT ?? 0}m</div>
									<div>
										<b style="display:block; font-size:13px; margin-bottom:2px;">Total Volume (m&sup3;)</b>
										{totalVolume ?? 0}
									</div>
								</div>
							</div>

							{#if detail.muatanMuat}
								<div class="muatan-phase-title">Muatan pada saat Proses Muat</div>
								<div class="detail-row">
									<div class="detail-row-label">
										<b>Total Berat</b> <span class="req">*</span><span class="hint">Jumlah Berat Muatan</span>
									</div>
									<div class="detail-row-value">{detail.muatanMuat.totalBerat}</div>
								</div>
								<div class="detail-row">
									<div class="detail-row-label">
										<b>Kuantitas</b><span class="hint">Kuantitas satuan muatan</span>
									</div>
									<div class="detail-row-value">{detail.muatanMuat.kuantitas}</div>
								</div>
								<div class="detail-row">
									<div class="detail-row-label"><b>Panjang x Lebar x Tinggi</b></div>
									<div class="detail-row-value" style="display:flex; gap:60px; flex-wrap:wrap;">
										<div>
											{detail.muatanMuat.dimP ?? 0}m x {detail.muatanMuat.dimL ?? 0}m x {detail.muatanMuat
												.dimT ?? 0}m
										</div>
										<div>
											<b style="display:block; font-size:13px; margin-bottom:2px;">Total Volume (m&sup3;)</b>
											{detail.muatanMuat.totalVolume ?? 0}
										</div>
									</div>
								</div>
							{/if}

							{#if detail.muatanBongkar}
								<div class="muatan-phase-title">Muatan pada saat Proses Bongkar</div>
								<div class="detail-row">
									<div class="detail-row-label">
										<b>Total Berat</b> <span class="req">*</span><span class="hint">Jumlah Berat Muatan</span>
									</div>
									<div class="detail-row-value">{detail.muatanBongkar.totalBerat}</div>
								</div>
								<div class="detail-row">
									<div class="detail-row-label">
										<b>Kuantitas</b><span class="hint">Kuantitas satuan muatan</span>
									</div>
									<div class="detail-row-value">{detail.muatanBongkar.kuantitas}</div>
								</div>
								<div class="detail-row">
									<div class="detail-row-label"><b>Panjang x Lebar x Tinggi</b></div>
									<div class="detail-row-value" style="display:flex; gap:60px; flex-wrap:wrap;">
										<div>
											{detail.muatanBongkar.dimP ?? 0}m x {detail.muatanBongkar.dimL ?? 0}m x {detail
												.muatanBongkar.dimT ?? 0}m
										</div>
										<div>
											<b style="display:block; font-size:13px; margin-bottom:2px;">Total Volume (m&sup3;)</b>
											{detail.muatanBongkar.totalVolume ?? 0}
										</div>
									</div>
								</div>
							{/if}

							<div
								style="font-weight:700; font-size:14px; margin:10px 0 14px; padding-top:14px; border-top:1px solid var(--outline-variant);"
							>
								Foto &amp; Dokumen
							</div>

							{#if detail.fotoSj?.length}
								<div style="font-weight:700; font-size:12.5px; margin-bottom:10px;">Foto SJ</div>
								<div class="muatan-photo-row">
									{#each detail.fotoSj as foto, i (i)}
										<div class="muatan-photo">
											<div class="doc-photo-placeholder">
												<span class="icon-wrap"><FileText size={26} /></span>
											</div>
											<div class="muatan-photo-caption">{foto.label}</div>
										</div>
									{/each}
								</div>
							{/if}

							<div style="font-weight:700; font-size:12.5px; margin:16px 0 10px;">Foto Muatan</div>
							<div class="muatan-photo-row">
								{#each detail.fotoMuatan || [] as foto, i (i)}
									<div class="muatan-photo">
										<div class="doc-photo-placeholder">
											<span class="icon-wrap"><FileText size={26} /></span>
										</div>
										<div class="muatan-photo-caption">{foto}</div>
									</div>
								{/each}
							</div>

							{#if detail.fotoPendukung?.length}
								<div style="font-weight:700; font-size:12.5px; margin:16px 0 10px;">Foto Pendukung</div>
								<div class="muatan-photo-row">
									{#each detail.fotoPendukung as foto, i (i)}
										<div class="muatan-photo">
											<div class="doc-photo-placeholder">
												<span class="icon-wrap"><FileText size={26} /></span>
											</div>
											<div class="muatan-photo-caption">{foto}</div>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Detail Permintaan -->
				<div class="detail-section">
					<div
						class="detail-section-head"
						class:open={sectionOpen.permintaan}
						onclick={() => toggleSection('permintaan')}
					>
						<h3>Detail Permintaan</h3>
						<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
					</div>
					{#if sectionOpen.permintaan}
						<div class="detail-section-body">
							<div class="detail-row">
								<div class="detail-row-label">
									<b>Kebutuhan Tambahan</b> <span class="req">*</span>
									<span class="hint">Kebutuhan tambahan untuk muatan Anda</span>
								</div>
								<div class="detail-row-value">{detail.kebutuhanTambahan || '-'}</div>
							</div>
							<div class="detail-row">
								<div class="detail-row-label">
									<b>Catatan Tambahan</b> <span class="req">*</span>
									<span class="hint">Tambahkan keterangan preferensi truk yang anda inginkan.</span>
								</div>
								<div class="detail-row-value">{detail.catatanTambahan || '-'}</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- RIGHT COLUMN -->
			<div>
				<div class="linimasa-panel-head">
					<h3>Linimasa</h3>
					<button type="button" class="btn btn-outline btn-sm" onclick={refreshData}
						><span class="icon-wrap"><RefreshCw size={14} /></span> Perbarui Data</button
					>
				</div>
				<div class="method-tabs" style="margin-bottom:16px;">
					<button
						type="button"
						class="method-tab"
						class:active={linimasaTab === 'order'}
						onclick={() => (linimasaTab = 'order')}>Linimasa Order</button
					>
					<button
						type="button"
						class="method-tab"
						class:active={linimasaTab === 'driver'}
						onclick={() => (linimasaTab = 'driver')}>Linimasa Driver</button
					>
					<button
						type="button"
						class="method-tab"
						class:active={linimasaTab === 'dokumen'}
						onclick={() => (linimasaTab = 'dokumen')}>Linimasa Dokumen</button
					>
				</div>

				{#if linimasaTab === 'order'}
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
					<div class="linimasa-empty">
						{detail.driver ? detail.driver : 'Belum ada driver.'}
					</div>
				{:else}
					<div class="linimasa-empty">Belum ada dokumen.</div>
				{/if}

				<!-- Uang Sangu Driver -->
				{#if uangSangu}
					<div class="detail-section">
						<div
							class="detail-section-head"
							class:open={sectionOpen.sangu}
							onclick={() => toggleSection('sangu')}
						>
							<h3>Uang Sangu Driver</h3>
							<span class="chev"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
						</div>
						{#if sectionOpen.sangu}
							<div class="detail-section-body">
								<div class="sangu-row">
									<div class="sangu-row-body">
										<div class="sangu-row-label">Biaya Perjalanan Menuju Lokasi Muat</div>
										<div class="sangu-row-formula">{uangSangu.menujuMuat.formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if editingField === 'menujuMuat'}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={overrideDisplay.menujuMuat}
													oninput={(e) => onOverrideInput('menujuMuat', e)}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button
													type="button"
													class="icon-btn"
													title="Konfirmasi"
													onclick={() => confirmEditField('menujuMuat')}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={(overrideDraft.menujuMuat ?? uangSangu.menujuMuat.value) === 0}>
												{formatIDR(overrideDraft.menujuMuat ?? uangSangu.menujuMuat.value)}
											</span>
											{#if showSanguEdit}<button
													type="button"
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditField('menujuMuat')}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>{/if}
										{/if}
									</div>
								</div>

								<div class="sangu-row">
									<div class="sangu-row-body">
										<div class="sangu-row-label">Biaya BBM</div>
										<div class="sangu-row-formula">{uangSangu.bbm.formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if editingField === 'bbm'}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={overrideDisplay.bbm}
													oninput={(e) => onOverrideInput('bbm', e)}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button
													type="button"
													class="icon-btn"
													title="Konfirmasi"
													onclick={() => confirmEditField('bbm')}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={(overrideDraft.bbm ?? uangSangu.bbm.value) === 0}
												>{formatIDR(overrideDraft.bbm ?? uangSangu.bbm.value)}</span
											>
											{#if showSanguEdit}<button
													type="button"
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditField('bbm')}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>{/if}
										{/if}
									</div>
								</div>

								<div class="sangu-row">
									<div class="sangu-row-body">
										<div class="sangu-row-label">
											Biaya Tol
											{#if uangSangu.tol.needsAssignment}<span class="sangu-needs-input-tag"
													>Otomatis terisi setelah penugasan</span
												>{/if}
										</div>
										<div class="sangu-row-formula">{uangSangu.tol.formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if editingField === 'tol'}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={overrideDisplay.tol}
													oninput={(e) => onOverrideInput('tol', e)}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button
													type="button"
													class="icon-btn"
													title="Konfirmasi"
													onclick={() => confirmEditField('tol')}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={(overrideDraft.tol ?? uangSangu.tol.value) === 0}
												>{formatIDR(overrideDraft.tol ?? uangSangu.tol.value)}</span
											>
											{#if showSanguEdit}<button
													type="button"
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditField('tol')}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>{/if}
										{/if}
									</div>
								</div>

								<div
									class="sangu-row"
									style:border-bottom={uangSangu.ferry.melewatiFerry ||
									uangSangu.custom.length ||
									canEditPreTripEstimate
										? ''
										: 'none'}
								>
									<div class="sangu-row-body">
										<div class="sangu-row-label">Uang Makan</div>
										<div class="sangu-row-formula">{uangSangu.uangMakan.formula}</div>
									</div>
									<div class="sangu-row-value">
										{#if editingField === 'uangMakan'}
											<div class="sangu-inline-edit">
												<input
													type="text"
													inputmode="numeric"
													value={overrideDisplay.uangMakan}
													oninput={(e) => onOverrideInput('uangMakan', e)}
													placeholder="0"
													class="sangu-inline-value-input"
												/>
												<button
													type="button"
													class="icon-btn"
													title="Konfirmasi"
													onclick={() => confirmEditField('uangMakan')}
													><span class="icon-wrap"><Check size={13} /></span></button
												>
											</div>
										{:else}
											<span class:zero={(overrideDraft.uangMakan ?? uangSangu.uangMakan.value) === 0}
												>{formatIDR(overrideDraft.uangMakan ?? uangSangu.uangMakan.value)}</span
											>
											{#if showSanguEdit}<button
													type="button"
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditField('uangMakan')}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>{/if}
										{/if}
									</div>
								</div>

								{#if uangSangu.ferry.melewatiFerry}
									<div
										class="sangu-row"
										style:border-bottom={uangSangu.custom.length || canEditPreTripEstimate ? '' : 'none'}
									>
										<div class="sangu-row-body">
											<div class="sangu-row-label">
												Biaya Ferry
												{#if uangSangu.ferry.needsInput}<span class="sangu-needs-input-tag"
														>Perlu Diinput</span
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
													<button type="button" class="icon-btn" title="Simpan" onclick={saveFerryPrice}
														><span class="icon-wrap"><Check size={13} /></span></button
													>
												</div>
											{:else}
												<span class:zero={uangSangu.ferry.value === 0}
													>{formatIDR(uangSangu.ferry.value)}</span
												>
											{/if}
										</div>
									</div>
								{/if}

								{#each uangSangu.custom as c (c.index)}
									<div
										class="sangu-row"
										style:border-bottom={c.index === uangSangu.custom.length - 1 && !canEditPreTripEstimate
											? 'none'
											: ''}
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
												type="button"
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
											<button type="button" class="btn btn-outline btn-sm" onclick={addCustomComponent}
												>Tambah</button
											>
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
										<Check size={15} /> Uang Sangu sudah difinalisasi — tidak bisa diperbarui lagi.
									</div>
								{:else if canEditPreTripEstimate}
									<div class="sangu-recon-actions sangu-recon-actions--split">
										<div class="sangu-recon-actions-left">
											{#if !sanguEditMode}
												<button
													type="button"
													class="btn btn-outline"
													disabled={!canFinalizeUangSangu}
													title={canFinalizeUangSangu
														? ''
														: 'Tunggu driver ditugaskan sebelum bisa memfinalisasi Uang Sangu'}
													onclick={confirmFinalizeUangSangu}
												>
													<span class="icon-wrap"><Check size={13} /></span> Finalisasi
												</button>
											{/if}
										</div>
										<div class="sangu-recon-actions-right">
											{#if !sanguEditMode}
												<button type="button" class="btn btn-primary" onclick={openSanguEdit}>
													<span class="icon-wrap"><Pencil size={16} /></span> Update Uang Sangu
												</button>
											{:else}
												<button type="button" class="btn btn-primary" onclick={saveUangSanguUpdate}
													>Update Data</button
												>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Rekonsiliasi Post-Trip -->
				{#if postTripRecon}
					<div class="detail-section">
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
						{#if sectionOpen.recon}
							<div class="detail-section-body">
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
											{#if c.isReimburse && c.status === 'rejected' && c.note}<div class="sangu-row-note">
													Catatan: {c.note}
												</div>{/if}
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
									<button type="button" class="btn btn-primary" onclick={openReconModal}>
										<span class="icon-wrap"><Check size={13} /></span> Finalisasi Rekonsiliasi
									</button>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>

		<!-- Finalisasi Rekonsiliasi Post-Trip -->
		{#if reconModalOpen && postTripRecon}
			<div class="modal-overlay" onclick={onReconOverlayClick}>
				<div class="modal-box modal-box-lg" role="dialog" aria-modal="true">
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
											<button
												type="button"
												class="icon-btn"
												title="Konfirmasi"
												onclick={() => confirmReconField(c)}
												><span class="icon-wrap"><Check size={13} /></span></button
											>
										</div>
									{:else}
										<div class="recon-modal-nominal-readonly">
											{formatIDR(c.nominal)}
											{#if !c.isReimburse}<button
													type="button"
													class="icon-btn sangu-edit-value"
													title="Edit nilai"
													onclick={() => startEditReconField(c)}
													><span class="icon-wrap"><Pencil size={16} /></span></button
												>{/if}
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
						<button type="button" class="btn btn-outline" onclick={closeReconModal}>Batal</button>
						<button type="button" class="btn btn-primary" onclick={saveReconModal}>Simpan Finalisasi</button>
					</div>
				</div>
			</div>
		{/if}

		<ConfirmModal
			open={finalizeModalOpen}
			title="Finalisasi Uang Sangu?"
			message="Setelah difinalisasi, seluruh komponen Uang Sangu Pre-Trip order ini terkunci dan tidak bisa diperbarui lagi. Pastikan semua nilainya sudah benar sebelum melanjutkan."
			confirmLabel="Ya, Finalisasi"
			danger={true}
			busy={finalizeBusy}
			onConfirm={doFinalizeUangSangu}
			onClose={() => (finalizeModalOpen = false)}
		/>
	{/if}
</div>
