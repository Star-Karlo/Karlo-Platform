<script lang="ts">
	/** Port of Step1AgreementShipment.vue. */
	import { ChevronDown, Pencil } from 'lucide-svelte';
	import FieldSelect from '../FieldSelect.svelte';
	import WarehouseFormModal from '../WarehouseFormModal.svelte';
	import AgreementPickerModal from '../AgreementPickerModal.svelte';
	import WarehouseSearchField from '../WarehouseSearchField.svelte';
	import { MAX_TRUCK_OPTIONS } from '$lib/revamp/truckOptions.js';
	import {
		allowsManyShipments,
		defaultPicOf,
		newItem,
		newShipment,
		shipmentCount,
		type Customer,
		type PointPic,
		type Warehouse,
		type Wizard,
		type WizardShipment
	} from './wizardTypes';
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
	   different customer, and the warehouses with it: those sites belong to
	   the previous customer and are no longer offered. The lanes keep their
	   count so a multi-stop plan does not collapse on a mis-click. */
	function onCustomerChange(i: number) {
		const sp = wizard.shipments[i];
		sp.agreementId = '';
		sp.agreementLabel = '';
		sp.agreementTruckTypes = [];
		sp.truckOptions = [];
		sp.loadingPoints = sp.loadingPoints.map(() => '');
		sp.unloadingPoints = sp.unloadingPoints.map(() => '');
	}

	/* ---------- Whose warehouses a lane may pick from ----------
	   This customer's sites, as MyWarehouse groups them. Not the company's
	   own Gudang Sendiri as well: mixing those in padded a customer's list
	   with sites that are nothing to do with them.

	   Unless the customer has none — which is every customer of a company
	   that keeps all its sites under Gudang Sendiri — where the own sites
	   stand in, or such a company could not name a lane at all. A fact about
	   the data, not a branch for one customer. Kept in step with the same
	   rule in AgreementRevampFormPage.

	   Own sites carry no customerCompanyId; the API omits it when empty. */
	function warehousesFor(sp: { customerNama: string }, ...selected: string[]) {
		const customerId = customers.find((c) => c.name === sp.customerNama)?.id ?? '';
		const own = warehouses.filter((w: any) => !w.customerCompanyId);
		const theirs = customerId ? warehouses.filter((w: any) => w.customerCompanyId === customerId) : [];
		const base = !customerId ? own : theirs.length ? theirs : own;
		// A point the contract already chose stays nameable even if it falls
		// outside the scope — an agreement that names a Gudang Sendiri, or one
		// written before this scoping. The picker names a warehouse by finding
		// its id in the list it was handed, so dropping it would leave a
		// filled point looking empty while still carrying the id.
		const have = new Set(base.map((w: any) => w.id));
		// flatMap rather than map+filter(Boolean): the latter leaves `undefined`
		// in the type, and the picker's prop does not accept it.
		const kept = selected.flatMap((id) => {
			if (!id || have.has(id)) return [];
			const w = warehouses.find((x: any) => x.id === id);
			return w ? [w] : [];
		});
		return kept.length ? [...base, ...kept] : base;
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
		// The agreement decides how many shipments an order may carry, so
		// switching to a single-shipment one drops the shipments that contract
		// does not allow — and their items with them, rather than leaving
		// items behind pointing at a shipment that no longer exists.
		sp.agreementType = a.agreementType ?? d.agreementType ?? '';
		if (!allowsManyShipments(sp)) keepOnlyFirstShipment(sp);
		applyAgreementPoints(sp, d);
		rebuildCustomerCards(agreementTargetIndex, a, d);
	}

	/* ---------- What the contract already decided ----------
	   A contract that names its warehouses has already chosen this order's
	   points, and how many shipments it carries. Filling them in is not a
	   different flow: the fields are the same searches as always, and a
	   planner may still look one up again or replace it. A contract priced
	   city to city names no warehouses, so nothing is filled and the planner
	   picks them as before. */
	function applyAgreementPoints(sp: WizardShipment, detail: any) {
		const loads: string[] = Array.isArray(detail.loadingPoints) ? detail.loadingPoints.filter(Boolean) : [];
		const unloads: string[] = Array.isArray(detail.unloadingPoints)
			? detail.unloadingPoints.filter(Boolean)
			: [];
		if (!loads.length && !unloads.length) return;

		const pairs = Math.max(loads.length, unloads.length, 1);
		sp.loadingPoints = Array.from({ length: pairs }, (_, k) => loads[k] ?? '');
		sp.unloadingPoints = Array.from({ length: pairs }, (_, k) => unloads[k] ?? '');
		sp.loadingPics = Array.from({ length: pairs }, (_, k) => sp.loadingPics[k] ?? null);
		sp.unloadingPics = Array.from({ length: pairs }, (_, k) => sp.unloadingPics[k] ?? null);
		// Every shipment needs a row to enter its items against.
		for (let n = 1; n <= pairs; n++) {
			if (!sp.items.some((it) => (it.shipmentNo || 1) === n)) sp.items.push(newItem(n));
		}
		sp.items = sp.items.filter((it) => (it.shipmentNo || 1) <= pairs);
		// Each point proposes its warehouse's own PIC, as choosing one by
		// hand would.
		for (let k = 0; k < pairs; k++) {
			if (sp.loadingPoints[k])
				onPointChosen(wizard.shipments.indexOf(sp), 'loadingPoints', k, sp.loadingPoints[k]);
			if (sp.unloadingPoints[k])
				onPointChosen(wizard.shipments.indexOf(sp), 'unloadingPoints', k, sp.unloadingPoints[k]);
		}
	}

	/** A contract covering several customers brings the others with it: one
	 *  card each, filled from the contract, their customer and agreement
	 *  fixed because the contract is what decided them. */
	function rebuildCustomerCards(atIndex: number, agreement: any, detail: any) {
		const extras: any[] = Array.isArray(detail.multiCustomers) ? detail.multiCustomers : [];
		// Cards built from a previous choice go, whatever the new one is.
		wizard.shipments = wizard.shipments.filter((s, i) => i <= atIndex || !s.fromAgreementCustomer);
		if (!extras.length) return;

		const built = extras.map((c) => {
			const card = newShipment();
			card.customerNama = c.customerName ?? '';
			card.agreementId = agreement.id;
			card.agreementLabel = `${agreement.agreementNumber} — ${detail.kotaAsal} - ${detail.kotaTujuan}`;
			card.agreementType = agreement.agreementType ?? detail.agreementType ?? '';
			card.agreementTruckTypes = Array.isArray(detail.truckTypeMatrix) ? detail.truckTypeMatrix : [];
			// Fixed: the contract decided who this is and under what terms.
			card.fromAgreementCustomer = true;
			applyAgreementPoints(card, c);
			return card;
		});
		wizard.shipments.splice(atIndex + 1, 0, ...built);
	}

	/* ---------- Shipments: one pair of points each ----------
	   A shipment is a pair — Shipment k+1 is loadingPoints[k] with
	   unloadingPoints[k] — so the two lists are only ever changed together.
	   Adding or removing one side alone would silently repair the wrong
	   drop-off to the wrong pick-up. */
	function addShipment(i: number) {
		const sp = wizard.shipments[i];
		if (!allowsManyShipments(sp)) return;
		sp.loadingPoints.push('');
		sp.unloadingPoints.push('');
		sp.loadingPics.push(null);
		sp.unloadingPics.push(null);
		// A new shipment starts with one empty item row, the way the first does.
		sp.items.push(newItem(sp.loadingPoints.length));
	}

	function removeShipment(i: number, k: number) {
		const sp = wizard.shipments[i];
		if (shipmentCount(sp) <= 1) return;
		sp.loadingPoints.splice(k, 1);
		sp.unloadingPoints.splice(k, 1);
		sp.loadingPics.splice(k, 1);
		sp.unloadingPics.splice(k, 1);
		dropShipmentItems(sp, k + 1);
	}

	/** Remove a shipment's items and renumber the ones after it, so the
	 *  numbers stay 1..N with no gap and every remaining item still points at
	 *  the pair it was entered against. */
	function dropShipmentItems(sp: WizardShipment, shipmentNo: number) {
		sp.items = sp.items
			.filter((it) => (it.shipmentNo || 1) !== shipmentNo)
			.map((it) => ({
				...it,
				shipmentNo: (it.shipmentNo || 1) > shipmentNo ? it.shipmentNo - 1 : it.shipmentNo || 1
			}));
		if (!sp.items.length) sp.items = [newItem(1)];
	}

	function keepOnlyFirstShipment(sp: WizardShipment) {
		if (shipmentCount(sp) <= 1) return;
		sp.loadingPoints = sp.loadingPoints.slice(0, 1);
		sp.unloadingPoints = sp.unloadingPoints.slice(0, 1);
		sp.loadingPics = sp.loadingPics.slice(0, 1);
		sp.unloadingPics = sp.unloadingPics.slice(0, 1);
		sp.items = sp.items.filter((it) => (it.shipmentNo || 1) === 1);
		if (!sp.items.length) sp.items = [newItem(1)];
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
	/* ---------- PIC per point ----------
	   Picking a warehouse proposes its default PIC; the planner may switch to
	   another of the warehouse's PICs or add a new one, which is also saved to
	   the warehouse so the next order finds it. */
	type PicField = 'loadingPics' | 'unloadingPics';
	const picField = (field: 'loadingPoints' | 'unloadingPoints'): PicField =>
		field === 'loadingPoints' ? 'loadingPics' : 'unloadingPics';
	function warehouseOf(id: string): Warehouse | undefined {
		return warehouses.find((w) => w.id === id);
	}
	function onPointChosen(
		i: number,
		field: 'loadingPoints' | 'unloadingPoints',
		pointIndex: number,
		id: string
	) {
		const pics = wizard.shipments[i][picField(field)];
		while (pics.length <= pointIndex) pics.push(null);
		pics[pointIndex] = defaultPicOf(warehouseOf(id));
	}
	function picOptions(id: string): { value: string; label: string }[] {
		const w = warehouseOf(id);
		const list = (
			w?.pics?.length
				? w.pics
				: w?.picName
					? [{ id: 'legacy', name: w.picName, phone: w.picPhone ?? '' }]
					: []
		) as { id?: string; name: string; phone?: string }[];
		return list.map((p, k) => ({
			value: p.id ?? `#${k}`,
			label: `${p.name}${p.phone ? ` · ${p.phone}` : ''}`
		}));
	}
	function picValue(pic: PointPic | null, id: string): string {
		if (!pic) return '';
		const w = warehouseOf(id);
		const k = (w?.pics ?? []).findIndex(
			(p) => (pic.id && p.id === pic.id) || (p.name === pic.name && (p.phone ?? '') === pic.phone)
		);
		if (k >= 0) return w!.pics![k].id ?? `#${k}`;
		if (w?.picName === pic.name) return 'legacy';
		return '';
	}
	function onPicSelect(
		i: number,
		field: 'loadingPoints' | 'unloadingPoints',
		pointIndex: number,
		value: string
	) {
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
		pics[pointIndex] =
			k >= 0 ? { id: w!.pics![k].id, name: w!.pics![k].name, phone: w!.pics![k].phone ?? '' } : null;
	}

	let showPicModal = $state(false);
	let picTarget = $state<{
		index: number;
		field: 'loadingPoints' | 'unloadingPoints';
		pointIndex: number;
	} | null>(null);
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
				const existing = (w.pics ?? []).map((p) => ({
					id: p.id ?? '',
					name: p.name,
					phone: p.phone ?? '',
					isDefault: !!p.isDefault
				}));
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
				<input
					type="time"
					min={wizard.estimatedLoadDate === today ? nowTime : undefined}
					bind:value={wizard.estimatedLoadTime}
				/>
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
			<!-- A card is one CUSTOMER's shipments, which only shows when there
			     is more than one of them: a contract covering several brings a
			     card per customer, and two blocks both headed "Data Shipment"
			     read as the same customer twice. With a single customer the
			     old heading is the honest one — numbering one of anything
			     invites the reader to look for the second. -->
			<span class="shipment-block-title">
				{#if wizard.shipments.length > 1}
					Customer {i + 1}
				{:else}
					Data Shipment
				{/if}
			</span>
			<div class="shipment-block-actions">
				<span class="shipment-block-chevron" class:open={sp.expanded}><ChevronDown size={16} /></span>
			</div>
		</div>
		<div class="shipment-block-body" hidden={!sp.expanded}>
			<div class="two-col">
				<div class="field">
					<label>Customer <span class="req">*</span></label>
					<!-- A card the contract brought with it states its customer
					     rather than offering a choice: the contract decided it,
					     and changing it here would describe a customer the
					     contract does not cover. -->
					{#if sp.fromAgreementCustomer}
						<input type="text" readonly value={sp.customerNama} />
					{:else}
						<FieldSelect
							bind:value={sp.customerNama}
							options={customerOptions}
							placeholder="Pilih customer"
							onchange={() => onCustomerChange(i)}
						/>
					{/if}
				</div>
				<div class="field">
					<label>Agreement <span class="req">*</span></label>
					{#if sp.fromAgreementCustomer}
						<input type="text" readonly value={sp.agreementLabel} />
					{:else}
						<button
							type="button"
							class="btn btn-outline agreement-select-btn"
							disabled={!sp.customerNama}
							title={sp.agreementLabel || (!sp.customerNama ? 'Pilih customer terlebih dahulu' : '')}
							onclick={() => openAgreementPicker(i)}
						>
							<span class="agreement-select-btn-label">{sp.agreementLabel || 'Select Agreement'}</span>
						</button>
					{/if}
				</div>
			</div>

			<!-- One block per shipment: its own pair of points, so a planner
			     reads Shipment 2 as one journey rather than picking the second
			     entry out of two separate lists. -->
			{#each { length: shipmentCount(sp) } as _pair, k (k)}
				<div class="shipment-pair">
					<div class="shipment-pair-head">
						<span class="shipment-pair-title">Shipment {k + 1}</span>
						{#if shipmentCount(sp) > 1}
							<button type="button" class="shipment-pair-remove" onclick={() => removeShipment(i, k)}
								>Hapus</button
							>
						{/if}
					</div>

					<div class="two-col">
						<div class="field">
							<label>Loading Point <span class="req">*</span></label>
							<div class="multi-point-search-row">
								<div class="multi-point-field">
									<WarehouseSearchField
										bind:value={sp.loadingPoints[k]}
										warehouses={warehousesFor(sp, sp.loadingPoints[k])}
										placeholder="Cari alamat atau nama warehouse..."
										disabled={!sp.agreementId}
										onchange={(id) => onPointChosen(i, 'loadingPoints', k, id)}
									/>
									{#if sp.loadingPoints[k]}
										<div class="point-pic">
											<span class="point-pic-label">PIC Loading Point</span>
											<select
												class="point-pic-select"
												value={picValue(sp.loadingPics[k] ?? null, sp.loadingPoints[k])}
												onchange={(e) =>
													onPicSelect(i, 'loadingPoints', k, (e.currentTarget as HTMLSelectElement).value)}
											>
												<option value="">— pilih PIC —</option>
												{#each picOptions(sp.loadingPoints[k]) as o (o.value)}
													<option value={o.value}>{o.label}</option>
												{/each}
												<option value="__new__">+ PIC baru…</option>
											</select>
										</div>
									{:else}
										<!-- The row stands whether or not a point is chosen, so the
										     card keeps its shape and the planner can see that a PIC
										     is asked for. It fills once the point names a warehouse,
										     since the people on it are that warehouse's own. -->
										<div class="point-pic">
											<span class="point-pic-label">PIC Loading Point</span>
											<select class="point-pic-select" disabled>
												<option>Pilih PIC (opsional)</option>
											</select>
										</div>
									{/if}
								</div>
								<button
									type="button"
									class="mini-icon-btn"
									disabled={!sp.agreementId}
									title={!sp.agreementId ? 'Pilih agreement terlebih dahulu' : 'Daftarkan warehouse baru'}
									onclick={() => openCreateWarehouse(i, 'loadingPoints', k)}
									><span class="icon-wrap"><Pencil size={16} /></span></button
								>
							</div>
						</div>

						<div class="field">
							<label>Unloading Point <span class="req">*</span></label>
							<div class="multi-point-search-row">
								<div class="multi-point-field">
									<WarehouseSearchField
										bind:value={sp.unloadingPoints[k]}
										warehouses={warehousesFor(sp, sp.unloadingPoints[k])}
										placeholder="Cari alamat atau nama warehouse..."
										disabled={!sp.agreementId}
										onchange={(id) => onPointChosen(i, 'unloadingPoints', k, id)}
									/>
									{#if sp.unloadingPoints[k]}
										<div class="point-pic">
											<span class="point-pic-label">PIC Unloading Point</span>
											<select
												class="point-pic-select"
												value={picValue(sp.unloadingPics[k] ?? null, sp.unloadingPoints[k])}
												onchange={(e) =>
													onPicSelect(i, 'unloadingPoints', k, (e.currentTarget as HTMLSelectElement).value)}
											>
												<option value="">— pilih PIC —</option>
												{#each picOptions(sp.unloadingPoints[k]) as o (o.value)}
													<option value={o.value}>{o.label}</option>
												{/each}
												<option value="__new__">+ PIC baru…</option>
											</select>
										</div>
									{:else}
										<!-- The row stands whether or not a point is chosen, so the
										     card keeps its shape and the planner can see that a PIC
										     is asked for. It fills once the point names a warehouse,
										     since the people on it are that warehouse's own. -->
										<div class="point-pic">
											<span class="point-pic-label">PIC Unloading Point</span>
											<select class="point-pic-select" disabled>
												<option>Pilih PIC (opsional)</option>
											</select>
										</div>
									{/if}
								</div>
								<button
									type="button"
									class="mini-icon-btn"
									disabled={!sp.agreementId}
									title={!sp.agreementId ? 'Pilih agreement terlebih dahulu' : 'Daftarkan warehouse baru'}
									onclick={() => openCreateWarehouse(i, 'unloadingPoints', k)}
									><span class="icon-wrap"><Pencil size={16} /></span></button
								>
							</div>
						</div>
					</div>
				</div>
			{/each}

			<!-- Only a multi-shipment agreement allows a second shipment, so
			     the button is absent under a single-shipment contract rather
			     than offering something the order would be refused for. -->
			{#if !sp.agreementId || allowsManyShipments(sp)}
				<button
					type="button"
					class="btn btn-outline btn-sm add-shipment-btn"
					disabled={!sp.agreementId}
					title={!sp.agreementId
						? 'Pilih agreement terlebih dahulu'
						: 'Tambah satu pasang titik muat dan bongkar'}
					onclick={() => addShipment(i)}>+ Tambah Shipment</button
				>
			{/if}

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
		<Field label="Nama PIC" id="np-name" required
			><Input id="np-name" bind:value={picForm.name} placeholder="cth. Budi" /></Field
		>
		<Field label="Nomor WhatsApp" id="np-phone"
			><Input id="np-phone" bind:value={picForm.phone} placeholder="08xx…" /></Field
		>
		<Field label="" id="np-save" wide>
			<label class="np-check"
				><input type="checkbox" bind:checked={picForm.saveToWarehouse} /> Simpan ke daftar PIC warehouse ini</label
			>
		</Field>
	</FormGrid>
	{#if picError}<p class="np-error">{picError}</p>{/if}
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showPicModal = false)}>Batal</button>
		<Button onclick={saveNewPic} loading={picSaving}>Pakai PIC ini</Button>
	{/snippet}
</Modal>

<style>
	/* A shipment is a pair of points, so its two fields sit in one block with
	   the shipment's own name on it. Separated by a rule rather than a card,
	   because these are parts of one order, not a list of things. */
	.shipment-pair + .shipment-pair {
		margin-top: 18px;
		padding-top: 18px;
		border-top: 1px solid var(--outline-variant, #e6e8ee);
	}
	.shipment-pair-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}
	.shipment-pair-title {
		font-size: 14px;
		font-weight: 700;
		color: var(--on-surface, #1b1c1e);
	}
	.shipment-pair-remove {
		border: 0;
		background: none;
		padding: 0;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		color: var(--error, #b3261e);
		cursor: pointer;
	}
	.shipment-pair-remove:hover {
		text-decoration: underline;
	}
	.add-shipment-btn {
		margin-top: 16px;
	}

	/* The PIC control sits inside the point's own column, so its edges line
	   up with the search field above it instead of running under the two icon
	   buttons. Pill and padding come from .field select; the chevron is drawn
	   here because a native select's arrow does not follow the radius. */
	/* The point's controls are taller than the icon buttons now, so the row
	   aligns to the top and the buttons drop to the search field's own line. */
	.multi-point-search-row {
		align-items: flex-start;
	}
	.multi-point-search-row > button {
		margin-top: 6px;
	}
	.point-pic {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 8px;
	}
	.point-pic-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--on-surface-variant, #6b7280);
		white-space: nowrap;
	}
	.point-pic-select {
		flex: 1;
		min-width: 0;
		padding: 9px 34px 9px 16px;
		border: 1px solid var(--outline, #d5d9e2);
		border-radius: 999px;
		font: inherit;
		font-size: 13px;
		color: var(--on-surface, #1b1c1e);
		background: var(--surface, #fff);
		appearance: none;
		background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 12px center;
		background-size: 15px;
		transition:
			border-color 0.15s,
			box-shadow 0.15s;
	}
	.point-pic-select:focus {
		border-color: var(--primary, #0b57d0);
		box-shadow: 0 0 0 3px rgba(11, 87, 208, 0.14);
		outline: none;
	}
	/* Nothing chosen yet reads as a placeholder, not as a value. */
	.point-pic-select:invalid,
	.point-pic-select option[value=''] {
		color: var(--on-surface-variant, #6b7280);
	}
	@media (max-width: 720px) {
		.point-pic {
			align-items: stretch;
			flex-direction: column;
			gap: 4px;
		}
	}
	.np-check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.np-error {
		color: var(--danger, #b91c1c);
		font-size: 12px;
		margin-top: 8px;
	}
</style>
