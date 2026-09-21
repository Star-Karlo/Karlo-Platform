<script lang="ts">
	/**
	 * My Cargo — cargo types and the items under them, on one page.
	 *
	 * The old model had three lists (category, sub-category, item) that had
	 * to be maintained on three screens before an order could name what it
	 * carries. This is the simplification the review asked for: a cargo type
	 * on the left, its items on the right, every action here. Karlo's own
	 * cargo types appear for everyone; a company adds its own beside them
	 * and its items under either.
	 */
	import { onMount } from 'svelte';
	import { Boxes, Plus, Pencil, Trash2 } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		Button,
		DataTable,
		Field,
		FormGrid,
		Input,
		Modal,
		PageHeader,
		Select,
		StatusBadge,
		type Column
	} from '$lib/components/ui';
	import { formatNumber } from '$lib/utils/format';

	let { title = 'My Cargo' }: { title?: string } = $props();

	type Entry = {
		id: string;
		name: string;
		companyId?: string;
		attributes?: Record<string, any>;
		active?: boolean;
		isActive?: boolean;
		weightKg?: number;
		volumeM3?: number;
		unit?: string;
		description?: string;
	};

	let cargoTypes = $state<Entry[]>([]);
	let counts = $state<Record<string, number>>({});
	let selected = $state<Entry | null>(null);
	let items = $state<Entry[]>([]);
	let loadingTypes = $state(true);
	let loadingItems = $state(false);
	let error = $state('');

	async function loadTypes() {
		loadingTypes = true;
		try {
			const res = await api.get(ENDPOINTS.catalog.list('cargoType'), { pageSize: 200 });
			cargoTypes = res.data?.data ?? [];
			// One count per type, so the list reads like a taxonomy, not a menu.
			const all = await api.get(ENDPOINTS.catalog.list('item'), { pageSize: 500 });
			const c: Record<string, number> = {};
			for (const it of all.data?.data ?? []) {
				const k = it.cargoTypeId ?? '';
				c[k] = (c[k] ?? 0) + 1;
			}
			counts = c;
			if (!selected && cargoTypes.length) select(cargoTypes[0]);
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load cargo types.';
		} finally {
			loadingTypes = false;
		}
	}

	async function select(t: Entry) {
		selected = t;
		loadingItems = true;
		try {
			const res = await api.get(ENDPOINTS.catalog.list('item'), { parentId: t.id, pageSize: 200 });
			items = res.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load items.';
		} finally {
			loadingItems = false;
		}
	}

	onMount(loadTypes);

	// --- Cargo type form -----------------------------------------------------
	let showType = $state(false);
	let editingType = $state<Entry | null>(null);
	let typeName = $state('');
	let typeDesc = $state('');
	let saving = $state(false);

	function openType(t: Entry | null) {
		editingType = t;
		typeName = t?.name ?? '';
		typeDesc = t?.description ?? '';
		error = '';
		showType = true;
	}
	async function saveType() {
		if (!typeName.trim()) return;
		saving = true;
		try {
			const payload = { name: typeName.trim(), description: typeDesc || undefined };
			if (editingType) await api.put(ENDPOINTS.catalog.one('cargoType', editingType.id), payload);
			else await api.post(ENDPOINTS.catalog.create('cargoType'), payload);
			showType = false;
			selected = null;
			await loadTypes();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save the cargo type.';
		} finally {
			saving = false;
		}
	}

	// --- Item form ------------------------------------------------------------
	let showItem = $state(false);
	let editingItem = $state<Entry | null>(null);
	let confirming = $state<{ kind: 'cargoType' | 'item'; entry: Entry } | null>(null);
	const UNITS = ['pcs', 'box', 'karton', 'pallet', 'sak', 'drum', 'ton', 'kg', 'liter', 'm3'].map((u) => ({
		value: u,
		label: u
	}));
	const PACKAGING = ['Karton', 'Pallet', 'Sak', 'Drum', 'Curah', 'Peti', 'Bundle', 'Lainnya'].map((p) => ({
		value: p,
		label: p
	}));
	function blankItem() {
		return {
			name: '',
			weightKg: '',
			lengthCm: '',
			widthCm: '',
			heightCm: '',
			volumeM3: '',
			unit: '',
			packaging: '',
			description: ''
		};
	}
	let itemForm = $state(blankItem());

	function openItem(it: Entry | null) {
		editingItem = it;
		const a = it?.attributes ?? {};
		itemForm = it
			? {
					name: it.name ?? '',
					weightKg: it.weightKg != null ? String(it.weightKg) : '',
					lengthCm: a.lengthCm != null ? String(a.lengthCm) : '',
					widthCm: a.widthCm != null ? String(a.widthCm) : '',
					heightCm: a.heightCm != null ? String(a.heightCm) : '',
					volumeM3: it.volumeM3 != null ? String(it.volumeM3) : '',
					unit: it.unit ?? '',
					packaging: a.packaging ?? '',
					description: it.description ?? ''
				}
			: blankItem();
		error = '';
		showItem = true;
	}
	const num = (v: string) => (v === '' ? undefined : Number(v));
	async function saveItem() {
		if (!selected || !itemForm.name.trim()) return;
		saving = true;
		try {
			const l = num(itemForm.lengthCm),
				w = num(itemForm.widthCm),
				h = num(itemForm.heightCm);
			// Volume from the dimensions when they are given and the volume is not.
			const volume =
				num(itemForm.volumeM3) ?? (l && w && h ? +((l * w * h) / 1_000_000).toFixed(4) : undefined);
			const payload = {
				name: itemForm.name.trim(),
				cargoTypeId: selected.id,
				weightKg: num(itemForm.weightKg),
				volumeM3: volume,
				unit: itemForm.unit || undefined,
				description: itemForm.description || undefined,
				attributes: { lengthCm: l, widthCm: w, heightCm: h, packaging: itemForm.packaging || undefined }
			};
			if (editingItem) await api.put(ENDPOINTS.catalog.one('item', editingItem.id), payload);
			else await api.post(ENDPOINTS.catalog.create('item'), payload);
			showItem = false;
			await select(selected);
			counts = { ...counts, [selected.id]: items.length };
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save the item.';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!confirming) return;
		try {
			await api.delete(ENDPOINTS.catalog.one(confirming.kind, confirming.entry.id));
			const wasType = confirming.kind === 'cargoType';
			confirming = null;
			if (wasType) {
				selected = null;
				await loadTypes();
			} else if (selected) {
				await select(selected);
				counts = { ...counts, [selected.id]: items.length };
			}
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not delete.';
		}
	}

	const dims = (r: Entry) => {
		const a = r.attributes ?? {};
		return a.lengthCm && a.widthCm && a.heightCm ? `${a.lengthCm} × ${a.widthCm} × ${a.heightCm}` : '—';
	};
	const columns: Column[] = [
		{ key: 'no', label: 'No', width: '48px' },
		{ key: 'name', label: 'Item Name' },
		{
			key: 'weightKg',
			label: 'Weight (kg)',
			format: (r) => (r.weightKg != null ? formatNumber(r.weightKg) : '—')
		},
		{ key: 'dims', label: 'Dimensions P×L×T (cm)', format: dims },
		{ key: 'volumeM3', label: 'Volume (m³)', format: (r) => (r.volumeM3 != null ? String(r.volumeM3) : '—') },
		{ key: 'unit', label: 'Unit', format: (r) => r.unit ?? '—' },
		{ key: 'packaging', label: 'Packaging', format: (r) => r.attributes?.packaging ?? '—' },
		{ key: 'status', label: 'Status' },
		{ key: 'actions', label: '', align: 'right' }
	];
	const isGlobal = (e: Entry) => !e.companyId;
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={Boxes}
	/>

	{#if error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	<div class="cargo-layout">
		<aside class="cargo-types">
			<div class="cargo-types-head">Cargo Type</div>
			{#if loadingTypes}
				<p class="px-4 py-3 text-xs text-muted">Loading…</p>
			{:else}
				<ul>
					{#each cargoTypes as t (t.id)}
						<li>
							<button
								type="button"
								class="cargo-type-row"
								class:active={selected?.id === t.id}
								onclick={() => select(t)}
							>
								<span class="truncate">{t.name}</span>
								<span class="cargo-count">{counts[t.id] ?? 0}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<button type="button" class="cargo-type-add" onclick={() => openType(null)}
				><Plus size={14} /> Tambah Cargo Type</button
			>
		</aside>

		<section class="cargo-items">
			{#if selected}
				<header class="cargo-items-head">
					<div>
						<h2>{selected.name}</h2>
						<p>
							{items.length} item{items.length === 1 ? '' : 's'}{isGlobal(selected)
								? ' · shared by Karlo'
								: ''}
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if !isGlobal(selected)}
							<button
								type="button"
								class="frozen-icon-btn"
								title="Edit cargo type"
								onclick={() => openType(selected)}><Pencil size={14} /></button
							>
							<button
								type="button"
								class="frozen-icon-btn"
								title="Delete cargo type"
								onclick={() => (confirming = { kind: 'cargoType', entry: selected! })}
								><Trash2 size={14} /></button
							>
						{/if}
						<Button onclick={() => openItem(null)}><Plus size={14} /> Tambah Cargo Item</Button>
					</div>
				</header>
				<DataTable
					{columns}
					data={items.map((it, i) => ({ ...it, no: i + 1 }))}
					totalRows={items.length}
					loading={loadingItems}
					emptyMessage="No items under this cargo type yet"
					pageSize={200}
				>
					{#snippet cell(row: any, column: Column, text: string)}
						{#if column.key === 'status'}
							<StatusBadge
								statusCode={row.isActive === false || row.active === false ? 'inactive' : 'active'}
								label={row.isActive === false || row.active === false ? 'Inactive' : 'Active'}
							/>
						{:else if column.key === 'actions'}
							<div class="action-cell" style="justify-content:flex-end;">
								<button type="button" class="frozen-icon-btn" title="Edit" onclick={() => openItem(row)}
									><Pencil size={14} /></button
								>
								<button
									type="button"
									class="frozen-icon-btn"
									title="Delete"
									onclick={() => (confirming = { kind: 'item', entry: row })}><Trash2 size={14} /></button
								>
							</div>
						{:else}
							{text}
						{/if}
					{/snippet}
				</DataTable>
			{:else if !loadingTypes}
				<p class="px-5 py-8 text-sm text-muted">Pick a cargo type on the left, or add one.</p>
			{/if}
		</section>
	</div>
</div>

<Modal
	open={showType}
	title={editingType ? 'Edit Cargo Type' : 'Tambah Cargo Type'}
	onClose={() => (showType = false)}
>
	<FormGrid>
		<Field label="Name" id="ct-name" required wide
			><Input id="ct-name" bind:value={typeName} placeholder="cth. Besi & Baja" /></Field
		>
		<Field label="Description" id="ct-desc" wide><Input id="ct-desc" bind:value={typeDesc} /></Field>
	</FormGrid>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showType = false)}>Cancel</button>
		<Button onclick={saveType} loading={saving}>{editingType ? 'Save' : 'Add'}</Button>
	{/snippet}
</Modal>

<Modal
	open={showItem}
	size="lg"
	title={editingItem ? `Edit ${editingItem.name}` : `Tambah Item — ${selected?.name ?? ''}`}
	onClose={() => (showItem = false)}
>
	<FormGrid>
		<Field label="Item Name" id="it-name" required wide
			><Input id="it-name" bind:value={itemForm.name} placeholder="cth. Baja Ringan" /></Field
		>
		<Field label="Weight (kg)" id="it-w"
			><Input id="it-w" type="number" bind:value={itemForm.weightKg} /></Field
		>
		<Field label="Volume (m³)" id="it-v" help="Left empty, it is computed from the dimensions."
			><Input id="it-v" type="number" bind:value={itemForm.volumeM3} /></Field
		>
		<Field label="Length (cm)" id="it-l"
			><Input id="it-l" type="number" bind:value={itemForm.lengthCm} /></Field
		>
		<Field label="Width (cm)" id="it-wd"
			><Input id="it-wd" type="number" bind:value={itemForm.widthCm} /></Field
		>
		<Field label="Height (cm)" id="it-h"
			><Input id="it-h" type="number" bind:value={itemForm.heightCm} /></Field
		>
		<Field label="Unit" id="it-u"
			><Select id="it-u" bind:value={itemForm.unit} options={UNITS} placeholder="—" /></Field
		>
		<Field label="Packaging" id="it-p"
			><Select id="it-p" bind:value={itemForm.packaging} options={PACKAGING} placeholder="—" /></Field
		>
		<Field label="Notes" id="it-d" wide><Input id="it-d" bind:value={itemForm.description} /></Field>
	</FormGrid>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showItem = false)}>Cancel</button>
		<Button onclick={saveItem} loading={saving}>{editingItem ? 'Save' : 'Add Item'}</Button>
	{/snippet}
</Modal>

<Modal open={confirming !== null} size="sm" title="Delete" onClose={() => (confirming = null)}>
	<p class="text-sm">
		Delete <b>{confirming?.entry.name}</b>?{#if confirming?.kind === 'cargoType'}
			Items under it stay, without a cargo type.{/if}
	</p>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (confirming = null)}>Cancel</button>
		<Button variant="danger" onclick={remove}>Delete</Button>
	{/snippet}
</Modal>

<style>
	.cargo-layout {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: var(--gutter, 16px);
		align-items: start;
	}
	@media (max-width: 860px) {
		.cargo-layout {
			grid-template-columns: 1fr;
		}
	}
	.cargo-types {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
		overflow: hidden;
	}
	.cargo-types-head {
		padding: 12px 16px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--on-surface-variant, #6b7280);
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
	}
	.cargo-types ul {
		list-style: none;
		margin: 0;
		padding: 6px;
		display: grid;
		gap: 2px;
	}
	.cargo-type-row {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border: 0;
		background: transparent;
		border-radius: 8px;
		font-size: 13px;
		color: var(--on-surface, #111);
		cursor: pointer;
		text-align: left;
	}
	.cargo-type-row:hover {
		background: var(--surface-container, #f3f4f6);
	}
	.cargo-type-row.active {
		background: var(--primary-container, #e0ecff);
		color: var(--on-primary-container, #1e3a8a);
		font-weight: 600;
	}
	.cargo-count {
		font-size: 11px;
		color: var(--on-surface-variant, #6b7280);
		font-variant-numeric: tabular-nums;
	}
	.cargo-type-add {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 16px;
		border: 0;
		border-top: 1px solid var(--outline-variant, #e5e7eb);
		background: transparent;
		font-size: 13px;
		color: var(--primary, #2563eb);
		cursor: pointer;
	}
	.cargo-items {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
		overflow: hidden;
	}
	.cargo-items-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--outline-variant, #e5e7eb);
		flex-wrap: wrap;
	}
	.cargo-items-head h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.cargo-items-head p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--on-surface-variant, #6b7280);
	}
</style>
