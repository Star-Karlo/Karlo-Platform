<script lang="ts">
	/**
	 * Port of InternalOrderFormView.vue — the 3-step "Input Internal Order"
	 * wizard. Submit writes one POST /orders per shipment; the service
	 * generates the ORM order number and every prototype field lives in
	 * `detail` (with `internalOrder: true` marking it as Order Kontrak).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { estimatedOrderValue } from '$lib/revamp/orderPricing.js';
	import { formatDateTimeLabel } from '$lib/revamp/date.js';
	import WizardSteps from '$lib/components/revamp/WizardSteps.svelte';
	import Step1AgreementShipment from '$lib/components/revamp/internalOrder/Step1AgreementShipment.svelte';
	import Step2DetailItem from '$lib/components/revamp/internalOrder/Step2DetailItem.svelte';
	import Step4ReviewSubmit from '$lib/components/revamp/internalOrder/Step4ReviewSubmit.svelte';
	import {
		agreementFor,
		itemsShipped,
		newShipment,
		totalVolume,
		type Customer,
		type Warehouse,
		type Wizard
	} from '$lib/components/revamp/internalOrder/wizardTypes';

	let { basePath }: { basePath: string } = $props();

	const STEPS = [
		{ label: 'Input Agreement & Detail Shipment' },
		{ label: 'Input Detail Item' },
		{ label: 'Review & Submit Your Order' }
	];

	let currentStep = $state(0);

	let wizard = $state<Wizard>({
		estimatedLoadDate: '',
		estimatedLoadTime: '',
		orderExpirationDate: '',
		shipments: [newShipment()]
	});

	/* ---------- Reference data (the prototype's Pinia stores) ---------- */
	let transporterName = $state('');
	let customers = $state<Customer[]>([]);
	let agreements = $state<any[]>([]);
	let warehouses = $state<Warehouse[]>([]);

	onMount(async () => {
		const [me, shippers, agr, wh] = await Promise.allSettled([
			api.get(ENDPOINTS.companyMe),
			api.get(ENDPOINTS.shippers.list),
			api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 200 }),
			api.get(ENDPOINTS.warehouses.list, { pageSize: 500 })
		]);
		if (me.status === 'fulfilled') transporterName = me.value.data.data?.name ?? '';
		if (shippers.status === 'fulfilled') customers = shippers.value.data.data ?? [];
		if (agr.status === 'fulfilled') agreements = agr.value.data.data ?? [];
		if (wh.status === 'fulfilled') warehouses = wh.value.data.data ?? [];
	});

	function onWarehouseCreated(w: Warehouse) {
		warehouses = [...warehouses, w];
	}

	/* ---------- Validation ---------- */
	function validateStep1() {
		if (!wizard.estimatedLoadDate) return 'Estimated Load Schedule wajib diisi';
		// A load cannot be scheduled for a moment that has passed: the order
		// would be late before it is saved, and the agreement, the allowance
		// and the driver's own schedule are all read from this time.
		const loadAt = new Date(`${wizard.estimatedLoadDate}T${wizard.estimatedLoadTime || '00:00'}`);
		if (Number.isFinite(loadAt.getTime()) && loadAt.getTime() < Date.now() - 60_000) {
			return wizard.estimatedLoadTime
				? 'Jadwal muat sudah lewat — pilih tanggal dan jam yang belum berlalu'
				: 'Tanggal muat sudah lewat — pilih tanggal hari ini atau setelahnya';
		}
		if (!wizard.orderExpirationDate) return 'Order Expiration Date wajib diisi';
		if (wizard.orderExpirationDate < wizard.estimatedLoadDate) {
			return 'Order Expiration Date tidak boleh sebelum tanggal muat';
		}
		for (const [i, sp] of wizard.shipments.entries()) {
			if (!sp.customerNama) return `Customer pada Data Shipment (${i + 1}) wajib dipilih`;
			if (!sp.agreementId) return `Agreement pada Data Shipment (${i + 1}) wajib dipilih`;
			if (sp.loadingPoints.some((id) => !id))
				return `Loading Point pada Data Shipment (${i + 1}) wajib dipilih`;
			if (sp.unloadingPoints.some((id) => !id))
				return `Unloading Point pada Data Shipment (${i + 1}) wajib dipilih`;
		}
		return null;
	}

	function validateStep2() {
		for (const [i, sp] of wizard.shipments.entries()) {
			const hasEmptyName = sp.items.some((it) => !it.itemName.trim());
			if (hasEmptyName) return `Item's Name wajib diisi di semua baris pada Data Shipment (${i + 1})`;
			if (!Number(sp.totalTonnage) || Number(sp.totalTonnage) <= 0)
				return `Total Tonnage pada Data Shipment (${i + 1}) wajib diisi`;
		}
		return null;
	}

	function goNext() {
		if (currentStep === 0) {
			const error = validateStep1();
			if (error) {
				toast(error);
				return;
			}
		}
		if (currentStep === 1) {
			const error = validateStep2();
			if (error) {
				toast(error);
				return;
			}
		}
		if (currentStep < STEPS.length - 1) currentStep += 1;
	}
	function goBack() {
		if (currentStep > 0) currentStep -= 1;
		else goto(`${basePath}/order/kontrak`);
	}

	/* ---------- Submit ---------- */
	let submitting = $state(false);

	function warehouseName(id: string) {
		return warehouses.find((w) => w.id === id)?.name || '-';
	}
	function localIso(date: string, time: string) {
		const d = new Date(`${date}T${time || '00:00'}`);
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}

	async function submitOrder() {
		if (submitting) return;
		submitting = true;
		try {
			for (const sp of wizard.shipments) {
				const agreement = agreementFor(agreements, sp);
				const agreementDetail = agreement?.detail ?? {};
				const customer = customers.find((c) => c.name === sp.customerNama);
				const loadingNames = sp.loadingPoints.map(warehouseName).join(' + ');
				const unloadingNames = sp.unloadingPoints.map(warehouseName).join(' + ');
				const items = sp.items.map((it) => ({
					itemName: it.itemName,
					quantity: it.quantity,
					weightKg: it.weightKg,
					dimP: it.dimP,
					dimL: it.dimL,
					dimT: it.dimT,
					loadingDescription: it.loadingDescription
				}));
				const pickupAt = localIso(wizard.estimatedLoadDate, wizard.estimatedLoadTime);
				const expiresAt = localIso(wizard.orderExpirationDate, '23:59:59');
				await api.post(ENDPOINTS.orders.create, {
					customerCompanyId: customer?.id ?? agreement?.shipperCompanyId,
					agreementId: sp.agreementId,
					orderKind: 'standard',
					originWarehouseId: sp.loadingPoints[0],
					destinationWarehouseId: sp.unloadingPoints[sp.unloadingPoints.length - 1],
					pickupAt,
					// The service refuses an expiry later than the loading time (an
					// order that may be actioned after the truck was due is not a
					// schedule), so an expiry on the loading day is clamped to it.
					expiresAt: expiresAt && pickupAt && expiresAt > pickupAt ? pickupAt : expiresAt,
					weightKg: String(sp.totalTonnage ?? ''),
					quantity: String(itemsShipped(sp)),
					volumeM3: String(totalVolume(sp)),
					detail: {
						internalOrder: true,
						shipperName: sp.customerNama,
						rute: `${loadingNames} — ${unloadingNames}`,
						tanggalPickup: formatDateTimeLabel(wizard.estimatedLoadDate, wizard.estimatedLoadTime),
						nilai: estimatedOrderValue(agreement ? agreementDetail : null, sp),
						muatan: agreementDetail.namaBarang || '-',
						orderExpirationDate: wizard.orderExpirationDate,
						agreementId: agreement?.agreementNumber ?? '',
						transporterName,
						fleetDescription: sp.fleetDescription,
						truckOptions: [...(sp.truckOptions ?? [])],
						loadingPoints: [...sp.loadingPoints],
						unloadingPoints: [...sp.unloadingPoints],
						items,
						totalTonnage: sp.totalTonnage,
						additionalNeeds: [...sp.additionalNeeds],
						description: sp.description,
						warehouseLabel: sp.warehouseLabel,
						externalId: sp.externalId,
						orderSafety: sp.orderSafety
					}
				});
			}
			toast('Internal Order berhasil dibuat');
			goto(`${basePath}/order/kontrak`);
		} catch {
			toast('Gagal membuat order, silakan coba lagi');
		} finally {
			submitting = false;
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Input Internal Order</h1>
	</div>
</div>

<div class="wizard-layout">
	<WizardSteps steps={STEPS} bind:currentStep />

	<div>
		{#if currentStep === 0}
			<Step1AgreementShipment bind:wizard {customers} {warehouses} {onWarehouseCreated} />
		{:else if currentStep === 1}
			<Step2DetailItem bind:wizard {agreements} {warehouses} {transporterName} />
		{:else}
			<Step4ReviewSubmit bind:wizard {agreements} {warehouses} {transporterName} />
		{/if}

		<div class="wizard-nav-row">
			<button class="btn btn-outline" onclick={goBack} disabled={submitting}
				>{currentStep === 0 ? 'Batal' : '← Back'}</button
			>
			{#if currentStep < STEPS.length - 1}
				<button class="btn btn-primary" onclick={goNext}>Next</button>
			{:else}
				<button class="btn btn-primary" disabled={submitting} onclick={submitOrder}
					>{submitting ? 'Mengirim...' : 'Submit Order'}</button
				>
			{/if}
		</div>
	</div>
</div>
