<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Plus, Search, KeyRound, Users, Building2, Pencil } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { formatDate, getInitials } from '$lib/utils/format';
	import { Button, Field, FormGrid, Input, Modal, Select } from '$lib/components/ui';
	import { actingFor } from '$lib/stores/actingFor';
	import { entitlementActions } from '$lib/stores/iam';

	/**
	 * Karlo Clients — platform staff onboarding a company.
	 *
	 * One screen for the three things a new client needs before anyone there
	 * can do anything: the company itself, the features it has bought, and a
	 * first administrator who can then create the rest of their own users.
	 *
	 * Creation goes through /auth/register, the same path a self-signup takes,
	 * because it already does all of it in one transaction — company, admin,
	 * system role and the default feature grant — and a second implementation
	 * of "make a tenant" is how the two drift.
	 */
	let { basePath = '/a' }: { basePath?: string } = $props();

	interface Client {
		id: string;
		name: string;
		role: string;
		abbreviation?: string;
		isSuspended?: boolean;
		isVerified?: boolean;
		maxUsers?: number;
		createdAt?: string;
		/** Present once the company has been sold FMS: its bigint identity there. */
		fmsTenantId?: number;
		/** Which products the company actually holds, resolved server-side. */
		products?: string[];
		legalName?: string;
		npwp?: string;
		address?: string;
		city?: string;
		province?: string;
		postalCode?: string;
		country?: string;
		phone?: string;
		email?: string;
		website?: string;
	}

	let rows = $state<Client[]>([]);
	let totalRows = $state(0);
	let page = $state(0);
	let loading = $state(true);
	let error = $state('');
	let search = $state('');
	const pageSize = 20;

	const ROLES = [
		{ value: 'transporter', label: 'Transporter — carries goods' },
		{ value: 'shipper', label: 'Shipper — sends goods' }
	];

	onMount(() => void load());

	async function load(p = 0) {
		loading = true;
		error = '';
		try {
			const res = await api.get(ENDPOINTS.adminCompanies, {
				page: p,
				pageSize,
				search: search || undefined
			});
			rows = res.data?.data ?? [];
			totalRows = Number(res.data?.meta?.totalRows ?? 0);
			page = p;
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Klien tidak dapat dimuat.';
		} finally {
			loading = false;
		}
	}

	// --- Create --------------------------------------------------------------

	let showCreate = $state(false);
	let saving = $state(false);
	let createError = $state('');
	let created = $state<{ company: string; email: string; fmsNote?: string } | null>(null);

	function blank() {
		return {
			companyName: '',
			companyAbbreviation: '',
			role: 'transporter',
			fullName: '',
			email: '',
			password: '',
			confirm: '',
			/** TMS is what /auth/register grants by default; FMS is a second sale. */
			withFMS: false
		};
	}

	/**
	 * Everything sellable for FMS that is actually built. A new FMS customer
	 * gets the whole product; Karlo narrows it from Company Management if a
	 * deal says otherwise. Granting the first module is also what gives the
	 * company its FMS tenant id.
	 */
	async function fmsCatalogue(): Promise<string[]> {
		const res = await api.get(ENDPOINTS.entitlements.catalogue, { product: 'fms' });
		const rows: { name: string; roadmap?: boolean }[] = res.data?.data?.features ?? res.data?.data ?? [];
		return rows.filter((f) => !f.roadmap).map((f) => f.name);
	}
	let form = $state(blank());

	/**
	 * Suggested from the name as it is typed, until the person types their own.
	 * Agreement numbers embed this (AGR-KP-MAS-000101), so it wants to be short,
	 * memorable, and decided now rather than discovered missing at the first
	 * agreement.
	 */
	let abbrTouched = $state(false);
	$effect(() => {
		if (!abbrTouched) {
			form.companyAbbreviation = form.companyName
				.split(/\s+/)
				.filter((w) => w && !/^(pt|cv|tbk|persero)$/i.test(w))
				.map((w) => w[0])
				.join('')
				.toUpperCase()
				.slice(0, 4);
		}
	});

	function openCreate() {
		form = blank();
		abbrTouched = false;
		createError = '';
		created = null;
		showCreate = true;
	}

	async function create() {
		createError = '';
		if (!form.companyName.trim()) return (createError = 'Nama perusahaan wajib diisi.');
		if (!form.email.trim()) return (createError = 'Email administrator wajib diisi.');
		if (form.password.length < 12) return (createError = 'Password minimal 12 karakter.');
		if (form.password !== form.confirm) return (createError = 'Password tidak sama.');

		saving = true;
		try {
			const res = await api.post(ENDPOINTS.auth.register, {
				companyName: form.companyName.trim(),
				companyAbbreviation: form.companyAbbreviation.trim(),
				role: form.role,
				fullName: form.fullName.trim() || `${form.companyName.trim()} Admin`,
				email: form.email.trim(),
				password: form.password
			});
			let fmsNote = '';
			if (form.withFMS) {
				const companyId: string | undefined = res.data?.data?.companyId;
				if (companyId) {
					const ok = await entitlementActions.grant(companyId, await fmsCatalogue(), 'fms');
					fmsNote = ok
						? 'FMS is enabled with every built feature.'
						: 'The company was created but FMS could not be enabled — do it from Akses fitur.';
				}
			}
			// Shown rather than closed: the person creating this account has to
			// hand the password to somebody, and a dialog that vanishes on
			// success takes the reminder with it.
			created = { company: form.companyName.trim(), email: form.email.trim(), fmsNote };
			await load(0);
		} catch (e: any) {
			createError = e?.response?.data?.message ?? 'Klien tidak dapat dibuat.';
		} finally {
			saving = false;
		}
	}

	// --- Profile -------------------------------------------------------------

	let editing = $state<Client | null>(null);
	let profile = $state({ name: '', legalName: '', address: '', city: '', province: '', postalCode: '', country: 'ID', phone: '', email: '', website: '' });
	let profileError = $state('');
	let savingProfile = $state(false);

	function openProfile(c: Client) {
		editing = c;
		profileError = '';
		profile = {
			name: c.name ?? '', legalName: c.legalName ?? '', address: c.address ?? '',
			city: c.city ?? '', province: c.province ?? '', postalCode: c.postalCode ?? '',
			country: c.country ?? 'ID', phone: c.phone ?? '', email: c.email ?? '', website: c.website ?? ''
		};
	}

	async function saveProfile() {
		if (!editing) return;
		profileError = '';
		savingProfile = true;
		try {
			await api.put(ENDPOINTS.adminCompany(editing.id), profile);
			editing = null;
			await load(page);
		} catch (e: any) {
			profileError = e?.response?.data?.message ?? 'Profil tidak dapat disimpan.';
		} finally {
			savingProfile = false;
		}
	}

	/**
	 * User Management is scoped by who staff are acting for, not by a query
	 * string, so opening a client's people means becoming that client first.
	 */
	function openUsers(c: Client) {
		actingFor.set(c.id, c.name, c.role);
		goto(`${basePath}/users`);
	}

	let lastPage = $derived(Math.max(0, Math.ceil(totalRows / pageSize) - 1));
</script>

<div class="page-head">
	<div>
		<h1>Karlo Clients</h1>
		<p>Perusahaan yang memakai platform: buat perusahaan, beri akses fitur, dan buat admin pertamanya.</p>
	</div>
	<button type="button" class="btn btn-primary" onclick={openCreate}><Plus size={15} /> Tambah Klien</button>
</div>

{#if error}
	<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{error}</div></div>
{/if}

<div class="order-toolbar">
	<div class="order-tabs-row" style="align-items:center; gap:10px; padding-bottom:10px;">
		<div style="max-width:280px; flex:1;"><Input bind:value={search} placeholder="Cari nama perusahaan…" /></div>
		<button type="button" class="btn btn-outline btn-sm" onclick={() => load(0)}><Search size={14} /> Cari</button>
	</div>
	<div class="order-toolbar-actions"><span class="hint">{totalRows} perusahaan</span></div>
</div>

{#if loading}
	<div class="card card-pad"><div class="empty">Memuat…</div></div>
{:else if rows.length === 0}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">🏢</div>
			Belum ada klien.<br />
			<button type="button" class="btn btn-primary" style="margin-top:14px;" onclick={openCreate}>+ Tambah Klien</button>
		</div>
	</div>
{:else}
	<div class="spot-order-wrap">
		<div class="spot-order-scroll">
			<table class="spot-order-table" style="min-width:900px;">
				<colgroup>
					<col style="width:5%" /><col style="width:32%" /><col style="width:10%" />
					<col style="width:15%" /><col style="width:13%" /><col style="width:12%" /><col style="width:13%" />
				</colgroup>
				<thead>
					<tr><th>No</th><th>Perusahaan</th><th>Kode</th><th>Peran</th><th>Produk</th><th>Status</th><th>Dibuat</th></tr>
				</thead>
				<tbody>
					{#each rows as c, i (c.id)}
						<tr>
							<td>{page * pageSize + i + 1}</td>
							<td>
								<div class="shipper-cell">
									<div class="shipper-avatar">{getInitials(c.name)}</div>
									<span class="shipper-name">{c.name}</span>
								</div>
							</td>
							<td class="mono">{c.abbreviation ?? '—'}</td>
							<td><span class="badge {c.role === 'admin' ? 'badge-self' : 'badge-planner'}">{c.role}</span></td>
							<td>
								{#if c.products?.includes('tms')}<span class="badge badge-self">TMS</span>{/if}
								{#if c.products?.includes('fms')}<span class="badge badge-planner" title="FMS tenant {c.fmsTenantId ?? ''}">FMS</span>{/if}
								{#if !c.products?.length}<span class="hint">—</span>{/if}
							</td>
							<td>
								{#if c.isSuspended}<span class="badge badge-fail">Ditangguhkan</span>
								{:else}<span class="badge badge-active">Aktif</span>{/if}
							</td>
							<td>{formatDate(c.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<table class="spot-order-table spot-order-table-frozen" style="width:140px;">
			<colgroup><col style="width:140px" /></colgroup>
			<thead><tr><th>Kontrol</th></tr></thead>
			<tbody>
				{#each rows as c (c.id)}
					<tr>
						<td>
							<div class="action-cell">
								<button type="button" class="frozen-icon-btn" title="Profil perusahaan" aria-label="Profil {c.name}"
									onclick={() => openProfile(c)}>
									<Pencil size={14} />
								</button>
								<button type="button" class="frozen-icon-btn" title="Akses fitur" aria-label="Akses fitur {c.name}"
									onclick={() => goto(`${basePath}/company-management?company=${c.id}`)}>
									<KeyRound size={14} />
								</button>
								<button type="button" class="frozen-icon-btn" title="Pengguna" aria-label="Pengguna {c.name}"
									onclick={() => openUsers(c)}>
									<Users size={14} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if lastPage > 0}
		<div class="table-footer-bar" style="display:flex; align-items:center; justify-content:center; gap:14px;">
			<button type="button" class="btn btn-outline btn-sm" disabled={page <= 0} onclick={() => load(page - 1)}>← Sebelumnya</button>
			<span>Halaman {page + 1} dari {lastPage + 1}</span>
			<button type="button" class="btn btn-outline btn-sm" disabled={page >= lastPage} onclick={() => load(page + 1)}>Selanjutnya →</button>
		</div>
	{:else}
		<div class="table-footer-bar">Semua data sudah dimuat</div>
	{/if}
{/if}

<Modal open={showCreate} size="lg" title={created ? 'Klien dibuat' : 'Tambah Klien'} onClose={() => (showCreate = false)}>
	{#if created}
		<div class="note-banner" style="margin-top:0;">
			<span>✅</span>
			<div>
				<b>{created.company}</b> sudah dibuat dengan fitur bawaan TMS. {created.fmsNote ?? ''}<br />
				Admin pertamanya: <b class="mono">{created.email}</b> — sampaikan password yang tadi diisi
				kepada mereka; password itu tidak tersimpan di mana pun selain akun tersebut.
			</div>
		</div>
		<p class="hint" style="margin-top:12px;">
			Fitur bisa disesuaikan dari <b>Akses fitur</b> pada baris perusahaan. Pengguna lain dibuat oleh admin
			perusahaan itu sendiri dari User Management mereka.
		</p>
	{:else}
		<div class="section-title" style="margin-top:0;"><h2><Building2 size={15} /> Perusahaan</h2></div>
		<FormGrid>
			<Field label="Nama Perusahaan" id="kc-name" required>
				<Input id="kc-name" bind:value={form.companyName} placeholder="cth. PT Maju Jaya Logistik" />
			</Field>
			<Field label="Kode Singkatan" id="kc-abbr" required help="Masuk ke nomor agreement, cth. AGR-KP-MJL-000001. 2–4 huruf.">
				<Input id="kc-abbr" bind:value={form.companyAbbreviation} placeholder="MJL"
					oninput={() => (abbrTouched = true)} />
			</Field>
		</FormGrid>
		<FormGrid>
			<Field label="Peran di Platform" id="kc-role" required help="Menentukan konsol yang mereka lihat: transporter merencanakan & mengirim, shipper memesan.">
				<Select id="kc-role" bind:value={form.role} options={ROLES} />
			</Field>
			<Field label="Produk" id="kc-products" help="TMS selalu aktif. FMS menyalakan seluruh fitur armada yang sudah dibangun; sesuaikan dari Akses fitur.">
				<div style="display:flex; gap:18px; padding-top:8px;">
					<label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" checked disabled /> TMS</label>
					<label style="display:flex; align-items:center; gap:6px;"><input type="checkbox" bind:checked={form.withFMS} /> FMS (fleet)</label>
				</div>
			</Field>
		</FormGrid>

		<div class="section-title"><h2><Users size={15} /> Admin Pertama</h2></div>
		<p class="hint" style="margin-bottom:12px;">
			Akun ini bisa mengelola semua pengguna dan data perusahaannya. Password minimal 12 karakter.
		</p>
		<FormGrid>
			<Field label="Nama" id="kc-fullname">
				<Input id="kc-fullname" bind:value={form.fullName} placeholder="cth. Budi Santoso" />
			</Field>
			<Field label="Email" id="kc-email" required>
				<Input id="kc-email" type="email" bind:value={form.email} placeholder="admin@perusahaan.co.id" />
			</Field>
			<Field label="Password" id="kc-password" required>
				<Input id="kc-password" type="password" bind:value={form.password} />
			</Field>
			<Field label="Ulangi Password" id="kc-confirm" required class="!mb-0">
				<Input id="kc-confirm" type="password" bind:value={form.confirm} />
			</Field>
		</FormGrid>

		{#if createError}
			<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{createError}</div></div>
		{/if}
	{/if}

	{#snippet footer()}
		{#if created}
			<Button onclick={() => (showCreate = false)}>Selesai</Button>
		{:else}
			<button type="button" class="btn btn-outline" onclick={() => (showCreate = false)}>Batal</button>
			<Button onclick={create} loading={saving}>Buat Klien</Button>
		{/if}
	{/snippet}
</Modal>

<Modal open={editing !== null} size="lg" title="Profil {editing?.name ?? ''}" onClose={() => (editing = null)}>
	<p class="hint" style="margin-bottom:12px;">Yang tercetak di dokumen: nama resmi, alamat, kontak. Peran, NPWP dan status tetap keputusan platform.</p>
	<FormGrid>
		<Field label="Nama Tampilan" id="cp-name" required><Input id="cp-name" bind:value={profile.name} /></Field>
		<Field label="Nama Resmi" id="cp-legal" help="cth. PT Maju Jaya Logistik"><Input id="cp-legal" bind:value={profile.legalName} /></Field>
		<Field label="Telepon" id="cp-phone"><Input id="cp-phone" bind:value={profile.phone} /></Field>
		<Field label="Email" id="cp-email"><Input id="cp-email" type="email" bind:value={profile.email} /></Field>
		<Field label="Website" id="cp-web"><Input id="cp-web" bind:value={profile.website} /></Field>
		<Field label="Negara (ISO-2)" id="cp-country"><Input id="cp-country" bind:value={profile.country} placeholder="ID" /></Field>
	</FormGrid>
	<Field label="Alamat" id="cp-address"><Input id="cp-address" bind:value={profile.address} /></Field>
	<FormGrid>
		<Field label="Kota" id="cp-city"><Input id="cp-city" bind:value={profile.city} /></Field>
		<Field label="Provinsi" id="cp-prov"><Input id="cp-prov" bind:value={profile.province} /></Field>
		<Field label="Kode Pos" id="cp-post" class="!mb-0"><Input id="cp-post" bind:value={profile.postalCode} /></Field>
	</FormGrid>
	{#if profileError}
		<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{profileError}</div></div>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (editing = null)}>Batal</button>
		<Button onclick={saveProfile} loading={savingProfile}>Simpan</Button>
	{/snippet}
</Modal>
