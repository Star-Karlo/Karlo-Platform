<script lang="ts">
	/**
	 * The transporter's clients.
	 *
	 * These are COMPANIES, not master-data rows and not user accounts. A client
	 * can be recorded here and never sign in — that is the placeholder a
	 * transporter creates so it can order on the client's behalf, and which the
	 * client later claims through a link, inheriting the history already
	 * attached to it.
	 *
	 * Deduplication happens on the server against the NORMALISED NPWP and NIB,
	 * so the same business recorded by two transporters resolves to ONE company
	 * that both link to. The form says so, because "linked to an existing
	 * company" is a different outcome from "created" and the user should know
	 * which they got.
	 */
	import { onMount } from 'svelte';
	import { Users, Link2, Copy } from 'lucide-svelte';
	import { INDUSTRY_SECTOR_OPTIONS } from '$lib/constants/industry';
	import { shipperStore, shipperActions, type Shipper } from '$lib/stores/shippers';
	import { can } from '$lib/stores/auth';
	import { formatDate } from '$lib/utils/format';
	import {
		Button,
		Card,
		DataTable,
		Input,
		Modal,
		PageHeader,
		Select,
		StatusBadge,
		type Column
	} from '$lib/components/ui';

	let { title = 'Master Data — Customer List' }: { title?: string } = $props();

	let search = $state('');
	let showForm = $state(false);
	let notice = $state('');
	let claimFor = $state<Shipper | null>(null);

	let mayCreate = $derived($can('collaboration.inviteMember'));

	let form = $state({
		name: '',
		abbreviation: '',
		entityType: 'company',
		npwp: '',
		nib: '',
		address: '',
		phone: '',
		picName: '',
		industrySector: ''
	});

	const ENTITY_TYPES = [
		{ value: 'company', label: 'Perusahaan (has NIB)' },
		{ value: 'personal', label: 'Perorangan (NPWP only)' }
	];

	onMount(() => void shipperActions.list());

	let clients = $derived(
		$shipperStore.shippers.filter((c) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return `${c.name} ${c.abbreviation ?? ''} ${c.npwp ?? ''} ${c.nib ?? ''}`.toLowerCase().includes(q);
		})
	);

	const columns: Column[] = [
		{ key: 'name', label: 'Nama Perusahaan' },
		{ key: 'abbreviation', label: 'Kode', format: (r) => r.abbreviation ?? '-' },
		{
			key: 'entityType',
			label: 'Tipe',
			format: (r) => (r.entityType === 'personal' ? 'Perorangan' : 'Perusahaan')
		},
		{ key: 'picName', label: 'Nama PIC', format: (r: any) => r.profile?.picName ?? '-' },
		{ key: 'industrySector', label: 'Sektor Industri', format: (r: any) => r.profile?.industrySector ?? '-' },
		{ key: 'npwp', label: 'NPWP', format: (r) => r.npwp ?? '-' },
		{ key: 'nib', label: 'NIB', format: (r) => r.nib ?? '-' },
		{ key: '__claim', label: '', align: 'right' }
	];

	function openCreate() {
		form = {
			name: '',
			abbreviation: '',
			entityType: 'company',
			npwp: '',
			nib: '',
			address: '',
			phone: '',
			picName: '',
			industrySector: ''
		};
		notice = '';
		showForm = true;
	}

	async function save() {
		const payload: Record<string, unknown> = { name: form.name, entityType: form.entityType };
		// Only what was filled in. An empty NPWP must not be sent: it is a
		// deduplication key, and "" would match every other client that has
		// none, folding unrelated businesses into one company.
		for (const key of [
			'abbreviation',
			'npwp',
			'nib',
			'address',
			'phone',
			'picName',
			'industrySector'
		] as const) {
			if (form[key].trim()) payload[key] = form[key].trim();
		}

		const result = await shipperActions.create(payload);
		if (result.ok) {
			showForm = false;
			notice = result.message;
			await shipperActions.list();
		}
	}

	async function issueClaim(client: Shipper) {
		claimFor = client;
		await shipperActions.issueClaimLink(client.id);
	}
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={Users}
		subtitle="Clients you order on behalf of. A client need not have an account."
	>
		{#snippet actions()}
			{#if mayCreate}
				<Button onclick={openCreate}>+ Tambah Customer</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if notice}
		<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>
	{/if}
	{#if $shipperStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$shipperStore.error}
		</p>
	{/if}

	<Card title="Customer List" header="accent" padded={false}>
		<div class="border-b border-line-card px-5 py-4">
			<label for="client-search" class="form-label">Search by</label>
			<Input id="client-search" bind:value={search} placeholder="Cari nama, kode, NPWP atau NIB…" />
		</div>

		<DataTable
			{columns}
			data={clients}
			loading={$shipperStore.loading}
			totalRows={clients.length}
			pageSize={clients.length || 1}
			emptyMessage="No clients recorded yet"
		>
			{#snippet cell(row: Shipper, column: Column, text: string)}
				{#if column.key === '__claim'}
					{#if mayCreate}
						<button
							type="button"
							class="flex items-center gap-1 text-xs text-cyan hover:underline"
							onclick={() => issueClaim(row)}
						>
							<Link2 size={12} /> Undang ke Karlo
						</button>
					{/if}
				{:else if column.key === 'entityType'}
					<StatusBadge statusCode={row.entityType === 'personal' ? 'draft' : 'active'} label={text} />
				{:else}
					{text}
				{/if}
			{/snippet}
		</DataTable>
	</Card>
</div>

<Modal open={showForm} title="Tambah Customer" onClose={() => (showForm = false)}>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<label for="c-name" class="form-label">
				Nama Perusahaan <span class="req">*</span>
			</label>
			<Input id="c-name" bind:value={form.name} placeholder="cth. PT Sumber Makmur Sejahtera" />
		</div>
		<div>
			<label for="c-abbr" class="form-label">Kode Singkatan Perusahaan</label>
			<Input id="c-abbr" bind:value={form.abbreviation} placeholder="cth. SMS" />
		</div>

		<div>
			<label for="c-pic" class="form-label">Nama PIC</label>
			<Input id="c-pic" bind:value={form.picName} placeholder="cth. Budi Santoso" />
		</div>
		<div>
			<label for="c-sector" class="form-label">Sektor Industri</label>
			<Select
				id="c-sector"
				bind:value={form.industrySector}
				options={INDUSTRY_SECTOR_OPTIONS}
				placeholder="Pilih sektor industri"
			/>
		</div>

		<div>
			<label for="c-type" class="form-label">Tipe</label>
			<Select id="c-type" bind:value={form.entityType} options={ENTITY_TYPES} placeholder="Pilih tipe" />
		</div>
		<div>
			<label for="c-phone" class="form-label">Telepon</label>
			<Input id="c-phone" bind:value={form.phone} placeholder="cth. 081234567890" />
		</div>

		<div>
			<label for="c-npwp" class="form-label">Nomor NPWP</label>
			<Input id="c-npwp" bind:value={form.npwp} placeholder="cth. 01.234.567.8-901.000" />
		</div>
		<div>
			<label for="c-nib" class="form-label">Nomor NIB</label>
			<Input
				id="c-nib"
				bind:value={form.nib}
				placeholder="cth. 1234567890123"
				disabled={form.entityType === 'personal'}
			/>
			{#if form.entityType === 'personal'}
				<p class="mt-1 text-xs text-muted">Perorangan tidak memiliki NIB.</p>
			{/if}
		</div>

		<div class="md:col-span-2">
			<label for="c-address" class="form-label">Alamat</label>
			<Input id="c-address" bind:value={form.address} placeholder="cth. Jl. Sudirman No.10, Jakarta" />
		</div>

		{#if $shipperStore.error}
			<p class="md:col-span-2 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
				{$shipperStore.error}
			</p>
		{/if}

		<div class="md:col-span-2 flex justify-end gap-2">
			<Button variant="ghost" onclick={() => (showForm = false)}>Batal</Button>
			<Button onclick={save} loading={$shipperStore.saving} disabled={!form.name.trim()}>Simpan</Button>
		</div>
	</div>
</Modal>

<Modal
	open={!!claimFor}
	title="Undang customer ke Karlo"
	onClose={() => {
		claimFor = null;
		shipperActions.clearClaimLink();
	}}
>
	<p class="text-xs text-ink">
		Kirim tautan ini ke <span class="font-medium">{claimFor?.name}</span>. Dengan membukanya mereka membuat
		akun Karlo untuk perusahaannya sendiri — dan langsung melihat agreement serta order yang sudah Anda catat
		untuk mereka.
	</p>
	{#if $shipperStore.claimLink}
		<div class="mt-3 flex items-center gap-2">
			<Input value={$shipperStore.claimLink} readonly class="font-mono" />
			<Button variant="outline" onclick={() => navigator.clipboard?.writeText($shipperStore.claimLink)}>
				<Copy size={14} /> Copy
			</Button>
		</div>
		<!-- Shown once and never again: only the hash is stored, because a link
		     that could be fetched back would be a credential sitting in the
		     database — and this one transfers ownership of a whole company. -->
		<p class="mt-2 text-xs text-muted">
			Salin sekarang. Tautan hanya ditampilkan sekali dan tidak bisa diambil kembali — buat yang baru bila
			hilang.
		</p>
	{:else if $shipperStore.saving}
		<p class="mt-3 text-xs text-muted">Issuing…</p>
	{:else}
		<p class="mt-3 text-xs text-danger">{$shipperStore.error || 'No link was returned.'}</p>
	{/if}
</Modal>
