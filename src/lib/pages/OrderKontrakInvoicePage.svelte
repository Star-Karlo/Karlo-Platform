<script lang="ts">
	/**
	 * Port of the prototype's OrderKontrakInvoiceView.vue (1:1).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		Download,
		User,
		Truck,
		ClipboardList,
		Camera,
		Banknote,
		Package,
		Briefcase,
		Database,
		Clock,
		FileText,
		Calendar,
		Plus
	} from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { authStore } from '$lib/stores/auth';
	import { additionalNeedsLabel, ADDITIONAL_NEEDS_OPTIONS } from '$lib/revamp/additionalNeeds.js';
	import { estimatedOrderValue } from '$lib/revamp/orderPricing.js';
	import { paymentTypeLabel, incomeTaxLabel } from '$lib/revamp/paymentType.js';
	import { formatTimestampLabel } from '$lib/revamp/date.js';
	import { fileToDataUrl } from '$lib/revamp/documentUpload.js';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';

	let { id, basePath = '/t' }: { id: string; basePath?: string } = $props();

	const TRANSPORTER_NAME_FALLBACK = 'PT Star Karlo Indonesia';

	// Local formatter — the reference invoice always shows "Rp 4.500.000".
	function formatRp(value: number) {
		return 'Rp ' + Math.round(value || 0).toLocaleString('id-ID');
	}

	// ---------- data ----------
	let raw = $state<any>(null);
	let loaded = $state(false);
	let companyName = $state('');
	let agreementRaw = $state<any>(null);
	let warehouses = $state<Record<string, any>>({});
	let warehouseList = $state<any[]>([]);

	let TRANSPORTER_NAME = $derived(companyName || TRANSPORTER_NAME_FALLBACK);
	let actorName = $derived(
		$authStore.user?.displayName || $authStore.user?.name || $authStore.user?.email || TRANSPORTER_NAME
	);

	function toProtoWarehouse(w: any) {
		if (!w) return null;
		return { idWarehouse: w.id, nama: w.name || '', kota: w.city || '', alamat: w.address || '' };
	}

	async function loadCompany() {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			companyName = res.data?.data?.name || '';
		} catch {
			/* fallback name */
		}
	}
	async function loadAgreement(o: any) {
		if (!o.agreementId) {
			agreementRaw = null;
			return;
		}
		try {
			const res = await api.get(ENDPOINTS.agreements.one(o.agreementId));
			agreementRaw = res.data?.data ?? null;
		} catch {
			agreementRaw = null;
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
		if (!(d.loadingPoints?.length && d.unloadingPoints?.length) && d.rute) {
			try {
				const res = await api.get(ENDPOINTS.warehouses.list, { pageSize: 500 });
				warehouseList = (res.data?.data ?? []).map(toProtoWarehouse);
			} catch {
				warehouseList = [];
			}
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
		if (raw) await Promise.all([loadAgreement(raw), loadWarehouses(raw)]);
	}
	onMount(() => {
		loadCompany();
		loadOrder();
	});

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

	let order = $derived.by(() => {
		if (!raw) return null;
		const d = raw.detail || {};
		return {
			...d,
			id: raw.id,
			idOrder: raw.orderNumber || raw.id,
			shipperName: raw.shipperCompanyName || d.shipperName || '',
			status: kontrakStatus(raw),
			createdAt: raw.createdAt,
			agreementId: d.agreementId || raw.agreementId || '',
			loadingPoints: d.loadingPoints || (raw.originWarehouseId ? [raw.originWarehouseId] : []),
			unloadingPoints: d.unloadingPoints || (raw.destinationWarehouseId ? [raw.destinationWarehouseId] : []),
			items: d.items || [],
			totalTonnage: d.totalTonnage ?? (raw.weightKg != null ? Number(raw.weightKg) : 0),
			additionalNeeds: d.additionalNeeds || [],
			rute: d.rute || '',
			detail: d
		};
	});
	let detail = $derived<any>(order?.detail || {});
	// Prototype agreement shape: pricing lives in the agreement's `detail`.
	let agreement = $derived.by(() => {
		if (!agreementRaw) return null;
		const ad = agreementRaw.detail || {};
		return {
			idAgreement: agreementRaw.id,
			tarif: Number(ad.tarif) || 0,
			pricingType: ad.pricingType || '',
			paymentType: ad.paymentType || agreementRaw.paymentTypeId || '',
			incomeTaxStatus: ad.incomeTaxStatus || '',
			tonaseMin: ad.tonaseMin ?? ''
		};
	});

	function warehouseFor(wid: string) {
		return warehouses[wid] || null;
	}
	function warehouseByName(name: string) {
		const n = (name || '').trim().toLowerCase();
		if (!n) return null;
		return warehouseList.find((w) => (w.nama || '').trim().toLowerCase() === n) || null;
	}
	let loadingWarehouses = $derived.by(() => {
		if (!order) return [] as any[];
		const ids: string[] = order.loadingPoints || [];
		if (ids.length) return ids.map(warehouseFor).filter(Boolean);
		const name = (order.rute || '').split(' — ')[0]?.split(' + ')[0];
		const w = warehouseByName(name);
		return w ? [w] : [];
	});
	let unloadingWarehouses = $derived.by(() => {
		if (!order) return [] as any[];
		const ids: string[] = order.unloadingPoints || [];
		if (ids.length) return ids.map(warehouseFor).filter(Boolean);
		const name = (order.rute || '').split(' — ')[1]?.split(' + ')[0];
		const w = warehouseByName(name);
		return w ? [w] : [];
	});

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

	function podPhotoSrc(phaseKey: string, typeKey: string): string | null {
		return detail.podPhotos?.[phaseKey]?.[typeKey]?.[0] || null;
	}

	let invoiceId = $derived(order ? `INV${String(order.idOrder).replace(/^ORM/, '')}` : '');
	let invoiceFinalized = $derived(!!detail.invoiceFinalized);

	let awalKargo = $derived({
		totalTonnage: order?.totalTonnage || 0,
		totalVolume: totalVolumeM3,
		totalKuantitas: totalKuantitas
	});
	let finalKargo = $derived({
		totalTonnage: detail.invoiceFinal?.totalTonnage ?? awalKargo.totalTonnage,
		totalVolume: detail.invoiceFinal?.totalVolume ?? awalKargo.totalVolume,
		totalKuantitas: detail.invoiceFinal?.totalKuantitas ?? awalKargo.totalKuantitas
	});
	let awalNeeds = $derived<string[]>(order?.additionalNeeds || []);
	let finalNeeds = $derived<string[]>(detail.invoiceFinal?.additionalNeeds ?? awalNeeds);
	let finalNeedsPricing = $derived<Record<string, any>>(detail.invoiceFinal?.additionalNeedsPricing || {});
	let finalMinimum = $derived({
		pakai: !!detail.invoiceFinal?.pakaiHargaMinimum,
		tonaseMinimum:
			detail.invoiceFinal?.tonaseMinimum ??
			(agreement?.pricingType === 'per-kg' ? agreement.tonaseMin || '' : ''),
		hargaMinimal: detail.invoiceFinal?.hargaMinimal ?? 0
	});

	let baseRateValue = $derived(estimatedOrderValue(agreement, { totalTonnage: finalKargo.totalTonnage }));
	let finalNeedsTotal = $derived(
		Object.values(finalNeedsPricing).reduce((sum: number, v: any) => sum + (Number(v) || 0), 0)
	);
	let transportCostValue = $derived(baseRateValue + finalNeedsTotal);
	let subTotalValue = $derived.by(() => {
		const computedTotal = transportCostValue;
		const min = finalMinimum;
		return min.pakai && Number(min.hargaMinimal) > computedTotal ? Number(min.hargaMinimal) : computedTotal;
	});

	let noteDraft = $state('');
	let noteSaving = $state(false);
	let noteLoaded = $state(false);
	$effect(() => {
		const o = order;
		if (!o || noteLoaded) return;
		noteDraft =
			o.detail?.invoiceNote ??
			(o.status === 'pengiriman_terkonfirmasi'
				? 'Invoice siap diproses pembayaran.'
				: 'Invoice menunggu proses pengiriman selesai.');
		noteLoaded = true;
	});
	async function saveNote() {
		noteSaving = true;
		try {
			await patchDetail({ invoiceNote: noteDraft.trim() });
			toast('Catatan invoice disimpan');
		} catch {
			/* toasted */
		} finally {
			noteSaving = false;
		}
	}
	function cancelNoteEdit() {
		noteDraft = detail.invoiceNote || noteDraft;
	}

	let combineByAgreement = $state(false);
	function onToggleCombine() {
		combineByAgreement = !combineByAgreement;
		if (combineByAgreement) toast('Fitur gabungkan invoice berdasarkan Agreement segera hadir');
	}

	// ---------- Edit Invoice Shipment ----------
	let editMode = $state(false);
	let editDraft = $state<{
		totalTonnage: any;
		totalVolume: any;
		totalKuantitas: any;
		needs: string[];
		needsPricing: Record<string, any>;
		pakaiHargaMinimum: boolean;
		tonaseMinimum: any;
		hargaMinimal: any;
	}>({
		totalTonnage: 0,
		totalVolume: 0,
		totalKuantitas: 0,
		needs: [],
		needsPricing: {},
		pakaiHargaMinimum: false,
		tonaseMinimum: '',
		hargaMinimal: 0
	});
	let editAddNeedValue = $state('');
	let availableNeedsToAdd = $derived(
		ADDITIONAL_NEEDS_OPTIONS.filter((o: any) => !editDraft.needs.includes(o.value))
	);

	function startEditShipment() {
		editDraft = {
			totalTonnage: finalKargo.totalTonnage,
			totalVolume: finalKargo.totalVolume,
			totalKuantitas: finalKargo.totalKuantitas,
			needs: [...finalNeeds],
			needsPricing: { ...finalNeedsPricing },
			pakaiHargaMinimum: finalMinimum.pakai,
			tonaseMinimum: finalMinimum.tonaseMinimum,
			hargaMinimal: finalMinimum.hargaMinimal
		};
		editAddNeedValue = '';
		editMode = true;
	}
	function cancelEditShipment() {
		editMode = false;
	}
	function addEditNeed() {
		if (!editAddNeedValue) return;
		if (!editDraft.needs.includes(editAddNeedValue)) editDraft.needs.push(editAddNeedValue);
		editAddNeedValue = '';
	}
	function removeEditNeed(v: string) {
		editDraft.needs = editDraft.needs.filter((n) => n !== v);
		delete editDraft.needsPricing[v];
	}
	let editSaving = $state(false);
	async function saveEditShipment() {
		editSaving = true;
		try {
			const needsPricing: Record<string, number> = {};
			for (const v of editDraft.needs) needsPricing[v] = Number(editDraft.needsPricing[v]) || 0;
			await patchDetail({
				invoiceFinal: {
					totalTonnage: Number(editDraft.totalTonnage) || 0,
					totalVolume: Number(editDraft.totalVolume) || 0,
					totalKuantitas: Number(editDraft.totalKuantitas) || 0,
					additionalNeeds: editDraft.needs,
					additionalNeedsPricing: needsPricing,
					pakaiHargaMinimum: editDraft.pakaiHargaMinimum,
					tonaseMinimum: Number(editDraft.tonaseMinimum) || 0,
					hargaMinimal: Number(editDraft.hargaMinimal) || 0
				}
			});
			editMode = false;
			toast('Perubahan shipment disimpan');
		} catch {
			/* toasted */
		} finally {
			editSaving = false;
		}
	}
	function printInvoice() {
		window.print();
	}
	function backToOrder() {
		goto(`${basePath}/order/kontrak/${id}`);
	}

	// ---------- Generic confirm modal ----------
	let confirmModalOpen = $state(false);
	let confirmModalText = $state('');
	let confirmModalBusy = $state(false);
	let confirmModalAction: (() => Promise<void>) | null = null;
	function askConfirm(text: string, action: () => Promise<void>) {
		confirmModalText = text;
		confirmModalAction = action;
		confirmModalOpen = true;
	}
	function closeConfirmModal() {
		confirmModalOpen = false;
		confirmModalAction = null;
	}
	async function runConfirmedAction() {
		const action = confirmModalAction;
		if (!action) return;
		confirmModalBusy = true;
		try {
			await action();
		} catch {
			/* toasted by patchDetail */
		} finally {
			confirmModalBusy = false;
			confirmModalOpen = false;
			confirmModalAction = null;
		}
	}

	// ---------- Finalisasi Invoice ----------
	function onFinalizeInvoiceClick() {
		askConfirm(
			'Apakah Anda yakin ingin memfinalisasi invoice ini? Setelah final, data Kesepakatan Final tidak dapat diubah lagi.',
			async () => {
				await patchDetail({
					invoiceFinalized: true,
					invoiceFinalizedAt: new Date().toISOString(),
					invoiceFinalizedBy: actorName
				});
				toast('Invoice berhasil difinalisasi');
			}
		);
	}

	// ---------- Invoice Progress ----------
	let progress = $derived({
		berkas: {
			done: false,
			files: [] as { name: string; url: string }[],
			at: '',
			by: '',
			...detail.invoiceProgress?.berkas
		},
		verifikasi: { done: false, tanggalPembayaran: '', at: '', by: '', ...detail.invoiceProgress?.verifikasi },
		billing: {
			done: false,
			buktiPembayaran: null as { name: string; url: string } | null,
			status: 'unpaid',
			at: '',
			by: '',
			...detail.invoiceProgress?.billing
		}
	});
	async function updateInvoiceProgress(stepKey: string, stepData: Record<string, any>) {
		await patchDetail({
			invoiceProgress: {
				...(detail.invoiceProgress || {}),
				[stepKey]: { ...stepData, at: new Date().toISOString(), by: actorName }
			}
		});
	}

	// ---------- Document preview modal ----------
	let docPreviewOpen = $state(false);
	let docPreviewData = $state({ title: '', url: '' });
	let docPreviewIsImage = $derived(docPreviewData.url.startsWith('data:image'));
	function openDocPreview(title: string, file: { name?: string; url?: string } | null) {
		if (!file?.url) return;
		docPreviewData = { title, url: file.url };
		docPreviewOpen = true;
	}
	function closeDocPreview() {
		docPreviewOpen = false;
	}
	function onDocPreviewOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeDocPreview();
	}

	// Step 1 — Pengiriman Berkas
	let berkasFiles = $state<{ name: string; url: string }[]>([]);
	async function addBerkasFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const url = (await fileToDataUrl(file)) as string;
			berkasFiles.push({ name: file.name, url });
		} catch (err: any) {
			toast(err.message);
		}
	}
	function removeBerkasFile(i: number) {
		berkasFiles.splice(i, 1);
	}
	function submitBerkas() {
		if (!berkasFiles.length) return;
		askConfirm('Kirim berkas ini untuk melanjutkan proses invoice?', async () => {
			await updateInvoiceProgress('berkas', { done: true, files: berkasFiles.map((f) => ({ ...f })) });
			toast('Berkas berhasil dikirim');
		});
	}

	// Step 2 — Verifikasi
	let verifikasiModalOpen = $state(false);
	let tanggalPembayaranDraft = $state('');
	function openVerifikasiModal() {
		if (!progress.berkas.done || progress.verifikasi.done) return;
		tanggalPembayaranDraft = progress.verifikasi.tanggalPembayaran || '';
		verifikasiModalOpen = true;
	}
	function closeVerifikasiModal() {
		verifikasiModalOpen = false;
	}
	function onVerifikasiOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeVerifikasiModal();
	}
	function submitVerifikasi() {
		if (!tanggalPembayaranDraft) return;
		verifikasiModalOpen = false;
		const tanggal = tanggalPembayaranDraft;
		askConfirm(`Konfirmasi tanggal pembayaran ${tanggal}?`, async () => {
			await updateInvoiceProgress('verifikasi', { done: true, tanggalPembayaran: tanggal });
			toast('Verifikasi berhasil disimpan');
		});
	}

	// Step 3 — Billing Status
	let billingModalOpen = $state(false);
	let buktiPembayaranDraft = $state<{ name: string; url: string } | null>(null);
	function openBillingModal() {
		if (!progress.verifikasi.done || progress.billing.done) return;
		buktiPembayaranDraft = progress.billing.buktiPembayaran || null;
		billingModalOpen = true;
	}
	function closeBillingModal() {
		billingModalOpen = false;
	}
	function onBillingOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeBillingModal();
	}
	async function onBuktiPembayaranChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const url = (await fileToDataUrl(file)) as string;
			buktiPembayaranDraft = { name: file.name, url };
		} catch (err: any) {
			toast(err.message);
		}
	}
	function submitBilling() {
		if (!buktiPembayaranDraft) return;
		billingModalOpen = false;
		const bukti = { ...buktiPembayaranDraft };
		askConfirm('Konfirmasi pembayaran ini? Status invoice akan berubah menjadi Paid.', async () => {
			await updateInvoiceProgress('billing', { done: true, buktiPembayaran: bukti, status: 'paid' });
			toast('Pembayaran berhasil dikonfirmasi');
		});
	}
</script>

<div class="invoice-page">
	{#if !order}
		{#if loaded}
			<div class="card card-pad">
				<div class="empty">
					<div class="eic">🧾</div>
					Order Kontrak tidak ditemukan.<br />
					<button class="btn btn-text" style="margin-top:10px;" onclick={backToOrder}>&larr; Kembali</button>
				</div>
			</div>
		{/if}
	{:else}
		<div class="doc-toolbar">
			<button class="btn btn-outline" onclick={backToOrder}>&larr; Kembali</button>
			<button class="btn btn-primary" onclick={printInvoice}
				><span class="icon-wrap"><Download size={15} /></span> Cetak PDF</button
			>
		</div>

		<div class="invoice-doc">
			<div class="invoice-status-bar">
				<span>Status : <b>{invoiceFinalized ? 'Final' : 'Draft'}</b></span>
				<span class="invoice-status-bar-id">{invoiceId}</span>
				<span>Tanggal : {formatTimestampLabel(order.createdAt).split(',')[0]}</span>
			</div>
			<div class="invoice-status-sub">{order.idOrder}</div>

			<div class="invoice-info-row">
				<div class="invoice-info-item">
					<span class="invoice-info-icon"><span class="icon-wrap"><User size={13} /></span></span>
					<div>
						<div class="invoice-info-label">Shipper</div>
						<div class="invoice-info-value">{order.shipperName || '-'}</div>
					</div>
				</div>
				<div class="invoice-info-item">
					<span class="invoice-info-icon"><span class="icon-wrap"><Truck size={16} /></span></span>
					<div>
						<div class="invoice-info-label">Transporter</div>
						<div class="invoice-info-value">{TRANSPORTER_NAME}</div>
					</div>
				</div>
				<div class="invoice-info-item">
					<span class="invoice-info-icon"><span class="icon-wrap"><ClipboardList size={19} /></span></span>
					<div>
						<div class="invoice-info-label">Jumlah Shipment</div>
						<div class="invoice-info-value">1</div>
					</div>
				</div>
			</div>

			<div class="invoice-tabs">
				<span class="invoice-tab invoice-tab--active">Data Shipment (1)</span>
			</div>

			<div class="invoice-card">
				<div class="invoice-two-col">
					<div>
						<div class="invoice-field-label">Lokasi</div>
						<div class="invoice-field-value">
							{loadingWarehouses.map((w) => (w.kota || '').toUpperCase()).join(' + ') || '-'} — {unloadingWarehouses
								.map((w) => (w.kota || '').toUpperCase())
								.join(' + ') || '-'}
						</div>
					</div>
					<div>
						<div class="invoice-field-label">Agreement</div>
						<div class="invoice-field-value">{order.agreementId || '-'}</div>
						<div class="invoice-field-label" style="margin-top:16px;">Payment Type (TOP)</div>
						<div class="invoice-field-value">{agreement ? paymentTypeLabel(agreement.paymentType) : '-'}</div>
					</div>
				</div>

				<div class="invoice-field-label" style="margin-top:20px;">Loading</div>
				{#each loadingWarehouses as w, i (`load-${i}`)}
					<div class="invoice-field-value">
						{#if loadingWarehouses.length > 1}Titik {i + 1} —
						{/if}{w.alamat || '-'}
					</div>
				{/each}
				{#if !loadingWarehouses.length}<div class="invoice-field-value">-</div>{/if}

				<div class="invoice-field-label" style="margin-top:16px;">Unloading</div>
				{#each unloadingWarehouses as w, i (`unload-${i}`)}
					<div class="invoice-field-value">
						{#if unloadingWarehouses.length > 1}Titik {i + 1} —
						{/if}{w.alamat || '-'}
					</div>
				{/each}
				{#if !unloadingWarehouses.length}<div class="invoice-field-value">-</div>{/if}

				<div class="invoice-two-col" style="margin-top:24px;">
					<div>
						<div class="invoice-section-title">
							<span class="icon-wrap"><Camera size={14} /></span> Foto POD Loading Shipment ( 1 )
						</div>
						<div class="invoice-photo-row">
							<div class="invoice-photo-slot">
								{#if podPhotoSrc('muat', 'suratJalan')}
									<img src={podPhotoSrc('muat', 'suratJalan')} alt="" />
								{:else}
									<span>No photo</span>
								{/if}
								<div class="invoice-photo-caption">Fisik POD Muat</div>
							</div>
							<div class="invoice-photo-slot">
								{#if podPhotoSrc('muat', 'muatan')}
									<img src={podPhotoSrc('muat', 'muatan')} alt="" />
								{:else}
									<span>No photo</span>
								{/if}
								<div class="invoice-photo-caption">Foto Muat</div>
							</div>
						</div>
					</div>
					<div>
						<div class="invoice-section-title">
							<span class="icon-wrap"><Camera size={14} /></span> Foto POD Unloading Shipment ( 1 )
						</div>
						<div class="invoice-photo-row">
							<div class="invoice-photo-slot">
								{#if podPhotoSrc('bongkar', 'suratJalan')}
									<img src={podPhotoSrc('bongkar', 'suratJalan')} alt="" />
								{:else}
									<span>No photo</span>
								{/if}
								<div class="invoice-photo-caption">Fisik POD Bongkar</div>
							</div>
							<div class="invoice-photo-slot">
								{#if podPhotoSrc('bongkar', 'muatan')}
									<img src={podPhotoSrc('bongkar', 'muatan')} alt="" />
								{:else}
									<span>No photo</span>
								{/if}
								<div class="invoice-photo-caption">Foto Bongkar</div>
							</div>
						</div>
					</div>
				</div>

				<div class="invoice-section-title" style="margin-top:26px;">
					<span class="icon-wrap"><Banknote size={16} /></span> Harga Detail Shipment ( 1 )
				</div>
				<div class="invoice-two-col">
					<div class="invoice-subcard">
						<div class="invoice-subcard-head">Kesepakatan Awal</div>
						<div class="invoice-field-label">Harga Angkut ( Rp )</div>
						<div class="invoice-field-value invoice-field-value--muted">{formatRp(baseRateValue)}</div>
						<div class="invoice-field-label" style="margin-top:14px;">Harga Transport ( Rp )</div>
						<div class="invoice-field-value invoice-field-value--muted">{formatRp(baseRateValue)}</div>
					</div>
					<div class="invoice-subcard">
						<div class="invoice-subcard-head">Kesepakatan Final</div>
						<div class="invoice-field-label">Harga Angkut ( Rp )</div>
						<div class="invoice-field-value invoice-field-value--muted">{formatRp(baseRateValue)}</div>
						<div class="invoice-field-label" style="margin-top:14px;">Harga Transport ( Rp )</div>
						<div class="invoice-field-value invoice-field-value--muted">{formatRp(baseRateValue)}</div>
					</div>
				</div>

				<div class="invoice-section-title" style="margin-top:26px;">
					<span class="icon-wrap"><Package size={16} /></span> Detail Kargo Shipment ( 1 )
				</div>
				<div class="invoice-two-col">
					<div class="invoice-subcard">
						<div class="invoice-subcard-head">Kesepakatan Awal</div>
						<div class="invoice-field-label">Berat Muatan ( Kg )</div>
						<div class="invoice-field-value invoice-field-value--muted">{awalKargo.totalTonnage}</div>
						<div class="invoice-field-label" style="margin-top:14px;">Volume Muatan ( M³ )</div>
						<div class="invoice-field-value invoice-field-value--muted">{awalKargo.totalVolume}</div>
						<div class="invoice-field-label" style="margin-top:14px;">Kuantitas</div>
						<div class="invoice-field-value invoice-field-value--muted">{awalKargo.totalKuantitas}</div>
					</div>
					<div class="invoice-subcard" class:invoice-subcard--highlight={editMode}>
						<div class="invoice-subcard-head">Kesepakatan Final</div>
						{#if editMode}
							<div class="invoice-field-label">Berat Muatan ( Kg )</div>
							<div class="invoice-input-wrap">
								<input type="number" bind:value={editDraft.totalTonnage} /><span>Kg</span>
							</div>
							<div class="invoice-field-label" style="margin-top:14px;">Volume Muatan ( M³ )</div>
							<div class="invoice-input-wrap">
								<input type="number" bind:value={editDraft.totalVolume} /><span>M³</span>
							</div>
							<div class="invoice-field-label" style="margin-top:14px;">Kuantitas</div>
							<div class="invoice-input-wrap">
								<input type="number" bind:value={editDraft.totalKuantitas} />
							</div>
						{:else}
							<div class="invoice-field-label">Berat Muatan ( Kg )</div>
							<div class="invoice-field-value invoice-field-value--muted">{finalKargo.totalTonnage}</div>
							<div class="invoice-field-label" style="margin-top:14px;">Volume Muatan ( M³ )</div>
							<div class="invoice-field-value invoice-field-value--muted">{finalKargo.totalVolume}</div>
							<div class="invoice-field-label" style="margin-top:14px;">Kuantitas</div>
							<div class="invoice-field-value invoice-field-value--muted">{finalKargo.totalKuantitas}</div>
						{/if}
					</div>
				</div>

				<div class="invoice-section-title" style="margin-top:26px;">
					<span class="icon-wrap"><Briefcase size={13} /></span> Kebutuhan Tambahan Shipment ( 1 )
				</div>
				<div class="invoice-two-col">
					<div class="invoice-subcard">
						<div class="invoice-subcard-head">Kesepakatan Awal</div>
						<div class="invoice-field-label">Daftar Kebutuhan</div>
						{#if awalNeeds.length}
							{#each awalNeeds as v (v)}
								<div style="margin-top:6px;">
									<div class="invoice-field-value">{additionalNeedsLabel(v)}</div>
								</div>
							{/each}
						{:else}
							<div class="invoice-field-value invoice-field-value--muted">Tidak ada kebutuhan tambahan</div>
						{/if}
					</div>
					<div class="invoice-subcard" class:invoice-subcard--highlight={editMode}>
						<div class="invoice-subcard-head">Kesepakatan Final</div>
						<div class="invoice-field-label">Daftar Kebutuhan</div>
						{#if editMode}
							<div class="invoice-chip-row">
								{#each editDraft.needs as v (v)}
									<span class="invoice-chip invoice-chip--removable">
										{additionalNeedsLabel(v)}
										<button type="button" onclick={() => removeEditNeed(v)}>&times;</button>
									</span>
								{/each}
								{#if availableNeedsToAdd.length}
									<select class="invoice-chip-select" bind:value={editAddNeedValue} onchange={addEditNeed}>
										<option value="" disabled>+ Tambah</option>
										{#each availableNeedsToAdd as o (o.value)}
											<option value={o.value}>{o.label}</option>
										{/each}
									</select>
								{/if}
							</div>
							{#each editDraft.needs as v (`harga-${v}`)}
								<div class="invoice-field-label" style="margin-top:14px;">
									Harga {additionalNeedsLabel(v)} ( Rp )
								</div>
								<div class="invoice-input-wrap">
									<span>Rp</span><input type="number" bind:value={editDraft.needsPricing[v]} />
								</div>
							{/each}
						{:else}
							{#if finalNeeds.length}
								<div class="invoice-chip-row">
									{#each finalNeeds as v (v)}
										<span class="invoice-chip">{additionalNeedsLabel(v)}</span>
									{/each}
								</div>
							{:else}
								<div class="invoice-field-value invoice-field-value--muted">Tidak ada kebutuhan tambahan</div>
							{/if}
							{#each finalNeeds as v (`harga-${v}`)}
								<div class="invoice-field-label" style="margin-top:14px;">
									Harga {additionalNeedsLabel(v)} ( Rp )
								</div>
								<div class="invoice-field-value invoice-field-value--muted">{finalNeedsPricing[v] || 0}</div>
							{/each}
						{/if}
					</div>
				</div>

				<div class="invoice-two-col" style="margin-top:26px; align-items:start;">
					<div>
						<div class="invoice-section-title">
							<span class="icon-wrap"><User size={13} /></span> Perhitungan Pajak Shipment ( 1 )
						</div>
						<div class="invoice-subcard">
							<div class="invoice-field-label">Status Income Tax (PPh 23)</div>
							<div class="invoice-field-value invoice-field-value--muted">
								{agreement ? incomeTaxLabel(agreement.incomeTaxStatus) : '-'}
							</div>
							<div class="invoice-field-label" style="margin-top:14px;">Dikenakan PPN ( 11 % )</div>
							<div class="invoice-field-value invoice-field-value--muted">Tidak</div>
							<div class="invoice-field-label" style="margin-top:14px;">Total Pengenaan Pajak ( Rp )</div>
							<div class="invoice-field-value invoice-field-value--muted">0</div>
						</div>
					</div>
					<div>
						<div class="invoice-section-title">
							<span class="icon-wrap"><Banknote size={16} /></span> Pengenaan Harga Minimum Shipment ( 1 )
						</div>
						<div class="invoice-subcard invoice-subcard--highlight">
							<label class="invoice-checkbox-row" class:invoice-checkbox-row--enabled={editMode}>
								{#if editMode}
									<input type="checkbox" bind:checked={editDraft.pakaiHargaMinimum} />
								{:else}
									<input type="checkbox" checked={finalMinimum.pakai} disabled />
								{/if}
								<div>
									<div class="invoice-field-label" style="margin-top:0;">Pakai harga minimum</div>
									<div class="invoice-hint">
										Dengan mengisi checklist pada kolom ini maka dikenakan harga minimum untuk pengiriman.
									</div>
								</div>
							</label>
							{#if editMode}
								<div class="invoice-field-label" style="margin-top:14px;">Tonase Minimum ( Kg )</div>
								<div class="invoice-input-wrap">
									<input type="number" bind:value={editDraft.tonaseMinimum} /><span>Kg</span>
								</div>
								<div class="invoice-field-label" style="margin-top:14px;">Harga Minimal ( Rp )</div>
								<div class="invoice-input-wrap">
									<span>Rp</span><input type="number" bind:value={editDraft.hargaMinimal} />
								</div>
							{:else}
								<div class="invoice-field-label" style="margin-top:14px;">Tonase Minimum ( Kg )</div>
								<div class="invoice-field-value invoice-field-value--muted">
									{finalMinimum.tonaseMinimum || '-'}
								</div>
								<div class="invoice-field-label" style="margin-top:14px;">Harga Minimal ( Rp )</div>
								<div class="invoice-field-value invoice-field-value--muted">{finalMinimum.hargaMinimal}</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="invoice-calc-block">
					<div class="invoice-calc-row">
						<div>
							<span class="invoice-calc-label">Base Rate Shipment ( 1 )</span><span class="invoice-calc-sub"
								>( Transportation Cost · Included Tax )</span
							>
						</div>
						<span class="invoice-calc-value">{formatRp(baseRateValue)}</span>
					</div>
					<div class="invoice-calc-row">
						<span class="invoice-calc-label">Include Income Tax</span><span class="invoice-calc-value">0</span
						>
					</div>
					<div class="invoice-calc-row">
						<span class="invoice-calc-label">Include PPN</span><span class="invoice-calc-value">0</span>
					</div>
					<div class="invoice-calc-row">
						<div>
							<span class="invoice-calc-label">Transportation Cost Shipment ( 1 )</span><span
								class="invoice-calc-sub">( Shipment Cost + Additional Requirements )</span
							>
						</div>
						<span class="invoice-calc-value">{formatRp(transportCostValue)}</span>
					</div>
					<div class="invoice-calc-row">
						<span class="invoice-calc-label">Exclude Income Tax</span><span class="invoice-calc-value">0</span
						>
					</div>
					<div class="invoice-calc-row">
						<span class="invoice-calc-label">Exclude PPN</span><span class="invoice-calc-value">0</span>
					</div>
					<div class="invoice-calc-row invoice-calc-row--bold">
						<span class="invoice-calc-label">Sub Total Shipment ( 1 )</span>
						<span class="invoice-calc-value">{formatRp(subTotalValue)}</span>
					</div>
				</div>

				<div class="invoice-edit-row">
					{#if editMode}
						<button class="btn btn-outline btn-sm" onclick={cancelEditShipment}>Batal</button>
						<button class="btn btn-primary btn-sm" disabled={editSaving} onclick={saveEditShipment}
							>{editSaving ? 'Menyimpan...' : 'Simpan perubahan shipment (1)'}</button
						>
					{:else}
						<button class="btn btn-outline btn-sm" onclick={startEditShipment}
							>Edit Invoice Shipment (1)</button
						>
					{/if}
				</div>
			</div>

			<!-- Invoice Progress — only reachable once the invoice is Final -->
			{#if invoiceFinalized}
				<div class="invoice-card">
					<div class="invoice-section-title">
						<span class="icon-wrap"><Database size={19} /></span> Invoice Progress
					</div>
					<div class="invoice-progress-steps">
						<div class="invoice-progress-step" class:done={progress.berkas.done}>
							<div class="invoice-progress-step-head">
								<span class="invoice-progress-step-icon" class:done={progress.berkas.done}
									><span class="icon-wrap"><FileText size={16} /></span></span
								>
								<span class="invoice-progress-step-title">Pengiriman Berkas</span>
								<span class="badge {progress.berkas.done ? 'badge-active' : 'badge-wait'}"
									>{progress.berkas.done ? 'Selesai' : 'Menunggu'}</span
								>
							</div>
							<div class="invoice-progress-step-body">
								{#if !progress.berkas.done}
									<div class="invoice-progress-files-label">Uploaded Files:</div>
									<div class="invoice-progress-files">
										{#each berkasFiles as f, i (i)}
											<div class="invoice-progress-file">
												<span>{f.name}</span>
												<button type="button" onclick={() => removeBerkasFile(i)}>&times;</button>
											</div>
										{/each}
										<label class="invoice-progress-add" title="Tambah file">
											<span class="icon-wrap"><Plus size={14} /></span>
											<input type="file" hidden onchange={addBerkasFile} />
										</label>
									</div>
									<button class="btn btn-primary btn-sm" disabled={!berkasFiles.length} onclick={submitBerkas}
										>Upload document invoice</button
									>
								{:else}
									<div class="invoice-progress-done-text">{progress.berkas.files.length} berkas terkirim</div>
									<div class="invoice-progress-files">
										{#each progress.berkas.files as f, i (i)}
											<div class="invoice-progress-file invoice-progress-file--view">
												<span>{f.name}</span>
												<button
													type="button"
													class="btn btn-outline btn-sm"
													onclick={() => openDocPreview(`Pengiriman Berkas — ${f.name}`, f)}>Lihat</button
												>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						<div class="invoice-progress-step" class:done={progress.verifikasi.done}>
							<div class="invoice-progress-step-head">
								<span class="invoice-progress-step-icon" class:done={progress.verifikasi.done}
									><span class="icon-wrap"><Calendar size={16} /></span></span
								>
								<span class="invoice-progress-step-title">Verifikasi</span>
								<span class="badge {progress.verifikasi.done ? 'badge-active' : 'badge-wait'}"
									>{progress.verifikasi.done ? 'Selesai' : 'Menunggu'}</span
								>
							</div>
							<div class="invoice-progress-step-body">
								{#if progress.verifikasi.done}
									<div class="invoice-progress-done-text">
										Tanggal Pembayaran: {progress.verifikasi.tanggalPembayaran}
									</div>
								{:else if progress.berkas.done}
									<div class="invoice-progress-pending-text">
										Masukkan tanggal pembayaran untuk melanjutkan.
									</div>
								{:else}
									<div class="invoice-progress-pending-text">Menunggu Pengiriman Berkas selesai.</div>
								{/if}
								<button
									class="btn btn-primary btn-sm"
									disabled={!progress.berkas.done || progress.verifikasi.done}
									onclick={openVerifikasiModal}>Verifikasi</button
								>
							</div>
						</div>

						<div class="invoice-progress-step" class:done={progress.billing.done}>
							<div class="invoice-progress-step-head">
								<span class="invoice-progress-step-icon" class:done={progress.billing.done}
									><span class="icon-wrap"><Banknote size={16} /></span></span
								>
								<span class="invoice-progress-step-title">Billing Status</span>
								<span class="badge {progress.billing.status === 'paid' ? 'badge-active' : 'badge-wait'}"
									>{progress.billing.status === 'paid' ? 'Paid' : 'Unpaid'}</span
								>
							</div>
							<div class="invoice-progress-step-body">
								{#if progress.billing.done}
									<div class="invoice-progress-done-text">Bukti pembayaran terkirim</div>
									<div class="invoice-progress-files">
										<div class="invoice-progress-file invoice-progress-file--view">
											<span>{progress.billing.buktiPembayaran?.name || '-'}</span>
											<button
												type="button"
												class="btn btn-outline btn-sm"
												onclick={() => openDocPreview('Bukti Pembayaran', progress.billing.buktiPembayaran)}
												>Lihat</button
											>
										</div>
									</div>
								{:else}
									{#if progress.verifikasi.done}
										<div class="invoice-progress-pending-text">
											Unggah bukti pembayaran untuk melunasi invoice.
										</div>
									{:else}
										<div class="invoice-progress-pending-text">Menunggu Verifikasi selesai.</div>
									{/if}
									<button
										class="btn btn-primary btn-sm"
										disabled={!progress.verifikasi.done}
										onclick={openBillingModal}>Confirm Payment</button
									>
								{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<div class="invoice-toggle-row">
				<span>Gabungkan Invoice berdasarkan Agreement</span>
				<button type="button" class="invoice-switch" class:on={combineByAgreement} onclick={onToggleCombine}
					><span class="invoice-switch-knob"></span></button
				>
			</div>

			<div class="invoice-card">
				<div class="invoice-section-title">
					<span class="icon-wrap"><Database size={19} /></span> Perhitungan Per Shipment
				</div>
				<div class="invoice-calc-block">
					<div class="invoice-calc-row">
						<div>
							<span class="invoice-calc-label">Biaya Shipment ( 1 )</span><span class="invoice-calc-sub"
								>( Jumlah biaya shipment (1) dengan kebutuhan tambahan )</span
							>
						</div>
						<span class="invoice-calc-value">{formatRp(subTotalValue)}</span>
					</div>
					<div class="invoice-calc-row invoice-calc-row--bold">
						<div>
							<span class="invoice-calc-label">Sub Total</span><span class="invoice-calc-sub"
								>( Jumlah seluruh biaya group shipment )</span
							>
						</div>
						<span class="invoice-calc-value">{formatRp(subTotalValue)}</span>
					</div>
				</div>
			</div>

			<div class="invoice-card">
				<div class="invoice-section-title">
					<span class="icon-wrap"><Database size={19} /></span> Rangkuman Perhitungan Seluruh Biaya
				</div>
				<div class="invoice-two-col" style="align-items:start; margin-top:14px;">
					<div>
						<div class="invoice-field-label">Catatan *</div>
						<textarea class="invoice-note-textarea" bind:value={noteDraft}></textarea>
						<div class="invoice-note-actions">
							<button class="btn btn-outline btn-sm" disabled={noteSaving} onclick={saveNote}
								>Simpan Catatan</button
							>
							<button class="btn btn-text btn-sm" onclick={cancelNoteEdit}>Batal</button>
						</div>
					</div>
					<div class="invoice-calc-block invoice-calc-block--plain">
						<div class="invoice-calc-row">
							<div>
								<span class="invoice-calc-label">Base Rate All Shipment</span><span class="invoice-calc-sub"
									>( Transportation Cost · Included Tax )</span
								>
							</div>
							<span class="invoice-calc-value">{formatRp(baseRateValue)}</span>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Include PPH23</span><span class="invoice-calc-value">0</span>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Include PPN21</span><span class="invoice-calc-value">0</span>
						</div>
						<div class="invoice-calc-row">
							<div>
								<span class="invoice-calc-label">Transportation Cost All Shipment</span><span
									class="invoice-calc-sub">( Shipment Cost + Additional Requirements )</span
								>
							</div>
							<span class="invoice-calc-value">{formatRp(transportCostValue)}</span>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Exclude PPH23</span><span class="invoice-calc-value">0</span>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Exclude PPN21</span><span class="invoice-calc-value">0</span>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Total Exclude Tax</span><span class="invoice-calc-value"
								>0</span
							>
						</div>
						<div class="invoice-calc-row">
							<span class="invoice-calc-label">Handling Fee</span><span class="invoice-calc-value">0</span>
						</div>
						<div class="invoice-total-row">
							<span class="invoice-calc-label">Jumlah Total</span>
							<span class="invoice-total-value">{formatRp(subTotalValue)}</span>
						</div>
					</div>
				</div>
			</div>

			<div class="invoice-card">
				<div class="invoice-section-title">
					<span class="icon-wrap"><Clock size={13} /></span> Invoice Log Activity
				</div>
				<div class="invoice-log-item">
					Draft invoice : {formatTimestampLabel(order.createdAt)} by {TRANSPORTER_NAME}
				</div>
				{#if invoiceFinalized}
					<div class="invoice-log-item">
						Invoice difinalisasi : {detail.invoiceFinalizedAt
							? formatTimestampLabel(detail.invoiceFinalizedAt)
							: '-'} by {detail.invoiceFinalizedBy || '-'}
					</div>
				{/if}
				{#if progress.berkas.done}
					<div class="invoice-log-item">
						Berkas invoice dikirim ({progress.berkas.files.length} file) : {progress.berkas.at
							? formatTimestampLabel(progress.berkas.at)
							: '-'} by {progress.berkas.by || '-'}
					</div>
				{/if}
				{#if progress.verifikasi.done}
					<div class="invoice-log-item">
						Verifikasi disimpan — Tanggal Pembayaran {progress.verifikasi.tanggalPembayaran} : {progress
							.verifikasi.at
							? formatTimestampLabel(progress.verifikasi.at)
							: '-'} by {progress.verifikasi.by || '-'}
					</div>
				{/if}
				{#if progress.billing.done}
					<div class="invoice-log-item">
						Pembayaran dikonfirmasi — status Paid : {progress.billing.at
							? formatTimestampLabel(progress.billing.at)
							: '-'} by {progress.billing.by || '-'}
					</div>
				{/if}
				{#if !invoiceFinalized}
					<div class="invoice-finalize-row">
						<button class="btn btn-primary btn-sm" onclick={onFinalizeInvoiceClick}>Finalisasi Invoice</button
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Verifikasi — Tanggal Pembayaran -->
	{#if verifikasiModalOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={onVerifikasiOverlayClick}>
			<div class="modal-box">
				<h3>Verifikasi Pembayaran</h3>
				<p>Masukkan tanggal pembayaran untuk melanjutkan proses verifikasi invoice ini.</p>
				<div class="detail-row" style="padding-top:4px;">
					<div class="detail-row-label"><b>Tanggal Pembayaran</b></div>
					<div class="detail-row-value">
						<input
							type="date"
							bind:value={tanggalPembayaranDraft}
							style="width:100%; padding:8px 10px; border:1px solid var(--outline); border-radius:8px;"
						/>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn btn-outline" onclick={closeVerifikasiModal}>Batal</button>
					<button class="btn btn-primary" disabled={!tanggalPembayaranDraft} onclick={submitVerifikasi}
						>Submit</button
					>
				</div>
			</div>
		</div>
	{/if}

	<!-- Billing Status — Bukti Pembayaran -->
	{#if billingModalOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={onBillingOverlayClick}>
			<div class="modal-box">
				<h3>Confirm Payment</h3>
				<p>Unggah bukti pembayaran untuk mengonfirmasi pelunasan invoice ini.</p>
				<div class="detail-row" style="padding-top:4px;">
					<div class="detail-row-label"><b>Bukti Pembayaran</b></div>
					<div class="detail-row-value">
						<label class="epod-doc-upload-link">
							{buktiPembayaranDraft?.name || 'Pilih File'}
							<input type="file" hidden onchange={onBuktiPembayaranChosen} />
						</label>
					</div>
				</div>
				<div class="modal-actions">
					<button class="btn btn-outline" onclick={closeBillingModal}>Batal</button>
					<button class="btn btn-primary" disabled={!buktiPembayaranDraft} onclick={submitBilling}
						>Submit</button
					>
				</div>
			</div>
		</div>
	{/if}

	<!-- Document preview — Lihat button on uploaded Invoice Progress files -->
	{#if docPreviewOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={onDocPreviewOverlayClick}>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal-box doc-preview-modal-box" onclick={(e) => e.stopPropagation()}>
				<h3>{docPreviewData.title}</h3>
				<div class="doc-preview-frame">
					{#if docPreviewIsImage}
						<img src={docPreviewData.url} alt="" />
					{:else}
						<iframe src={docPreviewData.url} title="Pratinjau dokumen"></iframe>
					{/if}
				</div>
				<div class="modal-actions">
					<button class="btn btn-primary" onclick={closeDocPreview}>Tutup</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Generic confirm — every submit above routes through this -->
	{#if confirmModalOpen}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={closeConfirmModal}>
			<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
			<div class="modal-box" onclick={(e) => e.stopPropagation()}>
				<h3>Konfirmasi</h3>
				<p>{confirmModalText}</p>
				<div class="modal-actions">
					<button class="btn btn-outline" disabled={confirmModalBusy} onclick={closeConfirmModal}
						>Batal</button
					>
					<button class="btn btn-primary" disabled={confirmModalBusy} onclick={runConfirmedAction}
						>{confirmModalBusy ? 'Memproses...' : 'Ya, Submit'}</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>
