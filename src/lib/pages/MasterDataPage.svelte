<script lang="ts">
	/**
	 * One reference list, with add, edit and remove.
	 *
	 * A single page for all ten catalogues rather than ten near-identical
	 * screens: they differ only in which fields they carry, and CATALOGS
	 * describes that. Ten copies would drift the moment one gained a column.
	 *
	 * Two things it makes visible that the API models but a table would hide:
	 * an entry is either Karlo's or the company's own, and only the owner may
	 * change it.
	 */
	import { onMount } from 'svelte';
	import { Pencil, Trash2, Plus, Search } from 'lucide-svelte';
	import {
		masterDataStore,
		masterDataActions,
		CATALOGS,
		SHAREABLE,
		companyOptions,
		loadCompanyOptions,
		type CatalogEntry,
		type FieldDef
	} from '$lib/stores/masterdata';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { can, access } from '$lib/stores/auth';
	import { authStore } from '$lib/stores/auth';
	import { formatDate } from '$lib/utils/format';
	import { Button, Field, Input, Modal, Select } from '$lib/components/ui';

	let { kind }: { kind: string } = $props();

	let spec = $derived(CATALOGS[kind]);

	/** Which field identifies an entry on this list. */
	let identityKey = $derived(spec?.nameKey ?? 'name');
	let identityLabel = $derived(
		identityKey === 'name' ? 'Name' : identityKey.charAt(0).toUpperCase() + identityKey.slice(1)
	);
	let identityPlaceholder = $derived(
		identityKey === 'vendor' ? 'cth. Teltonika' : identityKey === 'code' ? 'cth. FUEL' : 'cth. General Cargo'
	);
	let search = $state('');
	let editing = $state<CatalogEntry | null>(null);
	let showForm = $state(false);
	let form = $state<Record<string, any>>({});
	let confirmingDelete = $state<CatalogEntry | null>(null);

	/** Reference pickers, loaded only for the catalogues that need one. */
	let refOptions = $state<Record<string, { value: string; label: string }[]>>({});

	/**
	 * Who the entry belongs to, chosen only by staff.
	 *
	 * Empty means SHARED — owned by nobody, visible to every company. An
	 * ordinary user never sees this: the server writes their own company
	 * regardless, and offering a choice that is ignored would be a lie.
	 */
	let owner = $state('');
	let shareable = $derived(SHAREABLE[kind] !== false);

	let myCompanyId = $derived($authStore.user?.companyId ?? '');
	let isPlatformStaff = $derived($authStore.user?.isPlatformStaff ?? false);

	let mayCreate = $derived($can('masterData.create'));
	let mayUpdate = $derived($can('masterData.update'));
	let mayDelete = $derived($can('masterData.delete'));

	/**
	 * Whether this caller may change a given entry.
	 *
	 * Mirrors the server's rule so the UI does not offer an action that will be
	 * refused: Karlo staff may edit anything, a company only its own. The
	 * server enforces it regardless — this just avoids dead buttons.
	 */
	function mayEdit(entry: CatalogEntry): boolean {
		if (isPlatformStaff) return true;
		return !!entry.companyId && entry.companyId === myCompanyId;
	}

	/** Read-only catalogues have no writer on the server. */
	let writable = $derived(kind !== 'trackerModel' && kind !== 'sensorType');

	onMount(() => {
		void load();
		void loadRefs();
		if (isPlatformStaff) void loadCompanyOptions();
		return () => masterDataActions.reset();
	});

	// Re-load when the route changes between catalogues.
	$effect(() => {
		if (kind) {
			void load();
			void loadRefs();
		}
	});

	async function load(page = 0) {
		await masterDataActions.list(kind, page, search);
	}

	/** Fetch the lists this catalogue's reference fields point at. */
	async function loadRefs() {
		for (const field of spec?.fields ?? []) {
			// A dependent picker is loaded when its parent is chosen, not now:
			// without a parent there is nothing sensible to narrow it to.
			if (!field.ref || field.dependsOn || refOptions[field.ref]) continue;
			await fetchRef(field.ref);
		}
	}

	async function fetchRef(kind: string, parentId?: string) {
		try {
			const res = await api.get(ENDPOINTS.catalog.list(kind), {
				pageSize: 200,
				parentId: parentId || undefined
			});
			refOptions[kind] = (res.data?.data ?? []).map((e: CatalogEntry) => ({
				value: e.id,
				label: e.name
			}));
		} catch {
			// A picker that cannot load leaves the field empty rather than
			// blocking the whole form.
			refOptions[kind] = [];
		}
	}

	/**
	 * Reload a dependent picker when its parent changes, and clear the choice
	 * that no longer belongs to it.
	 *
	 * Without the clear, changing the category would leave a sub-category from
	 * the old one selected — a pairing that looks deliberate and is wrong.
	 */
	/** The human name of the field a dependent picker narrows on. */
	function parentLabel(field: FieldDef): string {
		const parent = (spec?.fields ?? []).find((f) => f.key === field.dependsOn);
		return (parent?.label ?? 'parent').toLowerCase();
	}

	async function onParentChanged(field: FieldDef) {
		const dependants = (spec?.fields ?? []).filter((f) => f.dependsOn === field.key);
		for (const dependant of dependants) {
			form[dependant.key] = '';
			if (dependant.ref) await fetchRef(dependant.ref, form[field.key]);
		}
	}

	/**
	 * A form seeded with an empty string for EVERY field this catalogue
	 * declares, not just the identity.
	 *
	 * Input and Select declare `value = $bindable('')`, and Svelte refuses
	 * `bind:value={undefined}` against a fallback: binding a key the object
	 * does not have throws `props_invalid_value`, which aborts the render and
	 * takes the whole modal with it. That is why Brand — the one catalogue
	 * with no extra fields — was the only one whose Add dialog opened.
	 */
	function blankForm(): Record<string, any> {
		return {
			[identityKey]: '',
			code: '',
			description: '',
			...Object.fromEntries((spec?.fields ?? []).map((f: FieldDef) => [f.key, '']))
		};
	}

	function openCreate() {
		editing = null;
		form = blankForm();
		// Shared where the list allows it; otherwise the staff member must
		// name a company, because the entry belongs to one by definition.
		owner = shareable ? '' : ($companyOptions[0]?.value ?? '');
		showForm = true;
	}

	function openEdit(entry: CatalogEntry) {
		editing = entry;
		// Seeded first, then overlaid: an entry saved before a field existed
		// carries no value for it, and binding that undefined would throw the
		// same way a blank create form did.
		form = {
			...blankForm(),
			[identityKey]: (entry as any)[identityKey] ?? entry.name ?? '',
			code: entry.code ?? '',
			description: entry.description ?? '',
			...Object.fromEntries(
				Object.entries(entry.attributes ?? {}).filter(([, v]) => v !== null && v !== undefined)
			)
		};
		showForm = true;
	}

	async function save() {
		// Empty strings are dropped rather than sent. Sending one would clear a
		// field the user never touched, and for an optional field the
		// difference between "" and absent is the difference between blanking
		// it and leaving it alone.
		const payload: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(form)) {
			if (value === '' || value === null || value === undefined) continue;
			const field = spec?.fields.find((f) => f.key === key);
			payload[key] = field?.type === 'number' ? Number(value) : value;
		}

		// Ownership is only ever sent on CREATE, and only by staff. Moving an
		// entry between companies is not an edit — everything already
		// referencing it would change hands silently — so the server ignores
		// it on update and this does not offer it.
		if (!editing && isPlatformStaff) payload.companyId = owner;

		const ok = editing
			? await masterDataActions.update(kind, editing.id, payload)
			: await masterDataActions.create(kind, payload);

		if (ok) {
			showForm = false;
			await load($masterDataStore.page);
		}
	}

	async function remove() {
		if (!confirmingDelete) return;
		if (await masterDataActions.remove(kind, confirmingDelete.id)) {
			confirmingDelete = null;
			await load($masterDataStore.page);
		}
	}

	/**
	 * The columns this catalogue shows, beyond the identity and the owner.
	 *
	 * Reference fields are left out: they hold an id, and an id in a table is
	 * noise. Long text is left out because it does not fit on a row.
	 */
	let extraColumns = $derived(
		(spec?.fields ?? []).filter((f: FieldDef) => f.type !== 'textarea' && !f.ref)
	);

	function cellValue(row: CatalogEntry, key: string): string {
		const v = row.attributes?.[key] ?? (row as any)[key];
		return v === undefined || v === null || v === '' ? '—' : String(v);
	}

	function identityOf(row: CatalogEntry): string {
		return String(
			(row as any)[identityKey] ?? row.attributes?.[identityKey] ?? row.name ?? '-'
		);
	}

	let rows = $derived($masterDataStore.entries ?? []);
	let firstRowNumber = $derived(($masterDataStore.page ?? 0) * ($masterDataStore.pageSize ?? 20) + 1);
	let lastPage = $derived(
		Math.max(0, Math.ceil(($masterDataStore.total ?? 0) / ($masterDataStore.pageSize ?? 20)) - 1)
	);
	let showActions = $derived(writable && (mayUpdate || mayDelete));
</script>

<div class="page-head">
	<div>
		<h1>Master Data — {spec?.label ?? kind}</h1>
	</div>
	{#if spec && writable && mayCreate}
		<button type="button" class="btn btn-primary" onclick={openCreate}>
			<Plus size={15} /> Tambah {spec.label}
		</button>
	{/if}
</div>

{#if !spec}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">🗂️</div>
			There is no <b>{kind}</b> reference list. It existed in the previous data model and does
			not in this one.
		</div>
	</div>
{:else}
	{#if $masterDataStore.error}
		<div class="note-banner note-banner-error" role="alert">
			<span>⛔</span><div>{$masterDataStore.error}</div>
		</div>
	{/if}

	<div class="order-toolbar">
		<div class="order-tabs-row" style="align-items:center; gap:10px; padding-bottom:10px;">
			<div style="max-width:280px; flex:1;">
				<Input bind:value={search} placeholder="Cari nama…" />
			</div>
			<button type="button" class="btn btn-outline btn-sm" onclick={() => load(0)}>
				<Search size={14} /> Cari
			</button>
			{#if search}
				<button
					type="button"
					class="btn btn-text btn-sm"
					onclick={() => {
						search = '';
						load(0);
					}}
				>
					Bersihkan
				</button>
			{/if}
		</div>
		<div class="order-toolbar-actions">
			<span class="hint">{$masterDataStore.total ?? 0} entri</span>
		</div>
	</div>

	{#if $masterDataStore.loading}
		<div class="card card-pad"><div class="empty">Memuat…</div></div>
	{:else if rows.length === 0}
		<div class="card card-pad">
			<div class="empty">
				<div class="eic">🗂️</div>
				{search ? 'Tidak ada entri yang cocok dengan pencarian.' : 'Belum ada entri pada daftar ini.'}
				{#if !search && writable && mayCreate}
					<br />
					<button type="button" class="btn btn-primary" style="margin-top:14px;" onclick={openCreate}>
						+ Tambah {spec.label}
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="scroll-table">
				<thead>
					<tr>
						<th>No</th>
						<th>{identityLabel}</th>
						<th>Pemilik</th>
						{#each extraColumns as f (f.key)}
							<th>{f.label}</th>
						{/each}
						<th>Diperbarui</th>
						{#if showActions}<th class="sticky-col-aksi">Aksi</th>{/if}
					</tr>
				</thead>
				<tbody>
					{#each rows as row, i (row.id)}
						<tr>
							<td>{firstRowNumber + i}</td>
							<td><b>{identityOf(row)}</b></td>
							<td>
								<!-- Karlo's entries are shared with every company and only
								     Karlo may change them. The badge is the whole rule. -->
								{#if row.companyId}
									<span class="badge badge-planner">Perusahaan Anda</span>
								{:else}
									<span class="badge badge-self">Karlo — dibagikan</span>
								{/if}
							</td>
							{#each extraColumns as f (f.key)}
								<td>{cellValue(row, f.key)}</td>
							{/each}
							<td>{formatDate(row.updatedAt)}</td>
							{#if showActions}
								<td class="sticky-col-aksi">
									{#if mayEdit(row)}
										<div class="action-cell">
											{#if mayUpdate}
												<button
													type="button"
													class="mini-icon-btn"
													title="Edit"
													aria-label="Edit {identityOf(row)}"
													onclick={() => openEdit(row)}
												>
													<Pencil size={14} />
												</button>
											{/if}
											{#if mayDelete}
												<button
													type="button"
													class="mini-icon-btn-del"
													title="Hapus"
													aria-label="Hapus {identityOf(row)}"
													onclick={() => (confirmingDelete = row)}
												>
													<Trash2 size={14} />
												</button>
											{/if}
										</div>
									{:else}
										<span class="hint">—</span>
									{/if}
								</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if lastPage > 0}
			<div class="table-footer-bar" style="display:flex; align-items:center; justify-content:center; gap:14px;">
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={($masterDataStore.page ?? 0) <= 0}
					onclick={() => load(($masterDataStore.page ?? 0) - 1)}
				>
					← Sebelumnya
				</button>
				<span>Halaman {($masterDataStore.page ?? 0) + 1} dari {lastPage + 1}</span>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={($masterDataStore.page ?? 0) >= lastPage}
					onclick={() => load(($masterDataStore.page ?? 0) + 1)}
				>
					Selanjutnya →
				</button>
			</div>
		{:else}
			<div class="table-footer-bar">Semua data sudah dimuat</div>
		{/if}
	{/if}
{/if}

<Modal
	open={showForm}
	size="lg"
	title={editing ? `Edit ${spec?.label}` : `Tambah ${spec?.label}`}
	onClose={() => (showForm = false)}
>
	<div class="two-col">
		<!-- The identifying field, which is not always called "name": a tracker
		     model is identified by its vendor, a sensor type by its code. -->
		<Field
			id="md-identity"
			label={identityLabel}
			required
			wide={(spec?.fields.length ?? 0) === 0}
		>
			<Input id="md-identity" bind:value={form[identityKey]} placeholder={identityPlaceholder} />
		</Field>

		{#each spec?.fields ?? [] as field (field.key)}
			<Field
				id="md-{field.key}"
				label={field.label}
				help={field.help ?? ''}
				wide={field.type === 'textarea'}
			>
				{#if field.ref}
					{@const opts = refOptions[field.ref] ?? []}
					{@const awaitingParent = !!field.dependsOn && !form[field.dependsOn]}
					{@const emptyList = !awaitingParent && opts.length === 0}
					<Select
						id="md-{field.key}"
						bind:value={form[field.key]}
						options={opts}
						placeholder={awaitingParent
							? `Pilih ${parentLabel(field)} dulu`
							: emptyList
								? 'Belum ada pilihan'
								: 'Pilih — opsional'}
						disabled={awaitingParent || emptyList}
						onchange={() => onParentChanged(field)}
					/>
					{#if emptyList}
						<!-- An empty dropdown with nothing but a placeholder reads
						     as broken. Saying WHY, and where to fix it, turns a
						     dead control into an instruction. -->
						<span class="hint">
							{#if field.dependsOn}
								Belum ada {CATALOGS[field.ref]?.label ?? field.label} di bawah
								{parentLabel(field)} yang dipilih — tambahkan lewat Master Data, atau
								biarkan kosong.
							{:else}
								Belum ada {CATALOGS[field.ref]?.label ?? field.label} — tambahkan lewat
								Master Data, atau biarkan kosong.
							{/if}
						</span>
					{/if}
				{:else if field.type === 'textarea'}
					<textarea id="md-{field.key}" bind:value={form[field.key]} rows="3"></textarea>
				{:else}
					<Input id="md-{field.key}" type={field.type ?? 'text'} bind:value={form[field.key]} />
				{/if}
			</Field>
		{/each}

		{#if !editing}
			{#if isPlatformStaff}
				<Field id="md-owner" label="Pemilik" required={!shareable} wide>
					<Select
						id="md-owner"
						bind:value={owner}
						options={shareable
							? [{ value: '', label: 'Dibagikan — semua perusahaan melihatnya' }, ...$companyOptions]
							: $companyOptions}
						placeholder={shareable ? 'Dibagikan — semua perusahaan melihatnya' : 'Pilih perusahaan'}
					/>
					<span class="hint">
						{#if !shareable}
							{CATALOGS[kind]?.label} selalu milik satu perusahaan, jadi entri ini butuh
							pemilik — tidak bisa dibagikan.
						{:else if owner === ''}
							Entri bersama dikelola Karlo dan muncul di semua perusahaan. Hanya Karlo
							yang bisa mengubahnya.
						{:else}
							Privat untuk perusahaan itu. Tidak ada pihak lain yang melihatnya.
						{/if}
					</span>
				</Field>
			{:else}
				<!-- Not offered, because it is not a choice: the server writes
				     this to the caller's own company from the token. Saying so
				     avoids the surprise of adding an entry and wondering why
				     nobody else can see it. -->
				<div class="field" style="grid-column:1 / -1;">
					<span class="hint">
						Entri ini akan privat untuk perusahaan Anda. Hanya rekan Anda yang melihatnya.
					</span>
				</div>
			{/if}
		{/if}
	</div>

	{#if $masterDataStore.error}
		<div class="note-banner note-banner-error" role="alert">
			<span>⛔</span><div>{$masterDataStore.error}</div>
		</div>
	{/if}

	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showForm = false)}>Batal</button>
		<Button onclick={save} loading={$masterDataStore.saving} disabled={!form[identityKey]}>
			Simpan
		</Button>
	{/snippet}
</Modal>

<Modal open={!!confirmingDelete} title="Hapus entri" onClose={() => (confirmingDelete = null)}>
	<p>
		Hapus <b>{confirmingDelete ? identityOf(confirmingDelete) : ''}</b>?
	</p>
	<p class="hint">
		Order dan agreement yang sudah memakainya tetap berfungsi — entri dipensiunkan, bukan
		dihapus permanen, dan namanya bisa dipakai lagi.
	</p>

	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (confirmingDelete = null)}>
			Batal
		</button>
		<Button variant="danger" onclick={remove} loading={$masterDataStore.saving}>Hapus</Button>
	{/snippet}
</Modal>
