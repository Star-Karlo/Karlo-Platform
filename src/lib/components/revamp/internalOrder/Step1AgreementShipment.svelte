<script lang="ts">
	/** Port of Step1AgreementShipment.vue. */
	import { ChevronDown, Pencil, X } from 'lucide-svelte';
	import FieldSelect from '../FieldSelect.svelte';
	import WarehouseFormModal from '../WarehouseFormModal.svelte';
	import AgreementPickerModal from '../AgreementPickerModal.svelte';
	import WarehouseSearchField from '../WarehouseSearchField.svelte';
	import { MAX_TRUCK_OPTIONS } from '$lib/revamp/truckOptions.js';
	import { defaultPicOf, type Customer, type PointPic, type Warehouse, type Wizard } from './wizardTypes';
	import { Modal, Field, FormGrid, Input, Button } from '$lib/components/ui';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';

	let {
		wizard = $bindable(),
		customers = [],
		warehouses = [],
		onWarehouseCreated,
		onWarehouseUpdated
	}: {
		wizard: Wizard;
		customers?: Customer[];
		warehouses?: Warehouse[];
		onWarehouseCreated?: (w: Warehouse) => void;
		onWarehouseUpdated?: (w: Warehouse) => void;
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
		wizard.shipments[i].loadingPics.push(null);
	}
	function removeLoadingPoint(i: number, pointIndex: number) {
		const points = wizard.shipments[i].loadingPoints;
		if (points.length <= 1) return;
		points.splice(pointIndex, 1);
		wizard.shipments[i].loadingPics.splice(pointIndex, 1);
	}
	function addUnloadingPoint(i: number) {
		wizard.shipments[i].unloadingPoints.push('');
		wizard.shipments[i].unloadingPics.push(null);
	}
	function removeUnloadingPoint(i: number, pointIndex: number) {
		const points = wizard.shipments[i].unloadingPoints;
		if (points.length <= 1) return;
		points.splice(pointIndex, 1);
		wizard.shipments[i].unloadingPics.splice(pointIndex, 1);
	}

	/* ---------- PIC per point ----------
	   Picking a warehouse proposes its default PIC; the planner may switch to
	   another of the warehouse's PICs or add a new one, which is also saved to
	   the warehouse so the next order finds it. */
	type PicField = 'loadingPics' | 'unloadingPics';
	const picField = (field: 'loadingPoints' | 'unloadingPoints'): PicField => (field === 'loadingPoints' ? 'loadingPics' : 'unloadingPics');
	function warehouseOf(id: string): Warehouse | undefined {
		return warehouses.find((w) => w.id === id);
	}
	function onPointChosen(i: number, field: 'loadingPoints' | 'unloadingPoints', pointIndex: number, id: string) {
		const pics = wizard.shipments[i][picField(field)];
		while (pics.length <= pointIndex) pics.push(null);
		pics[pointIndex] = defaultPicOf(warehouseOf(id));
	}
	function picOptions(id: string): { value: string; label: string }[] {
		const w = warehouseOf(id);
		const list = (w?.pics?.length ? w.pics : w?.picName ? [{ id: 'legacy', name: w.picName, phone: w.picPhone ?? '' }] : []) as { id?: string; name: string; phone?: string }[];
		return list.map((p, k) => ({ value: p.id ?? `#${k}`, label: `${p.name}${p.phone ? ` · ${p.phone}` : ''}` }));
	}
	function picValue(pic: PointPic | null, id: string): string {
		if (!pic) return '';
		const w = warehouseOf(id);
		const k = (w?.pics ?? []).findIndex((p) => (pic.id && p.id === pic.id) || (p.name === pic.name && (p.phone ?? '') === pic.phone));
		if (k >= 0) return w!.pics![k].id ?? `#${k}`;
		if (w?.picName === pic.name) return 'legacy';
		return '';
	}
	function onPicSelect(i: number, field: 'loadingPoints' | 'unloadingPoints', pointIndex: number, value: string) {
		if (value === '__new__') {
			openNewPic(i, field, pointIndex);
			return;
		}
		const id = wizard.shipments[i][field][pointIndex];
		const w = warehouseOf(id);
		const pics = wizard.shipments[i][picField(field)];
		if (value === 'legacy' && w?.picName) {
			pics[pointIndex] = { name: w.picName, phone: w.picPhone ?? '' };
			return;
		}
		const k = (w?.pics ?? []).findIndex((p, idx) => (p.id ?? `#${idx}`) === value);
		pics[pointIndex] = k >= 0 ? { id: w!.pics![k].id, name: w!.pics![k].name, phone: w!.pics![k].phone ?? '' } : null;
	}

	let showPicModal = $state(false);
	let picTarget = $state<{ index: number; field: 'loadingPoints' | 'unloadingPoints'; pointIndex: number } | null>(null);
	let picForm = $state({ name: '', phone: '', saveToWarehouse: true });
	let picSaving = $state(false);
	let picError = $state('');
	function openNewPic(i: number, field: 'loadingPoints' | 'unloadingPoints', pointIndex: number) {
		picTarget = { index: i, field, pointIndex };
		picForm = { name: '', phone: '', saveToWarehouse: true };
		picError = '';
		showPicModal = true;
	}
	async function saveNewPic() {
		if (!picTarget) return;
		const name = picForm.name.trim();
		const phone = picForm.phone.trim();
		if (!name) {
			picError = 'Nama PIC wajib diisi';
			return;
		}
		const { index, field, pointIndex } = picTarget;
		const id = wizard.shipments[index][field][pointIndex];
		const w = warehouseOf(id);
		let saved: PointPic = { name, phone };
		picSaving = true;
		picError = '';
		try {
			if (picForm.saveToWarehouse && w) {
				const existing = (w.pics ?? []).map((p) => ({ id: p.id ?? '', name: p.name, phone: p.phone ?? '', isDefault: !!p.isDefault }));
				const pics = [...existing, { id: '', name, phone, isDefault: existing.length === 0 }];
				const res = await api.put(ENDPOINTS.warehouses.update(w.id), { name: w.name, pics });
				const updated = res.data?.data;
				if (updated) {
					onWarehouseUpdated?.(updated);
					const mine = (updated.pics ?? []).find((p: any) => p.name === name && (p.phone ?? '') === phone);
					if (mine) saved = { id: mine.id, name: mine.name, phone: mine.phone ?? '' };
				}
			}
			wizard.shipments[index][picField(field)][pointIndex] = saved;
			showPicModal = false;
		} catch (e: any) {
			picError = e?.response?.data?.message ?? 'PIC tidak bisa disimpan ke warehouse.';
		} finally {
			picSaving = false;
		}
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
										onchange={(id) => onPointChosen(i, 'loadingPoints', li, id)}
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
							{#if sp.loadingPoints[li]}
								<div class="point-pic-row">
									<span class="point-pic-label">PIC muat</span>
									<select
										class="point-pic-select"
										value={picValue(sp.loadingPics[li] ?? null, sp.loadingPoints[li])}
										onchange={(e) => onPicSelect(i, 'loadingPoints', li, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value="">— pilih PIC —</option>
										{#each picOptions(sp.loadingPoints[li]) as o (o.value)}
											<option value={o.value}>{o.label}</option>
										{/each}
										<option value="__new__">+ PIC baru…</option>
									</select>
								</div>
							{/if}
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
										onchange={(id) => onPointChosen(i, 'unloadingPoints', ui, id)}
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
							{#if sp.unloadingPoints[ui]}
								<div class="point-pic-row">
									<span class="point-pic-label">PIC bongkar</span>
									<select
										class="point-pic-select"
										value={picValue(sp.unloadingPics[ui] ?? null, sp.unloadingPoints[ui])}
										onchange={(e) => onPicSelect(i, 'unloadingPoints', ui, (e.currentTarget as HTMLSelectElement).value)}
									>
										<option value="">— pilih PIC —</option>
										{#each picOptions(sp.unloadingPoints[ui]) as o (o.value)}
											<option value={o.value}>{o.label}</option>
										{/each}
										<option value="__new__">+ PIC baru…</option>
									</select>
								</div>
							{/if}
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

<Modal open={showPicModal} size="sm" title="PIC baru" onClose={() => (showPicModal = false)}>
	<FormGrid>
		<Field label="Nama PIC" id="np-name" required><Input id="np-name" bind:value={picForm.name} placeholder="cth. Budi" /></Field>
		<Field label="Nomor WhatsApp" id="np-phone"><Input id="np-phone" bind:value={picForm.phone} placeholder="08xx…" /></Field>
		<Field label="" id="np-save" wide>
			<label class="np-check"><input type="checkbox" bind:checked={picForm.saveToWarehouse} /> Simpan ke daftar PIC warehouse ini</label>
		</Field>
	</FormGrid>
	{#if picError}<p class="np-error">{picError}</p>{/if}
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showPicModal = false)}>Batal</button>
		<Button onclick={saveNewPic} loading={picSaving}>Pakai PIC ini</Button>
	{/snippet}
</Modal>

<style>
	.point-pic-row { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
	.point-pic-label { font-size: 12px; color: var(--on-surface-variant, #6b7280); white-space: nowrap; }
	.point-pic-select { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid var(--outline-variant, #e5e7eb); border-radius: 8px; font: inherit; background: #fff; }
	.np-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
	.np-error { color: var(--danger, #b91c1c); font-size: 12px; margin-top: 8px; }
</style>
