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
		itemsOfShipment,
		itemsShipped,
		newShipment,
		shipmentCount,
		totalTonnageKg,
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
	function onWarehouseUpdated(w: Warehouse) {
		warehouses = warehouses.map((x) => (x.id === w.id ? { ...x, ...w } : x));
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
			// Named by shipment, not by position in a list: on an order with
			// three shipments "Loading Point wajib dipilih" does not say which
			// block to scroll to.
			const many = shipmentCount(sp) > 1;
			const at = (k: number) => (many ? ` pada Shipment ${k + 1}` : '');
			for (let k = 0; k < shipmentCount(sp); k++) {
				if (!sp.loadingPoints[k]) return `Loading Point${at(k)} wajib dipilih`;
				if (!sp.unloadingPoints[k]) return `Unloading Point${at(k)} wajib dipilih`;
				// A PIC per point: the person the driver's OTP goes to and who
				// answers for the cargo there. The warehouse's default is
				// proposed automatically, so this only bites when it has none.
				if (!sp.loadingPics?.[k]?.name)
					return `PIC Loading Point${at(k)} wajib dipilih (atau tambahkan PIC baru)`;
				if (!sp.unloadingPics?.[k]?.name)
					return `PIC Unloading Point${at(k)} wajib dipilih (atau tambahkan PIC baru)`;
			}
		}
		return null;
	}

	function validateStep2() {
		for (const sp of wizard.shipments) {
			const many = shipmentCount(sp) > 1;
			for (let k = 0; k < shipmentCount(sp); k++) {
				const rows = itemsOfShipment(sp, k + 1);
				const at = many ? ` pada Shipment ${k + 1}` : '';
				if (!rows.length) return `Item wajib diisi${at}`;
				if (rows.some((it) => !it.itemName.trim()))
					return `Item's Name wajib diisi di semua baris${at}`;
				// Weight is what the shipment's plan is checked against at its
				// own stops, so a blank one cannot be totalled away.
				if (rows.some((it) => !(Number(it.weightKg) > 0)))
					return `Total Weight (Kg) wajib diisi di semua baris${at}`;
			}
			if (!(totalTonnageKg(sp) > 0)) return 'Total Tonnage wajib lebih dari 0';
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

	/** A contract covering several customers produces ONE order.
	 *
	 *  The cards are how the planner enters it — one per customer, because
	 *  each has its own warehouses — but what travels is one truck making one
	 *  journey, so it is one order. Splitting it per customer would produce
	 *  several orders nobody asked for, each needing its own truck.
	 *
	 *  The cards are merged in the order they appear: their points
	 *  concatenated, their items renumbered along the way, and each shipment
	 *  recording which customer's goods it carries. */
	function mergedForOneOrder(cards: typeof wizard.shipments) {
		const loadingPoints: string[] = [];
		const unloadingPoints: string[] = [];
		const loadingPics: any[] = [];
		const unloadingPics: any[] = [];
		const shipmentCustomers: string[] = [];
		const items: any[] = [];

		for (const card of cards) {
			const pairs = Math.max(card.loadingPoints.length, card.unloadingPoints.length, 1);
			for (let k = 0; k < pairs; k++) {
				// The number this shipment takes in the merged order, which is
				// what the items, the stops and the POD all key on.
				const shipmentNo = loadingPoints.length + 1;
				loadingPoints.push(card.loadingPoints[k] ?? '');
				unloadingPoints.push(card.unloadingPoints[k] ?? '');
				loadingPics.push(card.loadingPics[k] ?? null);
				unloadingPics.push(card.unloadingPics[k] ?? null);
				shipmentCustomers.push(card.customerNama);
				for (const it of card.items.filter((i) => (i.shipmentNo || 1) === k + 1)) {
					items.push({ ...it, shipmentNo });
				}
			}
		}
		return { loadingPoints, unloadingPoints, loadingPics, unloadingPics, shipmentCustomers, items };
	}

	async function submitOrder() {
		if (submitting) return;
		submitting = true;
		try {
			// One order per card, except for a contract covering several
			// customers: there, every card is one customer's part of the same
			// journey.
			const first = wizard.shipments[0];
			const oneOrder = first?.agreementType === 'multi-customer' && wizard.shipments.length > 1;
			const blocks = oneOrder ? [first] : wizard.shipments;
			const merged = oneOrder ? mergedForOneOrder(wizard.shipments) : null;

			for (const sp of blocks) {
				const agreement = agreementFor(agreements, sp);
				const agreementDetail = agreement?.detail ?? {};
				const customer = customers.find((c) => c.name === sp.customerNama);
				// The merged journey when several customers share this order,
				// otherwise this card's own.
				const loadingPointsOut = merged?.loadingPoints ?? sp.loadingPoints;
				const unloadingPointsOut = merged?.unloadingPoints ?? sp.unloadingPoints;
				const loadingPicsOut = merged?.loadingPics ?? sp.loadingPics;
				const unloadingPicsOut = merged?.unloadingPics ?? sp.unloadingPics;
				const loadingNames = loadingPointsOut.map(warehouseName).join(' + ');
				const unloadingNames = unloadingPointsOut.map(warehouseName).join(' + ');
				// Weight, quantity and volume cover the whole order, so on a
				// merged one they are every customer's items, not the first
				// card's. Reading the card would have priced a two-customer
				// order as though only one of them were shipping.
				const totalsOf = merged ? { ...sp, items: merged.items } : sp;
				const items = (merged?.items ?? sp.items).map((it) => ({
					// Which shipment's goods these are — the server pairs a
					// stop's plan to its items by this number.
					shipmentNo: it.shipmentNo || 1,
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
					originWarehouseId: loadingPointsOut[0],
					destinationWarehouseId: unloadingPointsOut[unloadingPointsOut.length - 1],
					pickupAt,
					// The service refuses an expiry later than the loading time (an
					// order that may be actioned after the truck was due is not a
					// schedule), so an expiry on the loading day is clamped to it.
					expiresAt: expiresAt && pickupAt && expiresAt > pickupAt ? pickupAt : expiresAt,
					weightKg: String(totalTonnageKg(totalsOf)),
					// Itemised cargo is NOT sent as rows. "items" is a field a
					// company switches on ("Itemised cargo", hidden by default),
					// and sending it to a company that has not enabled it fails
					// the whole order with "not enabled for your company". The
					// wizard's lines live on detail.items, with their shipmentNo,
					// which is what every screen reads for a shipment's plan.
					quantity: String(itemsShipped(totalsOf)),
					volumeM3: String(totalVolume(totalsOf)),
					detail: {
						internalOrder: true,
						shipperName: sp.customerNama,
						rute: `${loadingNames} — ${unloadingNames}`,
						tanggalPickup: formatDateTimeLabel(wizard.estimatedLoadDate, wizard.estimatedLoadTime),
						nilai: estimatedOrderValue(agreement ? agreementDetail : null, {
							totalTonnage: totalTonnageKg(totalsOf)
						}),
						muatan: agreementDetail.namaBarang || '-',
						orderExpirationDate: wizard.orderExpirationDate,
						agreementId: agreement?.agreementNumber ?? '',
						transporterName,
						fleetDescription: sp.fleetDescription,
						truckOptions: [...(sp.truckOptions ?? [])],
						loadingPoints: [...loadingPointsOut],
						unloadingPoints: [...unloadingPointsOut],
						// Which customer's goods each shipment carries. Absent
						// on an order with a single customer, where the order
						// already says whose it is.
						...(merged ? { shipmentCustomers: [...merged.shipmentCustomers] } : {}),
						// Who answers at each point, and the two K-Trip reads: the
						// loading PIC (first point) and the unloading PIC (last).
						loadingPics: loadingPointsOut.map((wid, k) => ({ warehouseId: wid, ...(loadingPicsOut[k] ?? { name: '', phone: '' }) })),
						unloadingPics: unloadingPointsOut.map((wid, k) => ({ warehouseId: wid, ...(unloadingPicsOut[k] ?? { name: '', phone: '' }) })),
						loadingPic: loadingPicsOut[0] ?? null,
						unloadingPic: unloadingPicsOut[unloadingPicsOut.length - 1] ?? null,
						items,
						totalTonnage: totalTonnageKg(totalsOf),
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
			<Step1AgreementShipment bind:wizard {customers} {warehouses} {onWarehouseCreated} {onWarehouseUpdated} />
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
