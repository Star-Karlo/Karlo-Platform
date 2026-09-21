<script lang="ts">
	/** Port of Step4ReviewSubmit.vue (used as the wizard's step 3). */
	import { MapPin } from 'lucide-svelte';
	import { formatIDR } from '$lib/revamp/currency.js';
	import { formatDateTimeLabel } from '$lib/revamp/date.js';
	import { pricingTypeLabel } from '$lib/revamp/pricingType.js';
	import { additionalNeedsLabel } from '$lib/revamp/additionalNeeds.js';
	import { describeTruckOption } from '$lib/revamp/truckOptions.js';
	import { estimatedOrderValue } from '$lib/revamp/orderPricing.js';
	import { ORDER_SAFETY_OPTIONS } from '$lib/revamp/orderSafety.js';
	import FieldSelect from '../FieldSelect.svelte';
	import {
		agreementFor,
		itemsShipped,
		lengthShipment,
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

	function warehouseFor(id: string) {
		return warehouses.find((w) => w.id === id) || null;
	}
	function basePrice(sp: WizardShipment) {
		const a = agreementFor(agreements, sp);
		if (!a) return '-';
		const d = a.detail ?? {};
		return `${formatIDR(d.tarif)} ${pricingTypeLabel(d.pricingType)}`;
	}
	function estimatedValue(sp: WizardShipment): number {
		return estimatedOrderValue(agreementFor(agreements, sp)?.detail ?? null, sp);
	}
	let totalEstimatedValue = $derived(wizard.shipments.reduce((sum, sp) => sum + estimatedValue(sp), 0));
</script>

<div class="card card-pad">
	<div class="section-title" style="margin-top:0;">
		<h2>Ringkasan Order</h2>
	</div>
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

{#each wizard.shipments as sp, i (i)}
	{@const a = agreementFor(agreements, sp)}
	<div class="card card-pad fleet-shipment-card">
		<div class="section-title" style="margin-top:0;">
			<h2>Shipment {i + 1} — {sp.customerNama || '-'}</h2>
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

		<div class="detail-shipment-card" style="margin-bottom:20px;">
			{#each sp.loadingPoints as id, li (`load-${li}`)}
				<div class="detail-shipment-row">
					<span class="detail-shipment-icon"><MapPin /></span>
					<div class="detail-shipment-info">
						<div class="detail-shipment-label">
							Loading {sp.loadingPoints.length > 1 ? li + 1 : ''} — {warehouseFor(id)?.city || '-'}
						</div>
						<div class="detail-shipment-value">
							{warehouseFor(id)?.address || warehouseFor(id)?.name || '-'}
						</div>
					</div>
				</div>
			{/each}
			{#each sp.unloadingPoints as id, ui (`unload-${ui}`)}
				<div class="detail-shipment-row">
					<span class="detail-shipment-icon"><MapPin /></span>
					<div class="detail-shipment-info">
						<div class="detail-shipment-label">
							Unloading {sp.unloadingPoints.length > 1 ? ui + 1 : ''} — {warehouseFor(id)?.city || '-'}
						</div>
						<div class="detail-shipment-value">
							{warehouseFor(id)?.address || warehouseFor(id)?.name || '-'}
						</div>
					</div>
				</div>
			{/each}
		</div>

		<div class="two-col" style="margin-bottom:0;">
			<div class="field" style="margin-bottom:0;">
				<label>Shipper</label>
				<input type="text" readonly value={transporterName} />
			</div>
			<div class="field" style="margin-bottom:0;">
				<label>Transporter</label>
				<input type="text" readonly value={transporterName} />
			</div>
		</div>

		<div class="section-title">
			<h2>Item Details</h2>
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Item's Name</th>
						<th>Quantity</th>
						<th>Weight (Kg)</th>
						<th>P (m)</th>
						<th>L (m)</th>
						<th>T (m)</th>
						<th>Loading Description</th>
					</tr>
				</thead>
				<tbody>
					{#each sp.items as item, idx (idx)}
						<tr>
							<td>{item.itemName || '-'}</td>
							<td>{item.quantity || 0}</td>
							<td>{item.weightKg || 0}</td>
							<td>{item.dimP || 0}</td>
							<td>{item.dimL || 0}</td>
							<td>{item.dimT || 0}</td>
							<td>{item.loadingDescription || '-'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="two-col" style="margin-top:18px;">
			<div class="field">
				<label>Total Tonnage (Kg)</label>
				<input type="text" readonly value={sp.totalTonnage || 0} />
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

		{#if sp.truckOptions?.length}
			<div class="review-chip-group">
				<span class="review-chip-label">Truck Options</span>
				{#each sp.truckOptions as key (key)}
					<span class="review-chip">{describeTruckOption(key).label}</span>
				{/each}
			</div>
		{/if}

		{#if sp.additionalNeeds.length}
			<div class="review-chip-group">
				<span class="review-chip-label">Additional Needs</span>
				{#each sp.additionalNeeds as v (v)}
					<span class="review-chip">{additionalNeedsLabel(v)}</span>
				{/each}
			</div>
		{/if}

		<div class="review-cost-box">
			<div class="review-cost-box-label">Shipment Cost {i + 1}</div>
			<div class="review-cost-box-row">
				<div>
					<div class="review-cost-box-title">Transportation Cost</div>
					<div class="review-cost-box-hint">(Estimasi Total Shipment Cost)</div>
				</div>
				<b>{formatIDR(estimatedValue(sp))}</b>
			</div>
		</div>

		<div class="section-title">
			<h2>Additional Info</h2>
		</div>
		<div class="field">
			<label>Description</label>
			<span class="hint" style="display:block; margin:-4px 0 6px;">Additional shipment information</span>
			<textarea rows="3" bind:value={sp.description} placeholder="Fill in description"></textarea>
		</div>
		<div class="two-col">
			<div class="field">
				<label>Warehouse Label</label>
				<span class="hint" style="display:block; margin:-4px 0 6px;">Additional warehouse information</span>
				<input type="text" bind:value={sp.warehouseLabel} placeholder="Fill in label" />
			</div>
			<div class="field">
				<label>External ID</label>
				<input type="text" bind:value={sp.externalId} placeholder="Fill in external ID" />
			</div>
		</div>
		<div class="field" style="margin-bottom:0;">
			<label>Order Safety</label>
			<FieldSelect
				bind:value={sp.orderSafety}
				options={ORDER_SAFETY_OPTIONS}
				placeholder="Select Order Safety"
			/>
		</div>
	</div>
{/each}

<div class="card card-pad">
	<div class="review-value-row review-value-row-total">
		<span>Total Estimasi Nilai Seluruh Order</span>
		<b>{formatIDR(totalEstimatedValue)}</b>
	</div>
</div>
