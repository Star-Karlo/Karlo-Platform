<script lang="ts">
	/**
	 * A Karlo-staff directory of companies on one side of the market.
	 *
	 * Shippers and transporters are the SAME table — a company's `role` is which
	 * side it trades on — so this is one screen parameterised by role rather
	 * than two that would drift apart the moment either gained a column.
	 *
	 * Staff only, and read from the company directory itself rather than
	 * derived from `/users`. The derived version could only show companies that
	 * had a member, so an unclaimed placeholder — the exact thing a transporter
	 * creates before its client signs in — was invisible on the screen meant to
	 * list it.
	 */
	import { onMount } from 'svelte';
	import { Building2 } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatDate } from '$lib/utils/format';
	import {
		Button,
		Card,
		DataTable,
		Field,
		Input,
		Modal,
		PageHeader,
		Select,
		Spinner,
		type Column
	} from '$lib/components/ui';
	import { shipperActions, shipperStore } from '$lib/stores/shippers';

	let {
		role,
		title
	}: {
		/** 'shipper' or 'transporter' — which side of the market to list. */
		role: string;
		title: string;
	} = $props();

	interface Row {
		id: string;
		name: string;
		abbreviation?: string;
		role?: string;
		entityType?: string;
		npwp?: string;
		nib?: string;
		createdAt?: string;
	}

	let rows = $state<Row[]>([]);
	let loading = $state(true);
	let error = $state('');
	let search = $state('');
	let showForm = $state(false);
	let notice = $state('');

	let form = $state({
		name: '',
		abbreviation: '',
		entityType: 'company',
		npwp: '',
		nib: '',
		address: '',
		phone: ''
	});

	const ENTITY_TYPES = [
		{ value: 'company', label: 'Perusahaan (has NIB)' },
		{ value: 'personal', label: 'Perorangan (NPWP only)' }
	];

	function openCreate() {
		form = { name: '', abbreviation: '', entityType: 'company', npwp: '', nib: '', address: '', phone: '' };
		notice = '';
		showForm = true;
	}

	async function save() {
		const payload: Record<string, unknown> = { name: form.name, entityType: form.entityType };
		// Empty strings are not sent. NPWP and NIB are DEDUPLICATION keys, and
		// "" would match every other company that has none — folding unrelated
		// businesses into one.
		for (const key of ['abbreviation', 'npwp', 'nib', 'address', 'phone'] as const) {
			if (form[key].trim()) payload[key] = form[key].trim();
		}

		const result = await shipperActions.create(payload);
		if (result.ok) {
			showForm = false;
			notice = result.message;
			await load();
		}
	}

	onMount(() => void load());

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await api.get(ENDPOINTS.adminCompanies, { role, pageSize: 500 });
			rows = (res.data?.data ?? []).map((c: any) => ({
				id: c.id,
				name: c.name ?? '—',
				abbreviation: c.abbreviation,
				role: c.role,
				entityType: c.entityType,
				npwp: c.npwp,
				nib: c.nib,
				createdAt: c.createdAt
			}));
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load this directory.';
			rows = [];
		} finally {
			loading = false;
		}
	}

	let filtered = $derived(
		rows.filter((r) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return `${r.name} ${r.abbreviation ?? ''} ${r.npwp ?? ''} ${r.nib ?? ''}`
				.toLowerCase()
				.includes(q);
		})
	);

	const columns: Column[] = [
		{ key: 'name', label: 'Company' },
		{ key: 'abbreviation', label: 'Code', format: (r) => r.abbreviation ?? '-' },
		{
			key: 'entityType',
			label: 'Tipe',
			format: (r) => (r.entityType === 'personal' ? 'Perorangan' : 'Perusahaan')
		},
		{ key: 'npwp', label: 'NPWP', format: (r) => r.npwp ?? '-' },
		{ key: 'nib', label: 'NIB', format: (r) => r.nib ?? '-' },
		{ key: 'createdAt', label: 'Registered', format: (r) => formatDate(r.createdAt) }
	];
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Building2} subtitle="{rows.length} companies">
		{#snippet actions()}
			<Button onclick={openCreate}>+ Add {role === 'shipper' ? 'Shipper' : 'Transporter'}</Button>
		{/snippet}
	</PageHeader>

	{#if notice}
		<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>
	{/if}

	{#if error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	<Card {title} header="accent" padded={false}>
		<div class="border-b border-line-card px-5 py-4">
			<label for="dir-search" class="form-label">Search by</label>
			<Input id="dir-search" bind:value={search} placeholder="Company name, code or NPWP…" />
		</div>

		{#if loading}
			<div class="flex justify-center py-12"><Spinner /></div>
		{:else}
			<DataTable
				{columns}
				data={filtered}
				totalRows={filtered.length}
				pageSize={filtered.length || 1}
				emptyMessage="No companies on this side of the market"
			/>
		{/if}
	</Card>

	<p class="text-xs text-muted">
		Every company on this side of the market, including placeholders a transporter created
		that nobody has claimed yet.
	</p>
</div>

<Modal
	open={showForm}
	title="Add {role === 'shipper' ? 'Shipper' : 'Transporter'}"
	onClose={() => (showForm = false)}
>
	<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
		<Field id="d-name" label="Nama Perusahaan" required>
			<Input id="d-name" bind:value={form.name} placeholder="cth. PT Sumber Makmur Sejahtera" />
		</Field>
		<Field
			id="d-abbr"
			label="Kode Singkatan"
			help="Dipakai pada No. Agreement (cth. AGR-SKI-SMS-000001). Dibuat otomatis bila dikosongkan."
		>
			<Input id="d-abbr" bind:value={form.abbreviation} placeholder="cth. SMS" />
		</Field>

		<Field id="d-type" label="Tipe">
			<Select id="d-type" bind:value={form.entityType} options={ENTITY_TYPES} placeholder="Pilih tipe" />
		</Field>
		<Field id="d-phone" label="Telepon">
			<Input id="d-phone" bind:value={form.phone} placeholder="cth. 081234567890" />
		</Field>

		<Field id="d-npwp" label="Nomor NPWP">
			<Input id="d-npwp" bind:value={form.npwp} placeholder="cth. 01.234.567.8-901.000" />
		</Field>
		<Field
			id="d-nib"
			label="Nomor NIB"
			help={form.entityType === 'personal' ? 'Perorangan tidak memiliki NIB.' : ''}
		>
			<Input
				id="d-nib"
				bind:value={form.nib}
				placeholder="cth. 1234567890123"
				disabled={form.entityType === 'personal'}
			/>
		</Field>

		<Field id="d-address" label="Alamat" wide>
			<Input id="d-address" bind:value={form.address} placeholder="cth. Jl. Sudirman No.10, Jakarta" />
		</Field>

		<!-- Said plainly, because it changes what "Add" means: this may LINK to
		     a company that already exists rather than create a second one. -->
		<p class="text-xs leading-relaxed text-muted md:col-span-2">
			NPWP dan NIB dipakai untuk mencocokkan perusahaan yang sudah terdaftar. Bila perusahaan
			ini sudah ada, sistem menautkan ke perusahaan yang sama — bukan membuat duplikat.
		</p>

		{#if $shipperStore.error}
			<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger md:col-span-2" role="alert">
				{$shipperStore.error}
			</p>
		{/if}

		<div class="flex justify-end gap-2 border-t border-line-card pt-5 md:col-span-2">
			<Button variant="ghost" onclick={() => (showForm = false)}>Batal</Button>
			<Button onclick={save} loading={$shipperStore.saving} disabled={!form.name.trim()}>
				Simpan
			</Button>
		</div>
	</div>
</Modal>
