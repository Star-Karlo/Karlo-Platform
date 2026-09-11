<script lang="ts">
	/**
	 * Create an order.
	 *
	 * The form is built from the company's own field configuration rather than
	 * hardcoded. That is the one thing that varies between companies — the flow
	 * itself does not — and it is read from the same server-side answer the
	 * create endpoint validates against, so this form cannot produce a
	 * submission the service refuses for a field reason.
	 *
	 * Two configurations drove the design and both land here as ordinary field
	 * settings: whether an order names a cargo category or itemises every
	 * component, and whether it carries an expiry.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ClipboardList, ArrowLeft, Plus, Trash2 } from 'lucide-svelte';
	import { orderActions } from '$lib/stores/orders';
	import { agreementStore, agreementActions } from '$lib/stores/agreements';
	import { warehouseStore, warehouseActions } from '$lib/stores/warehouses';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import { asOptions, catalog, loadCatalogs } from '$lib/stores/catalog';
	import { fieldConfigActions, isEnabled, isRequired } from '$lib/stores/fieldconfig';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import type { FieldConfig } from '$lib/stores/fieldconfig';
	import {
		Button,
		Field,
		FormGrid,
		Input,
		PageHeader,
		Select,
		Spinner,
		Stepper
	} from '$lib/components/ui';
	import { formatCurrency } from '$lib/utils/format';

	let { basePath, title = 'Create Order' }: { basePath: string; title?: string } = $props();

	let fields = $state<FieldConfig[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	/**
	 * The three steps the console uses. Agreement and shipment first, then the
	 * cargo, then a read-back before submitting.
	 *
	 * The split is not cosmetic: step 2 shows the price INHERITED from the
	 * agreement chosen in step 1, so it has nothing to show until that choice
	 * is made. That is also why the rail refuses to jump forward.
	 */
	const STEPS = ['Input Agreement & Detail Shipment', 'Input Detail Item', 'Review & Submit Your Order'];
	let step = $state(0);

	let form = $state({
		customerId: '',
		agreementId: '',
		originWarehouseId: '',
		destinationWarehouseId: '',
		pickupAt: '',
		expiresAt: '',
		cargoTypeId: '',
		quantity: '',
		weightKg: '',
		volumeM3: '',
		referenceNumber: '',
		notes: ''
	});

	interface ItemRow {
		name: string;
		catalogItemId: string;
		quantity: string;
		unit: string;
		packaging: string;
		weightKg: string;
		lengthCm: string;
		widthCm: string;
		heightCm: string;
		handlingNotes: string;
	}

	function blankItem(): ItemRow {
		return {
			name: '', catalogItemId: '', quantity: '', unit: '', packaging: '',
			weightKg: '', lengthCm: '', widthCm: '', heightCm: '', handlingNotes: ''
		};
	}

	let items = $state<ItemRow[]>([blankItem()]);

	/** Whether this company itemises cargo down to components. */
	let itemised = $derived(isEnabled(fields, 'items'));

	/** Roll-ups over the item table, shown live as the lines are typed. */
	let totalTonnage = $derived(
		items.reduce((sum, i) => sum + (Number(i.weightKg) || 0) * (Number(i.quantity) || 1), 0)
	);
	let totalVolume = $derived(
		items.reduce((sum, i) => {
			const l = Number(i.lengthCm), w = Number(i.widthCm), h = Number(i.heightCm);
			if (!l || !w || !h) return sum;
			return sum + ((l * w * h) / 1_000_000) * (Number(i.quantity) || 1);
		}, 0)
	);
	let itemsShipped = $derived(items.filter((i) => i.name.trim() !== '').length);

	/** The agreement chosen in step 1, for the read-only price block in step 2. */
	let chosenAgreement = $derived(
		($agreementStore.agreements as any[]).find((a) => a.id === form.agreementId) ?? null
	);

	/**
	 * What step 1 must have before step 2 means anything.
	 *
	 * Only the fields this company actually requires — the same configuration
	 * the server validates against, so the Next button and the submit cannot
	 * disagree about what is missing.
	 */
	let step1Complete = $derived(
		!!form.originWarehouseId &&
			!!form.destinationWarehouseId &&
			(!req('customerId') || !!form.customerId) &&
			(!req('agreementId') || !!form.agreementId) &&
			(!req('pickupAt') || !!form.pickupAt) &&
			(!req('expiresAt') || !!form.expiresAt)
	);

	let step2Complete = $derived(!itemised || itemsShipped > 0);

	const UNITS = ['Kg', 'Pcs', 'Zak', 'Pallet', 'Unit', 'Karton'].map((v) => ({ value: v, label: v }));
	const PACKAGING = ['Karton', 'Pallet', 'Curah', 'Drum', 'Karung', 'Tanpa Kemasan'].map((v) => ({
		value: v,
		label: v
	}));

	/**
	 * Volume, shown live as the dimensions are typed.
	 *
	 * Display only — the server derives and stores its own from the same
	 * dimensions, so this is never sent. A submitted volume could disagree with
	 * the measurements beside it, and nobody would find the disagreement.
	 */
	function volumeOf(item: ItemRow): string {
		const l = Number(item.lengthCm), w = Number(item.widthCm), h = Number(item.heightCm);
		if (!l || !w || !h) return '—';
		return `${((l * w * h) / 1_000_000).toFixed(4)} m³`;
	}

	onMount(async () => {
		fields = await fieldConfigActions.load('order');
		await Promise.all([
			loadCatalogs(['cargoType', 'itemType']),
			warehouseActions.getAll({ pageSize: 200 }),
			customerActions.getAll({ pageSize: 200 }),
			agreementActions.getAll({ page: 0, pageSize: 200 })
		]);
		loading = false;
	});

	let warehouseOptions = $derived(
		$warehouseStore.warehouses.map((w) => ({ value: w.id, label: w.name ?? w.id }))
	);
	let customerOptions = $derived(
		($customerStore.customers ?? []).map((c: any) => ({ value: c.id, label: c.name ?? c.id }))
	);
	/** Only agreements that can still be ordered against. */
	let agreementOptions = $derived(
		$agreementStore.agreements
			.filter((a: any) => a.statusCode === 'active')
			.map((a: any) => ({ value: a.id, label: a.agreementNumber ?? a.id }))
	);

	/**
	 * Build the payload from what is ENABLED, not from what the state holds.
	 *
	 * A field the company has switched off must not be sent even if something
	 * left a value in it: the service refuses a hidden field carrying a value
	 * rather than ignoring it, and it is right to — silently dropping it would
	 * look identical to saving it from here.
	 */
	function payload() {
		const body: Record<string, unknown> = {
			originWarehouseId: form.originWarehouseId,
			destinationWarehouseId: form.destinationWarehouseId,
			submit: true
		};

		const put = (key: string, value: unknown) => {
			if (isEnabled(fields, key) && value !== '' && value !== undefined) body[key] = value;
		};

		put('customerId', form.customerId);
		put('agreementId', form.agreementId);
		put('cargoTypeId', form.cargoTypeId);
		put('referenceNumber', form.referenceNumber);
		put('quantity', form.quantity ? Number(form.quantity) : '');
		put('weightKg', form.weightKg ? Number(form.weightKg) : '');
		put('volumeM3', form.volumeM3 ? Number(form.volumeM3) : '');
		put('pickupAt', form.pickupAt ? new Date(form.pickupAt).toISOString() : '');
		put('expiresAt', form.expiresAt ? new Date(form.expiresAt).toISOString() : '');

		if (isEnabled(fields, 'notes') && form.notes) body.detail = { note: form.notes };

		if (itemised) {
			const lines = items.filter((i) => i.name.trim() !== '');
			if (lines.length > 0) {
				body.items = lines.map((i) => ({
					name: i.name,
					catalogItemId: i.catalogItemId || undefined,
					quantity: i.quantity ? Number(i.quantity) : undefined,
					unit: i.unit || undefined,
					packaging: i.packaging || undefined,
					weightKg: i.weightKg ? Number(i.weightKg) : undefined,
					lengthCm: i.lengthCm ? Number(i.lengthCm) : undefined,
					widthCm: i.widthCm ? Number(i.widthCm) : undefined,
					heightCm: i.heightCm ? Number(i.heightCm) : undefined,
					handlingNotes: i.handlingNotes || undefined
				}));
			}
		}

		return body;
	}

	async function submit(event: Event) {
		event.preventDefault();

		// Enter in any input fires submit. Without this guard, pressing it on
		// step 1 would post an order the user has not finished describing —
		// and the server would either refuse it confusingly or accept it.
		if (step !== STEPS.length - 1) return;

		error = '';
		saving = true;
		try {
			const res = await orderActions.create(payload() as any);
			goto(`${basePath}/order/${res?.data?.id ?? ''}`);
		} catch (e: any) {
			// The service reports every field problem at once, so a nine-field
			// form is not a nine-round trip.
			error = e?.response?.data?.message ?? 'Could not create this order.';
		} finally {
			saving = false;
		}
	}

	/** Resolve a warehouse id to its name, for the read-back in step 3. */
	function warehouseName(id: string): string {
		return warehouseOptions.find((o) => o.value === id)?.label ?? '—';
	}

	/** The asterisk, driven by configuration rather than written into the markup. */
	function req(key: string): boolean {
		return isRequired(fields, key);
	}
</script>

<PageHeader {title} icon={ClipboardList}>
	{#snippet actions()}
		<Button variant="ghost" href="{basePath}/order"><ArrowLeft size={14} /> Kembali</Button>
	{/snippet}
</PageHeader>

{#if $authStore.user?.isPlatformStaff && !$actingFor.companyId}
	<!-- Staff who forget to pick a client would file this under Karlo's own
	     company, which ships nothing. Said before the form rather than after
	     the save, when it is a record to unpick. -->
	<div class="note-banner" role="status">
		<span>⚠️</span>
		<div>
			You are acting as <b>Karlo</b>, not a client. This order would be recorded against Karlo's
			own company. Choose a client in the bar above to record it on their behalf.
		</div>
	</div>
{:else if $actingFor.companyId}
	<div class="note-banner" role="status">
		<span>🏢</span>
		<div>
			Recording this order for <b>{$actingFor.companyName}</b>. Their form configuration decides
			which fields are required below.
		</div>
	</div>
{/if}

{#if error}
	<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{error}</div></div>
{/if}

{#if loading}
	<div class="flex justify-center py-16"><Spinner size={32} /></div>
{:else}
	<div class="wizard-layout" style="margin-top:16px;">
		<Stepper steps={STEPS} current={step} onStepClick={(i) => (step = i)} />

		<form onsubmit={submit}>
			{#if step === 0}
				<div class="card card-pad">
					<div class="section-title" style="margin-top:0;"><h2>Agreement</h2></div>
					<FormGrid>
						{#if isEnabled(fields, 'customerId')}
							<Field label="Customer" id="customerId" required={req('customerId')}>
								<Select
									id="customerId"
									bind:value={form.customerId}
									options={customerOptions}
									placeholder="Pilih customer"
								/>
							</Field>
						{/if}
						{#if isEnabled(fields, 'agreementId')}
							<Field label="Agreement" id="agreementId" required={req('agreementId')}>
								<Select
									id="agreementId"
									bind:value={form.agreementId}
									options={agreementOptions}
									placeholder="Pilih agreement"
								/>
							</Field>
						{/if}
					</FormGrid>

					<div class="section-title"><h2>Detail Shipment</h2></div>
					<FormGrid>
						<!-- Loading and unloading points are never configurable: an order
						     without them cannot be dispatched, and there is nowhere to
						     send anybody. -->
						<Field label="Loading Point" id="origin" required>
							<Select
								id="origin"
								bind:value={form.originWarehouseId}
								options={warehouseOptions}
								placeholder="Pilih warehouse muat"
							/>
						</Field>
						<Field label="Unloading Point" id="destination" required>
							<Select
								id="destination"
								bind:value={form.destinationWarehouseId}
								options={warehouseOptions}
								placeholder="Pilih warehouse bongkar"
							/>
						</Field>

						{#if isEnabled(fields, 'pickupAt')}
							<Field
								label="Estimated Load Schedule"
								id="pickupAt"
								required={req('pickupAt')}
							>
								<Input id="pickupAt" type="datetime-local" bind:value={form.pickupAt} />
							</Field>
						{/if}
						{#if isEnabled(fields, 'expiresAt')}
							<Field
								label="Order Expiration Date"
								id="expiresAt"
								required={req('expiresAt')}
								help="When the order must be actioned by — before the truck is due, not after."
							>
								<Input id="expiresAt" type="datetime-local" bind:value={form.expiresAt} />
							</Field>
						{/if}
					</FormGrid>

					<div class="section-title"><h2>Muatan</h2></div>
					<FormGrid cols={3}>
						{#if isEnabled(fields, 'cargoTypeId')}
							<Field label="Cargo Type" id="cargoTypeId" required={req('cargoTypeId')}>
								<Select
									id="cargoTypeId"
									bind:value={form.cargoTypeId}
									options={asOptions($catalog.cargoType)}
									placeholder="Pilih cargo type"
								/>
							</Field>
						{/if}
						{#if isEnabled(fields, 'quantity')}
							<Field label="Quantity" id="quantity" required={req('quantity')}>
								<Input id="quantity" type="number" bind:value={form.quantity} />
							</Field>
						{/if}
						{#if isEnabled(fields, 'weightKg')}
							<Field label="Total Tonnage (Kg)" id="weightKg" required={req('weightKg')}>
								<Input id="weightKg" type="number" bind:value={form.weightKg} />
							</Field>
						{/if}
					</FormGrid>
				</div>

				<div class="wizard-nav-row">
					<Button variant="ghost" href="{basePath}/order">Batal</Button>
					<div style="display:flex; align-items:center; gap:12px;">
						{#if !step1Complete}
							<span class="hint">Lengkapi field wajib di atas untuk melanjutkan.</span>
						{/if}
						<Button onclick={() => (step = 1)} disabled={!step1Complete}>Selanjutnya</Button>
					</div>
				</div>
			{/if}

			{#if step === 1}
				<!-- The price block, read-only and inherited from the agreement. The
				     planner cannot re-price here: the agreement is the source of truth,
				     and every commercial variance belongs on the invoice where both
				     sides reconcile it. -->
				<div class="card card-pad">
					<div class="section-title" style="margin-top:0;"><h2>Harga</h2></div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Agreement</b></div>
						<div class="detail-row-value">{chosenAgreement?.agreementNumber ?? '—'}</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Base Price</b></div>
						<div class="detail-row-value">
							{chosenAgreement?.rates?.[0]?.price
								? formatCurrency(Number(chosenAgreement.rates[0].price))
								: '—'}
						</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Cargo Type</b></div>
						<div class="detail-row-value">{form.cargoTypeId || '—'}</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Transporter</b></div>
						<div class="detail-row-value">{$authStore.user?.companyName ?? '—'}</div>
					</div>
				</div>

				{#if itemised}
					<div class="card card-pad" style="margin-top:16px;">
						<div class="section-title" style="margin-top:0;"><h2>Detail Item</h2></div>
						<p class="hint" style="margin-bottom:14px;">
							Volume dihitung otomatis dari dimensi, tidak diketik.
						</p>

						{#each items as item, i}
							<div class="lane-card">
								<div class="lane-card-head">
									<span>Item {i + 1}</span>
									{#if items.length > 1}
										<button
											type="button"
											class="mini-icon-btn-del"
											aria-label="Hapus item {i + 1}"
											onclick={() => (items = items.filter((_, n) => n !== i))}
										>
											<Trash2 size={14} />
										</button>
									{/if}
								</div>

								<FormGrid>
									<Field label="Nama Item" id="iname-{i}" required>
										<Input id="iname-{i}" bind:value={item.name} placeholder="cth. Roll Kain" />
									</Field>
									<Field label="Handling Notes" id="ihn-{i}">
										<Input id="ihn-{i}" bind:value={item.handlingNotes} />
									</Field>
								</FormGrid>

								<FormGrid cols={3}>
									<Field label="Quantity" id="iqty-{i}">
										<Input id="iqty-{i}" type="number" bind:value={item.quantity} />
									</Field>
									<Field label="Unit" id="iunit-{i}">
										<Select id="iunit-{i}" bind:value={item.unit} options={UNITS} placeholder="Kg" />
									</Field>
									<Field label="Packaging" id="ipack-{i}">
										<Select id="ipack-{i}" bind:value={item.packaging} options={PACKAGING} placeholder="Karton" />
									</Field>
								</FormGrid>

								<FormGrid cols={3}>
									<Field label="Berat (kg)" id="iw-{i}">
										<Input id="iw-{i}" type="number" bind:value={item.weightKg} />
									</Field>
									<Field label="Panjang (cm)" id="il-{i}">
										<Input id="il-{i}" type="number" bind:value={item.lengthCm} />
									</Field>
									<Field label="Lebar (cm)" id="iwd-{i}">
										<Input id="iwd-{i}" type="number" bind:value={item.widthCm} />
									</Field>
								</FormGrid>

								<FormGrid>
									<Field label="Tinggi (cm)" id="ih-{i}" class="!mb-0">
										<Input id="ih-{i}" type="number" bind:value={item.heightCm} />
									</Field>
									<div class="field" style="margin-bottom:0; display:flex; align-items:flex-end;">
										<p class="hint" style="margin:0 0 12px;">Volume: <b>{volumeOf(item)}</b> m³</p>
									</div>
								</FormGrid>
							</div>
						{/each}

						<button
							type="button"
							class="btn btn-outline btn-sm"
							onclick={() => (items = [...items, blankItem()])}
						>
							<Plus size={14} /> Tambah Item
						</button>

						<!-- Roll-ups, computed rather than typed. A total the user enters can
						     disagree with the lines above it, and nobody finds the
						     disagreement until the truck is loaded. -->
						<div class="review-value-row">
							<span>Total Tonnage (Kg)</span><b>{totalTonnage.toLocaleString('id-ID')}</b>
						</div>
						<div class="review-value-row">
							<span>Total Volume (m³)</span><b>{totalVolume.toFixed(3)}</b>
						</div>
						<div class="review-value-row">
							<span>Items Shipped</span><b>{itemsShipped}</b>
						</div>
					</div>
				{/if}

				{#if isEnabled(fields, 'referenceNumber') || isEnabled(fields, 'notes')}
					<div class="card card-pad" style="margin-top:16px;">
						<div class="section-title" style="margin-top:0;"><h2>Referensi</h2></div>
						{#if isEnabled(fields, 'referenceNumber')}
							<Field label="Customer Reference" id="referenceNumber" required={req('referenceNumber')}>
								<Input id="referenceNumber" bind:value={form.referenceNumber} />
							</Field>
						{/if}
						{#if isEnabled(fields, 'notes')}
							<Field label="Notes" id="notes" required={req('notes')} class="!mb-0">
								<textarea id="notes" bind:value={form.notes} rows="4"></textarea>
							</Field>
						{/if}
					</div>
				{/if}

				<div class="wizard-nav-row">
					<Button variant="outline" onclick={() => (step = 0)}>← Kembali</Button>
					<Button onclick={() => (step = 2)} disabled={!step2Complete}>Selanjutnya</Button>
				</div>
			{/if}

			{#if step === 2}
				<div class="card card-pad">
					<div class="section-title" style="margin-top:0;"><h2>Ringkasan Order</h2></div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Estimated Load Schedule</b></div>
						<div class="detail-row-value">{form.pickupAt || '—'}</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Order Expiration Date</b></div>
						<div class="detail-row-value">{form.expiresAt || '—'}</div>
					</div>
				</div>

				<div class="card card-pad" style="margin-top:16px;">
					<div class="section-title" style="margin-top:0;"><h2>Shipment 1</h2></div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Agreement</b></div>
						<div class="detail-row-value">{chosenAgreement?.agreementNumber ?? '—'}</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Base Price</b></div>
						<div class="detail-row-value">
							{chosenAgreement?.rates?.[0]?.price
								? formatCurrency(Number(chosenAgreement.rates[0].price))
								: '—'}
						</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Loading</b></div>
						<div class="detail-row-value">{warehouseName(form.originWarehouseId)}</div>
					</div>
					<div class="detail-row">
						<div class="detail-row-label"><b>Unloading</b></div>
						<div class="detail-row-value">{warehouseName(form.destinationWarehouseId)}</div>
					</div>

					{#if itemised && itemsShipped > 0}
						<div class="table-wrap" style="margin-top:18px;">
							<table>
								<thead>
									<tr>
										<th>Item</th><th>Qty</th><th>Berat (kg)</th><th>Volume (m³)</th>
									</tr>
								</thead>
								<tbody>
									{#each items.filter((i) => i.name.trim()) as item}
										<tr>
											<td>{item.name}</td>
											<td>{item.quantity || '0'}</td>
											<td>{item.weightKg || '0'}</td>
											<td>{volumeOf(item)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>

						<div class="review-value-row">
							<span>Total Tonnage (Kg)</span><b>{totalTonnage.toLocaleString('id-ID')}</b>
						</div>
						<div class="review-value-row">
							<span>Total Volume (m³)</span><b>{totalVolume.toFixed(3)}</b>
						</div>
						<div class="review-value-row review-value-row-total">
							<span>Items Shipped</span><b>{itemsShipped}</b>
						</div>
					{/if}
				</div>

				<div class="wizard-nav-row">
					<Button variant="outline" onclick={() => (step = 1)}>← Kembali</Button>
					<Button type="submit" loading={saving}>Submit Order</Button>
				</div>
			{/if}
		</form>
	</div>
{/if}
