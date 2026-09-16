<script lang="ts">
	/** Port of Step2DetailItem.vue. */
	import { ChevronDown, Trash2 } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { formatDateTimeLabel } from '$lib/revamp/date.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { ADDITIONAL_NEEDS_OPTIONS } from '$lib/revamp/additionalNeeds.js';
	import FieldSelect from '../FieldSelect.svelte';
	import {
		agreementFor,
		itemsShipped,
		lengthShipment,
		newItem,
		totalVolume,
		type Warehouse,
		type Wizard,
		type WizardShipment
	} from './wizardTypes';

	let {
		wizard = $bindable(),
		agreements = [],
		warehouses = [],
		transporterName = ''
	}: {
		wizard: Wizard;
		agreements?: any[];
		warehouses?: Warehouse[];
		transporterName?: string;
	} = $props();

	function warehouseName(id: string) {
		return warehouses.find((w) => w.id === id)?.name || '-';
	}
	function shipmentSummary(sp: WizardShipment) {
		const loading = sp.loadingPoints.map(warehouseName).join(' + ');
		const unloading = sp.unloadingPoints.map(warehouseName).join(' + ');
		return `${loading} — ${unloading}`;
	}
	function basePrice(sp: WizardShipment) {
		const a = agreementFor(agreements, sp);
		if (!a) return '-';
		const d = a.detail ?? {};
		return `${formatIDR(d.tarif)} ${pricingTypeLabel(d.pricingType)}`;
	}

	function addItem(sp: WizardShipment) {
		sp.items.push(newItem());
	}
	function removeItem(sp: WizardShipment, idx: number) {
		if (sp.items.length <= 1) return;
		sp.items.splice(idx, 1);
	}

	function notReady() {
		toast('Fitur ini akan segera hadir');
	}
</script>

<div class="card card-pad">
	<div class="two-col" style="margin-bottom:0;">
		<div class="field" style="margin-bottom:0;">
			<label>Estimated Load Schedule</label>
			<input
				type="text"
				readonly
				value={formatDateTimeLabel(wizard.estimatedLoadDate, wizard.estimatedLoadTime) || '-'}
			/>
		</div>
		<div class="field" style="margin-bottom:0;">
			<label>Order Expiration Date</label>
			<input type="text" readonly value={wizard.orderExpirationDate || '-'} />
		</div>
	</div>
</div>

<div class="section-title">
	<h2>Shipments</h2>
</div>

{#each wizard.shipments as sp, i (i)}
	{@const a = agreementFor(agreements, sp)}
	<div class="shipment-block">
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="shipment-block-header" onclick={() => (sp.expanded = !sp.expanded)}>
			<span class="shipment-block-title">
				Data Shipment ({i + 1})
				<span class="shipment-block-summary">{shipmentSummary(sp)}</span>
			</span>
			<span class="shipment-block-chevron" class:open={sp.expanded}><ChevronDown size={16} /></span>
		</div>
		<div class="shipment-block-body" hidden={!sp.expanded}>
			<div class="section-title" style="margin-top:0;">
				<h2>Price</h2>
			</div>
			<div class="two-col">
				<div class="field">
					<label>Agreement</label>
					<input type="text" readonly value={a?.agreementNumber || '-'} />
				</div>
				<div class="field">
					<label>Base Price</label>
					<input type="text" readonly value={basePrice(sp)} />
				</div>
			</div>
			<div class="two-col">
				<div class="field">
					<label>Cargo Item</label>
					<input type="text" readonly value={a?.detail?.namaBarang || '-'} />
				</div>
				<div class="field">
					<label>Cargo Type</label>
					<input type="text" readonly value={a?.detail?.cargoTypeSpecific || '-'} />
				</div>
			</div>
			<div class="two-col">
				<div class="field">
					<label>Fleet</label>
					<input type="text" readonly value="-" />
				</div>
				<div class="field">
					<label>Shipper</label>
					<input type="text" readonly value={transporterName} />
				</div>
			</div>
			<div class="two-col" style="margin-bottom:0;">
				<div class="field" style="margin-bottom:0;">
					<label>Costumer / Optional</label>
					<input type="text" readonly value="-" />
				</div>
				<div class="field" style="margin-bottom:0;">
					<label>Transporter</label>
					<input type="text" readonly value={transporterName} />
				</div>
			</div>

			<div class="section-title">
				<h2 style="display:inline-block;">Item Details</h2>
				<div style="float:right; display:flex; gap:10px;">
					<button type="button" class="btn btn-outline btn-sm" onclick={notReady}>Download Template</button>
					<button type="button" class="btn btn-outline btn-sm" onclick={notReady}>Upload CSV</button>
				</div>
			</div>

			<div class="table-wrap">
				<table class="item-detail-table">
					<thead>
						<tr>
							<th>Item's Name <span class="req">*</span></th>
							<th>Quantity</th>
							<th>Weight (Kg)</th>
							<th>P (m)</th>
							<th>L (m)</th>
							<th>T (m)</th>
							<th>Loading Description</th>
							<th></th>
						</tr>
					</thead>
					<tbody>
						{#each sp.items as item, idx (idx)}
							<tr>
								<td><input type="text" bind:value={item.itemName} placeholder="Nama barang" /></td>
								<td><input type="number" min="0" bind:value={item.quantity} placeholder="0" /></td>
								<td><input type="number" min="0" bind:value={item.weightKg} placeholder="0" /></td>
								<td><input type="number" min="0" step="0.1" bind:value={item.dimP} placeholder="P" /></td>
								<td><input type="number" min="0" step="0.1" bind:value={item.dimL} placeholder="L" /></td>
								<td><input type="number" min="0" step="0.1" bind:value={item.dimT} placeholder="T" /></td>
								<td
									><input
										type="text"
										bind:value={item.loadingDescription}
										placeholder="Catatan muat (opsional)"
									/></td
								>
								<td>
									<button
										type="button"
										class="mini-icon-btn-del"
										title="Hapus"
										disabled={sp.items.length <= 1}
										onclick={() => removeItem(sp, idx)}
									>
										<span class="icon-wrap"><Trash2 size={15} /></span>
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<button
				type="button"
				class="btn btn-outline btn-sm"
				style="margin-top:10px;"
				onclick={() => addItem(sp)}>+ Tambah Item</button
			>

			<div class="two-col" style="margin-top:22px;">
				<div class="field">
					<label>Total Tonnage (Kg) <span class="req">*</span></label>
					<input type="number" min="0" bind:value={sp.totalTonnage} placeholder="0" />
				</div>
				<div class="field">
					<label>Total Volume (m&sup3;)</label>
					<input type="text" readonly value={totalVolume(sp)} />
				</div>
			</div>
			<div class="two-col">
				<div class="field">
					<label>Items Shipped</label>
					<input type="text" readonly value={itemsShipped(sp)} />
				</div>
				<div class="field">
					<label>Length Shipment (m)</label>
					<input type="text" readonly value={lengthShipment(sp)} />
				</div>
			</div>
			<div class="two-col" style="margin-bottom:0;">
				<div class="field" style="margin-bottom:0;">
					<label>Additional Needs</label>
					<FieldSelect
						bind:value={sp.additionalNeeds}
						options={ADDITIONAL_NEEDS_OPTIONS}
						placeholder="Pilih kebutuhan tambahan"
						multiple
					/>
				</div>
			</div>
		</div>
	</div>
{/each}
