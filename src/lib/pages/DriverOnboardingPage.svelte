<script lang="ts">
	/**
	 * Onboarding & Registrasi Driver — giving a driver a K-Trip login.
	 *
	 * Two paths, from the review:
	 *   1. The driver registered in K-Trip and gave the planner a username:
	 *      look it up, check it is the right person, confirm.
	 *   2. The planner registers the driver: name + WhatsApp number, a
	 *      password (default or typed), and the driver receives the app
	 *      link and credentials on WhatsApp. The table underneath shows who
	 *      has been registered and whether they have signed in yet.
	 *
	 * Either way the account is also recorded as a master-data driver (or
	 * linked to the existing one with that phone), which is what the truck
	 * pairing and dispatch key on.
	 */
	import { onMount } from 'svelte';
	import { UserPlus, Search, Copy, ArrowLeft, Check } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import {
		Button,
		DataTable,
		Field,
		FormGrid,
		Input,
		PageHeader,
		StatusBadge,
		Tabs,
		type Column
	} from '$lib/components/ui';
	import { formatDate } from '$lib/utils/format';

	let { basePath = '/t' }: { basePath?: string } = $props();

	const TABS = [
		{ id: 'driver', label: 'Registrasi oleh Driver' },
		{ id: 'planner', label: 'Registrasi oleh Planner' }
	];
	let tab = $state('planner');
	let error = $state('');
	let notice = $state('');

	// --- Registered accounts table --------------------------------------------
	type Account = {
		userId: string;
		username: string;
		fullName: string;
		phone: string;
		status: string;
		createdAt: string;
		lastLoginAt?: string;
		firstLoginAt?: string;
		password?: string;
		whatsappSent?: boolean;
	};
	let accounts = $state<Account[]>([]);
	let loadingAccounts = $state(true);
	async function loadAccounts() {
		loadingAccounts = true;
		try {
			const res = await api.get('/drivers/accounts');
			accounts = res.data?.data ?? [];
		} catch {
			accounts = [];
		} finally {
			loadingAccounts = false;
		}
	}
	let companyName = $state('Perusahaan Anda');
	onMount(async () => {
		await loadAccounts();
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			companyName = res.data?.data?.name ?? companyName;
		} catch {
			/* the name is cosmetic */
		}
	});

	// --- Path 2: planner registers --------------------------------------------
	let defaultPassword = $state('');
	let form = $state({ fullName: '', phone: '', password: '' });
	let saving = $state(false);
	let created = $state<Account | null>(null);

	async function registerByPlanner() {
		error = '';
		if (!form.fullName.trim() || !form.phone.trim()) {
			error = 'Nama lengkap dan nomor WhatsApp wajib diisi.';
			return;
		}
		saving = true;
		try {
			const res = await api.post('/drivers/accounts', {
				fullName: form.fullName.trim(),
				phone: form.phone.trim(),
				password: form.password || defaultPassword || undefined,
				sendWhatsapp: true
			});
			created = res.data?.data ?? null;
			if (created) await linkMasterData(created.userId, created.fullName, created.phone);
			form = { fullName: '', phone: '', password: '' };
			await loadAccounts();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Pendaftaran gagal.';
		} finally {
			saving = false;
		}
	}

	/** Record (or link) the master-data driver behind a login. */
	async function linkMasterData(userId: string, fullName: string, phone: string) {
		try {
			const found = await api.get(ENDPOINTS.drivers.list, { search: phone, pageSize: 5 });
			const existing = (found.data?.data ?? []).find((d: any) =>
				(d.phone ?? '').replace(/\D/g, '').endsWith(phone.replace(/\D/g, '').slice(-9))
			);
			if (existing) await api.put(ENDPOINTS.drivers.update(existing.id), { userId });
			else await api.post(ENDPOINTS.drivers.create, { fullName, phone, status: 'active', userId });
		} catch (e: any) {
			notice = `Akun dibuat, tetapi data driver di master data belum tertaut: ${e?.response?.data?.message ?? 'coba tautkan dari halaman Drivers.'}`;
		}
	}

	const waMessage = (a: Account) =>
		`Halo ${a.fullName} 👋\n\nSelamat datang di ${companyName}! Akun K-Trip Anda sudah didaftarkan.\n\n📱 Unduh K-Trip: https://play.google.com/store/apps/details?id=id.karlo.ktrip\n👤 Username: ${a.username}\n🔑 Password: ${a.password ?? '(sudah dikirim)'}\n\nSilakan login dan ganti password Anda setelah masuk.`;

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			notice = 'Pesan disalin.';
		} catch {
			notice = 'Tidak bisa menyalin otomatis; pilih teks secara manual.';
		}
	}

	// --- Path 1: driver registered themselves ---------------------------------
	let lookupUsername = $state('');
	let looked = $state<Account | null>(null);
	let checking = $state(false);
	async function check() {
		error = '';
		looked = null;
		if (!lookupUsername.trim()) return;
		checking = true;
		try {
			const res = await api.get('/drivers/accounts/lookup', { username: lookupUsername.trim() });
			looked = res.data?.data ?? null;
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Username tidak ditemukan.';
		} finally {
			checking = false;
		}
	}
	async function adopt() {
		if (!looked) return;
		saving = true;
		error = '';
		try {
			const res = await api.post(`/drivers/accounts/${looked.userId}/adopt`);
			const a: Account = res.data?.data ?? looked;
			await linkMasterData(a.userId, a.fullName, a.phone);
			notice = `${a.fullName} sekarang menjadi driver ${companyName}.`;
			looked = null;
			lookupUsername = '';
			await loadAccounts();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Gagal menautkan akun.';
		} finally {
			saving = false;
		}
	}

	const columns: Column[] = [
		{ key: 'fullName', label: 'Nama Driver' },
		{ key: 'username', label: 'Username' },
		{ key: 'phone', label: 'No. WhatsApp' },
		{ key: 'createdAt', label: 'Tanggal', format: (r) => formatDate(r.createdAt) },
		{ key: 'status', label: 'Status Akun' },
		{ key: 'firstLogin', label: 'First Login K-Trip' },
		{ key: 'actions', label: '', align: 'right' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		title="Onboarding & Registrasi Driver"
		icon={UserPlus}
		subtitle="Beri driver akun K-Trip: dari username yang sudah mereka buat sendiri, atau daftarkan langsung dan kirim kredensialnya ke WhatsApp."
	>
		{#snippet actions()}
			<Button variant="ghost" href="{basePath}/fleet/pairing"
				><ArrowLeft size={14} /> Kembali ke My Fleet</Button
			>
		{/snippet}
	</PageHeader>

	<Tabs
		tabs={TABS}
		activeTab={tab}
		onChange={(id) => {
			tab = id;
			error = '';
			notice = '';
		}}
	/>

	{#if error}<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>{/if}
	{#if notice}<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>{/if}

	{#if tab === 'driver'}
		<section class="card p-5 space-y-4">
			<FormGrid>
				<Field
					label="Masukkan Username Driver"
					id="lk"
					help="Username yang dibuat driver saat mendaftar mandiri di K-Trip."
					wide
				>
					<div class="flex gap-2">
						<Input
							id="lk"
							bind:value={lookupUsername}
							placeholder="cth. dwipras"
							onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && check()}
						/>
						<Button onclick={check} loading={checking}><Search size={14} /> Check</Button>
					</div>
				</Field>
			</FormGrid>
			{#if looked}
				<div class="info-driver">
					<header>Info Driver</header>
					<div class="info-body">
						<div class="avatar">
							{looked.fullName
								.split(' ')
								.map((w) => w[0])
								.join('')
								.slice(0, 2)
								.toUpperCase()}
						</div>
						<dl>
							<dt>Nama</dt>
							<dd>{looked.fullName || '—'}</dd>
							<dt>Username</dt>
							<dd>{looked.username}</dd>
							<dt>Nomor Telepon</dt>
							<dd>{looked.phone || '—'}</dd>
							<dt>Status</dt>
							<dd>{looked.status}</dd>
						</dl>
					</div>
					<footer>
						<button type="button" class="btn btn-outline" onclick={() => (looked = null)}>Cancel</button>
						<Button onclick={adopt} loading={saving}><Check size={14} /> Confirm</Button>
					</footer>
				</div>
			{/if}
		</section>
	{:else}
		<section class="card p-5 space-y-4">
			<FormGrid>
				<Field label="Nama Perusahaan Transporter" id="co"
					><Input id="co" value={companyName} readonly /></Field
				>
				<Field
					label="Inisial Default Password"
					id="dp"
					help="Dipakai untuk setiap driver baru bila kolom password dikosongkan. Minimal 8 karakter."
					><Input id="dp" bind:value={defaultPassword} placeholder="cth. Karlo2026" /></Field
				>
			</FormGrid>
			<h3 class="text-sm font-semibold">Registrasi Driver</h3>
			<FormGrid>
				<Field label="Nama Lengkap Driver" id="fn" required
					><Input id="fn" bind:value={form.fullName} placeholder="cth. Nanang" /></Field
				>
				<Field label="Nomor WhatsApp" id="ph" required
					><Input id="ph" bind:value={form.phone} placeholder="08xx…" /></Field
				>
				<Field
					label="Inisial Password"
					id="pw"
					help="Kosongkan untuk memakai default; kosong keduanya, password dibuat otomatis."
					><Input id="pw" bind:value={form.password} placeholder={defaultPassword || 'otomatis'} /></Field
				>
			</FormGrid>
			<div class="flex justify-end">
				<Button onclick={registerByPlanner} loading={saving}>Daftarkan & Kirim ke WhatsApp</Button>
			</div>

			{#if created}
				<div class="created">
					<div class="wa-preview">
						<div class="wa-head">K-Trip Notifikasi</div>
						<pre>{waMessage(created)}</pre>
					</div>
					<div class="created-info">
						<p><b>Akun berhasil dibuat</b></p>
						<p>Username: <code>{created.username}</code></p>
						{#if created.password}<p>
								Password: <code>{created.password}</code>
								<span class="text-muted">— tampil sekali, simpan sekarang.</span>
							</p>{/if}
						<p>
							{created.whatsappSent
								? 'Pesan WhatsApp terkirim ke ' + created.phone + '.'
								: 'WhatsApp tidak terkirim; salin pesan dan kirim manual.'}
						</p>
						<div class="flex gap-2 mt-2">
							<button type="button" class="btn btn-outline btn-sm" onclick={() => copy(waMessage(created!))}
								><Copy size={14} /> Salin Pesan</button
							>
							<button type="button" class="btn btn-outline btn-sm" onclick={() => (created = null)}
								>Daftarkan driver lain</button
							>
						</div>
					</div>
				</div>
			{/if}
		</section>
	{/if}

	<section class="card">
		<header class="table-head">Riwayat Akun Terdaftar</header>
		<DataTable
			{columns}
			data={accounts}
			totalRows={accounts.length}
			loading={loadingAccounts}
			emptyMessage="Belum ada akun driver"
			pageSize={50}
		>
			{#snippet cell(row: any, column: Column, text: string)}
				{#if column.key === 'status'}
					<StatusBadge statusCode={row.status} label={row.status === 'active' ? 'Terdaftar' : row.status} />
				{:else if column.key === 'firstLogin'}
					{#if row.firstLoginAt}
						<span class="ok">Sudah login · {formatDate(row.firstLoginAt)}</span>
					{:else}
						<span class="pending">Belum login</span>
					{/if}
				{:else if column.key === 'actions'}
					<div class="action-cell" style="justify-content:flex-end;">
						<button type="button" class="btn btn-outline btn-sm" onclick={() => copy(waMessage(row))}
							><Copy size={12} /> Salin Pesan</button
						>
					</div>
				{:else}
					{text}
				{/if}
			{/snippet}
		</DataTable>
	</section>
</div>

<style>
	.card {
		background: var(--surface, #fff);
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 12px;
	}
	.table-head {
		padding: 10px 14px;
		background: var(--primary, #1d4ed8);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		border-radius: 12px 12px 0 0;
	}
	.info-driver {
		border: 1px solid var(--outline-variant, #e5e7eb);
		border-radius: 10px;
		overflow: hidden;
	}
	.info-driver header {
		background: var(--primary, #1d4ed8);
		color: #fff;
		padding: 8px 14px;
		font-size: 13px;
		font-weight: 600;
	}
	.info-body {
		display: flex;
		gap: 16px;
		padding: 14px;
		align-items: flex-start;
	}
	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 12px;
		background: var(--primary, #1d4ed8);
		color: #fff;
		display: grid;
		place-items: center;
		font-weight: 700;
	}
	.info-body dl {
		display: grid;
		grid-template-columns: 130px 1fr;
		gap: 4px 12px;
		font-size: 13px;
		margin: 0;
	}
	.info-body dt {
		color: var(--on-surface-variant, #6b7280);
	}
	.info-body dd {
		margin: 0;
	}
	.info-driver footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--outline-variant, #e5e7eb);
	}
	.created {
		display: grid;
		grid-template-columns: 300px 1fr;
		gap: 16px;
		align-items: start;
	}
	@media (max-width: 800px) {
		.created {
			grid-template-columns: 1fr;
		}
	}
	.wa-preview {
		background: #e5ddd5;
		border-radius: 16px;
		padding: 10px;
	}
	.wa-head {
		font-size: 11px;
		font-weight: 600;
		color: #075e54;
		margin-bottom: 6px;
	}
	.wa-preview pre {
		background: #fff;
		border-radius: 8px;
		padding: 10px;
		font-size: 12px;
		white-space: pre-wrap;
		font-family: inherit;
		margin: 0;
		color: #111;
	}
	.created-info {
		font-size: 13px;
		display: grid;
		gap: 4px;
	}
	.created-info code {
		background: var(--surface-container, #f3f4f6);
		padding: 1px 6px;
		border-radius: 4px;
	}
	.ok {
		color: var(--success, #15803d);
		font-size: 12px;
	}
	.pending {
		color: var(--on-surface-variant, #6b7280);
		font-size: 12px;
	}
</style>
