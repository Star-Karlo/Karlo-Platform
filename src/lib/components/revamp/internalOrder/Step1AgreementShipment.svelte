<script lang="ts">
	/** Port of Step1AgreementShipment.vue. */
	import { ChevronDown, Pencil, X } from 'lucide-svelte';
	import FieldSelect from '../FieldSelect.svelte';
	import WarehouseFormModal from '../WarehouseFormModal.svelte';
	import AgreementPickerModal from '../AgreementPickerModal.svelte';
	import WarehouseSearchField from '../WarehouseSearchField.svelte';
	import { MAX_TRUCK_OPTIONS } from '$lib/revamp/truckOptions.js';
	import type { Customer, Warehouse, Wizard } from './wizardTypes';

	let {
		wizard = $bindable(),
		customers = [],
		warehouses = [],
		onWarehouseCreated
	}: {
		wizard: Wizard;
		customers?: Customer[];
		warehouses?: Warehouse[];
		onWarehouseCreated?: (w: Warehouse) => void;
	} = $props();

	let customerOptions = $derived(customers.map((c) => ({ value: c.name, label: c.name })));


	/* Changing the customer invalidates any agreement already picked for a
	   different customer. */
	function onCustomerChange(i: number) {
		const sp = wizard.shipments[i];
		sp.agreementId = '';
		sp.agreementLabel = '';
		sp.agreementTruckTypes = [];
		sp.truckOptions = [];
	}

	/* ---------- Select Agreement (picker modal) ---------- */
	let showAgreementPicker = $state(false);
	let agreementTargetIndex = $state<number | null>(null);
	let agreementModalCustomerFilter = $derived(
		agreementTargetIndex != null ? wizard.shipments[agreementTargetIndex].customerNama : ''
	);
	let agreementModalCustomerId = $derived(
		customers.find((c) => c.name === agreementModalCustomerFilter)?.id ?? ''
	);
	function openAgreementPicker(i: number) {
		if (!wizard.shipments[i].customerNama) return;
		agreementTargetIndex = i;
		showAgreementPicker = true;
	}
	function onAgreementSelected(a: any) {
		if (agreementTargetIndex == null) return;
		const sp = wizard.shipments[agreementTargetIndex];
		const d = a.detail ?? {};
		sp.agreementId = a.id;
		sp.agreementLabel = `${a.agreementNumber} — ${d.kotaAsal} - ${d.kotaTujuan}`;
		// Truck Options are the agreement's: the customer and transporter chose
		// them there, so the order just carries them for the planner.
		const agreed: string[] = Array.isArray(d.truckOptions) ? d.truckOptions : [];
		sp.agreementTruckTypes = Array.isArray(d.truckTypeMatrix) ? d.truckTypeMatrix : [];
		sp.truckOptions = agreed.slice(0, MAX_TRUCK_OPTIONS);
	}

	/* ---------- Create warehouse inline ---------- */
	let showWarehouseModal = $state(false);
	let createTarget = $state<{
		index: number;
		field: 'loadingPoints' | 'unloadingPoints';
		pointIndex: number;
	} | null>(null);
	function openCreateWarehouse(i: number, field: 'loadingPoints' | 'unloadingPoints', pointIndex: number) {
		createTarget = { index: i, field, pointIndex };
		showWarehouseModal = true;
	}
	function onWarehouseSaved(w: any) {
		onWarehouseCreated?.(w);
		if (!createTarget) return;
		const { index, field, pointIndex } = createTarget;
		wizard.shipments[index][field][pointIndex] = w.id;
		createTarget = null;
	}

	/* ---------- Multi pickup / multi drop ---------- */
	function addLoadingPoint(i: number) {
		wizard.shipments[i].loadingPoints.push('');
	}
	function removeLoadingPoint(i: number, pointIndex: number) {
		const points = wizard.shipments[i].loadingPoints;
		if (points.length <= 1) return;
		points.splice(pointIndex, 1);
	}
	function addUnloadingPoint(i: number) {
		wizard.shipments[i].unloadingPoints.push('');
	}
	function removeUnloadingPoint(i: number, pointIndex: number) {
		const points = wizard.shipments[i].unloadingPoints;
		if (points.length <= 1) return;
		points.splice(pointIndex, 1);
	}
	/** Today and now, in the browser's own zone, for the pickers' floors. */
	const pad = (n: number) => String(n).padStart(2, '0');
	const stamp = new Date();
	const today = `${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}`;
	const nowTime = `${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
</script>

<div class="card card-pad">
	<div class="two-col">
		<div class="field">
			<label>Estimated Load Schedule <span class="req">*</span></label>
			<div class="two-col" style="gap:12px; margin-bottom:0;">
				<!-- Today at the earliest; the picker itself refuses a past day,
				     and the wizard checks the clock too when a time is given. -->
				<input type="date" min={today} bind:value={wizard.estimatedLoadDate} />
				<input type="time" min={wizard.estimatedLoadDate === today ? nowTime : undefined} bind:value={wizard.estimatedLoadTime} />
			</div>
		</div>
		<div class="field">
			<label>Order Expiration Date <span class="req">*</span></label>
			<input type="date" min={wizard.estimatedLoadDate || today} bind:value={wizard.orderExpirationDate} />
		</div>
	</div>
</div>

<div class="section-title">
	<h2>Shipments</h2>
</div>

{#each wizard.shipments as sp, i (i)}
	<div class="shipment-block">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="shipment-block-header" onclick={() => (sp.expanded = !sp.expanded)}>
			<span class="shipment-block-title">Data Shipment</span>
			<div class="shipment-block-actions">
				<span class="shipment-block-chevron" class:open={sp.expanded}><ChevronDown size={16} /></span>
			</div>
		</div>
		<div class="shipment-block-body" hidden={!sp.expanded}>
			<div class="two-col">
				<div class="field">
					<label>Customer <span class="req">*</span></label>
					<FieldSelect
						bind:value={sp.customerNama}
						options={customerOptions}
						placeholder="Pilih customer"
						onchange={() => onCustomerChange(i)}
					/>
				</div>
				<div class="field">
					<label>Agreement <span class="req">*</span></label>
					<button
						type="button"
						class="btn btn-outline agreement-select-btn"
						disabled={!sp.customerNama}
						title={sp.agreementLabel || (!sp.customerNama ? 'Pilih customer terlebih dahulu' : '')}
						onclick={() => openAgreementPicker(i)}
					>
						<span class="agreement-select-btn-label">{sp.agreementLabel || 'Select Agreement'}</span>
					</button>
				</div>
			</div>

			<div class="two-col">
				<div class="field">
					<label>Loading Point <span class="req">*</span></label>
					{#each sp.loadingPoints as _lp, li (li)}
						<div class="multi-point-row">
							<div class="multi-point-search-row">
								<div class="multi-point-field">
									<WarehouseSearchField
										bind:value={sp.loadingPoints[li]}
										{warehouses}
										placeholder="Cari alamat atau nama warehouse..."
										disabled={!sp.agreementId}
									/>
								</div>
								<button
									type="button"
									class="mini-icon-btn"
									disabled={!sp.agreementId}
									title={!sp.agreementId ? 'Pilih agreement terlebih dahulu' : 'Daftarkan warehouse baru'}
									onclick={() => openCreateWarehouse(i, 'loadingPoints', li)}
									><span class="icon-wrap"><Pencil size={16} /></span></button
								>
								<button
									type="button"
									class="mini-icon-btn-del"
									title="Hapus titik muat"
									disabled={sp.loadingPoints.length <= 1}
									onclick={() => removeLoadingPoint(i, li)}
									><span class="icon-wrap"><X size={15} /></span></button
								>
							</div>
						</div>
					{/each}
					<button
						type="button"
						class="btn btn-outline btn-sm"
						disabled={!sp.agreementId}
						onclick={() => addLoadingPoint(i)}>+ Tambah Titik Muat</button
					>
				</div>

				<div class="field">
					<label>Unloading Point <span class="req">*</span></label>
					{#each sp.unloadingPoints as _up, ui (ui)}
						<div class="multi-point-row">
							<div class="multi-point-search-row">
								<div class="multi-point-field">
									<WarehouseSearchField
										bind:value={sp.unloadingPoints[ui]}
										{warehouses}
										placeholder="Cari alamat atau nama warehouse..."
										disabled={!sp.agreementId}
									/>
								</div>
								<button
									type="button"
									class="mini-icon-btn"
									disabled={!sp.agreementId}
									title={!sp.agreementId ? 'Pilih agreement terlebih dahulu' : 'Daftarkan warehouse baru'}
									onclick={() => openCreateWarehouse(i, 'unloadingPoints', ui)}
									><span class="icon-wrap"><Pencil size={16} /></span></button
								>
								<button
									type="button"
									class="mini-icon-btn-del"
									title="Hapus titik bongkar"
									disabled={sp.unloadingPoints.length <= 1}
									onclick={() => removeUnloadingPoint(i, ui)}
									><span class="icon-wrap"><X size={15} /></span></button
								>
							</div>
						</div>
					{/each}
					<button
						type="button"
						class="btn btn-outline btn-sm"
						disabled={!sp.agreementId}
						onclick={() => addUnloadingPoint(i)}>+ Tambah Titik Bongkar</button
					>
				</div>
			</div>

			<div class="field" style="margin-bottom:0;">
				<label>Fleet Description</label>
				<textarea rows="4" bind:value={sp.fleetDescription} placeholder="Fill in description"></textarea>
			</div>
		</div>
	</div>
{/each}

<AgreementPickerModal
	bind:show={showAgreementPicker}
	customerFilter={agreementModalCustomerFilter}
	customerId={agreementModalCustomerId}
	onSelected={onAgreementSelected}
/>
<WarehouseFormModal bind:show={showWarehouseModal} onSaved={onWarehouseSaved} />
