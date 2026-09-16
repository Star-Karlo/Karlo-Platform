<script lang="ts">
	/**
	 * Profil Perusahaan — the prototype's CompanyProfileView.vue against
	 * GET/PUT /companies/me. Columns hold what a document prints (name,
	 * legal name, phone, address, NPWP, logo, bank account, description);
	 * the JSONB `profile` holds the rest of this screen.
	 */
	import { onMount } from 'svelte';
	import { Building2, IdCard, Wallet, Pencil } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { authStore } from '$lib/stores/auth';
	import { toast } from '$lib/stores/ui';
	import { fileToCompressedDataUrl } from '$lib/revamp/imageUpload.js';
	import { INDONESIAN_CITY_OPTIONS } from '$lib/revamp/indonesianCities.js';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';

	let { basePath: _basePath = '/t' }: { basePath?: string } = $props();

	// The login is the email; there is no separate username field, so the
	// local part of the real address stands in rather than an invented one.
	let email = $derived($authStore.user?.email || '-');
	let username = $derived($authStore.user?.email ? String($authStore.user.email).split('@')[0] : '-');

	function notYetAvailable(label: string) {
		toast(`${label} akan segera hadir`);
	}

	const SERVICE_TYPE_OPTIONS = [
		'Logistik & Fulfillment',
		'Retail / Distributor',
		'E-Commerce / Online Shop',
		'Manufaktur / Produksi',
		'F&B (Makanan & Minuman)',
		'Fashion & Apparel',
		'Elektronik & Gadget',
		'Otomotif',
		'Pertanian / Peternakan',
		'Furniture',
		'Kecantikan & Personal Care',
		'Lainnya'
	].map((v) => ({ value: v, label: v }));

	interface Profile {
		logoUrl: string;
		companyName: string;
		legalName: string;
		phone: string;
		address: string;
		foundedYear: string;
		serviceTypes: string[];
		operatingRegions: string[];
		description: string;
		picName: string;
		picPosition: string;
		picPhone: string;
		nib: string;
		npwp: string;
		kppLocation: string;
		bankName: string;
		bankAccountNumber: string;
		bankAccountName: string;
	}
	const empty = (): Profile => ({
		logoUrl: '',
		companyName: '',
		legalName: '',
		phone: '',
		address: '',
		foundedYear: '',
		serviceTypes: [],
		operatingRegions: [],
		description: '',
		picName: '',
		picPosition: '',
		picPhone: '',
		nib: '',
		npwp: '',
		kppLocation: '',
		bankName: '',
		bankAccountNumber: '',
		bankAccountName: ''
	});
	let settings = $state<Profile>(empty());
	let loaded = $state(false);

	function fromCompany(c: any): Profile {
		const p = c.profile ?? {};
		const bank = c.bankAccount ?? {};
		return {
			logoUrl: c.logoUrl ?? '',
			companyName: c.name ?? '',
			legalName: c.legalName ?? '',
			phone: c.phone ?? '',
			address: c.address ?? '',
			foundedYear: String(p.foundedYear ?? ''),
			serviceTypes: Array.isArray(p.serviceTypes) ? p.serviceTypes : [],
			operatingRegions: Array.isArray(p.operatingRegions) ? p.operatingRegions : [],
			description: c.companyProfile ?? '',
			picName: p.picName ?? '',
			picPosition: p.picPosition ?? '',
			picPhone: p.picPhone ?? '',
			nib: p.nib ?? '',
			npwp: c.npwp ?? '',
			kppLocation: p.kppLocation ?? '',
			bankName: bank.bankName ?? '',
			bankAccountNumber: bank.accountNumber ?? '',
			bankAccountName: bank.accountName ?? ''
		};
	}

	async function load() {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			settings = fromCompany(res.data?.data ?? {});
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat profil perusahaan');
		} finally {
			loaded = true;
		}
	}
	onMount(load);

	function joinOrDash(list: string[]) {
		return list && list.length ? list.join(', ') : '-';
	}

	let showEditModal = $state(false);
	let saving = $state(false);
	let form = $state<Profile>(empty());
	function openEdit() {
		form = {
			...settings,
			serviceTypes: [...settings.serviceTypes],
			operatingRegions: [...settings.operatingRegions]
		};
		showEditModal = true;
	}
	function closeEdit() {
		showEditModal = false;
	}
	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeEdit();
	}

	let uploadingLogo = $state(false);
	async function onUploadLogo(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploadingLogo = true;
		try {
			// 400px is plenty for a logo and keeps the data URL well inside
			// the request cap.
			form.logoUrl = await fileToCompressedDataUrl(file, 400, 0.8);
		} catch {
			toast('Gagal memproses logo');
		} finally {
			uploadingLogo = false;
		}
	}
	function removeLogo() {
		form.logoUrl = '';
	}

	async function submit() {
		if (!form.companyName.trim()) {
			toast('Nama Perusahaan wajib diisi');
			return;
		}
		saving = true;
		try {
			const res = await api.put(ENDPOINTS.companyMe, {
				name: form.companyName.trim(),
				legalName: form.legalName.trim(),
				phone: form.phone.trim(),
				address: form.address.trim(),
				npwp: form.npwp.trim(),
				companyProfile: form.description.trim(),
				logoUrl: form.logoUrl,
				bankAccount: {
					bankName: form.bankName.trim(),
					accountNumber: form.bankAccountNumber.trim(),
					accountName: form.bankAccountName.trim()
				},
				profile: {
					foundedYear: form.foundedYear.trim(),
					serviceTypes: form.serviceTypes,
					operatingRegions: form.operatingRegions,
					picName: form.picName.trim(),
					picPosition: form.picPosition.trim(),
					picPhone: settings.picPhone,
					nib: form.nib.trim(),
					kppLocation: form.kppLocation.trim()
				}
			});
			settings = fromCompany(res.data?.data ?? {});
			toast('Profil perusahaan berhasil diperbarui');
			closeEdit();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan profil perusahaan');
		} finally {
			saving = false;
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Profil Perusahaan</h1>
	</div>
</div>

<div class="card card-pad profile-card">
	<h2 class="profile-section-title">Akun</h2>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Username</b>
			<span class="hint">Nama pengguna akun</span>
		</div>
		<div class="detail-row-value">{username}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Email</b>
			<span class="hint">Alamat email terdaftar</span>
		</div>
		<div class="detail-row-value">{email}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Password</b>
			<span class="hint">Keamanan akun</span>
		</div>
		<div class="detail-row-value">
			<a
				href={_basePath + '/settings'}
				class="profile-link"
				onclick={(e) => {
					e.preventDefault();
					notYetAvailable('Ganti Password');
				}}>Ganti Password</a
			>
		</div>
	</div>

	<h2 class="profile-section-title">Data Perusahaan</h2>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Logo Perusahaan</b>
			<span class="hint">Logo resmi perusahaan</span>
		</div>
		<div class="detail-row-value">
			{#if settings.logoUrl}
				<img src={settings.logoUrl} alt="Logo Perusahaan" class="profile-logo-preview" />
			{:else}
				<div class="profile-logo-placeholder"><Building2 size={22} /></div>
			{/if}
		</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nama Perusahaan</b>
			<span class="hint">Nama resmi yang didaftarkan</span>
		</div>
		<div class="detail-row-value">{settings.companyName || (loaded ? '-' : '…')}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nama Legal Perusahaan</b>
			<span class="hint">Nama resmi yang didaftarkan</span>
		</div>
		<div class="detail-row-value">{settings.legalName || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>No HP/Telepon Perusahaan</b>
			<span class="hint">No kontak resmi perusahaan</span>
		</div>
		<div class="detail-row-value">{settings.phone || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Alamat Perusahaan</b>
			<span class="hint">Alamat lengkap perusahaan</span>
		</div>
		<div class="detail-row-value">{settings.address || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Tahun Berdiri Perusahaan</b>
			<span class="hint">Tahun perusahaan didirikan</span>
		</div>
		<div class="detail-row-value">{settings.foundedYear || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Jenis Layanan</b>
			<span class="hint">Jenis industri perusahaan</span>
		</div>
		<div class="detail-row-value">{joinOrDash(settings.serviceTypes)}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Wilayah Operasi</b>
			<span class="hint">Wilayah operasi perusahaan</span>
		</div>
		<div class="detail-row-value">{joinOrDash(settings.operatingRegions)}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Deskripsi Perusahaan</b>
			<span class="hint">Keterangan tambahan mengenai perusahaan</span>
		</div>
		<div class="detail-row-value">{settings.description || '-'}</div>
	</div>

	<h2 class="profile-section-title">Data PIC Perusahaan</h2>
	<div class="profile-info-card">
		<div class="profile-info-card-icon"><IdCard size={20} /></div>
		<div>
			<div class="profile-info-card-title">Data penanggung jawab atau PIC</div>
			<div class="profile-info-card-desc">
				Data penanggung jawab (PIC) berfungsi sebagai kontak utama "Satu Pintu" untuk klarifikasi operasional
				atau hal-hal mendesak terkait pengiriman Anda.
			</div>
		</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nama Lengkap PIC</b>
			<span class="hint">Nama penanggung jawab</span>
		</div>
		<div class="detail-row-value">{settings.picName || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Jabatan PIC</b>
			<span class="hint">Jabatan di perusahaan</span>
		</div>
		<div class="detail-row-value">{settings.picPosition || '-'}</div>
	</div>
	<div class="detail-row" style="border-bottom:none;">
		<div class="detail-row-label">
			<b>No Handphone PIC</b>
			<span class="hint">No Handphone aktif PIC</span>
		</div>
		<div class="detail-row-value">
			<div>{settings.picPhone || '-'}</div>
			<a
				href={_basePath + '/settings'}
				class="profile-link"
				onclick={(e) => {
					e.preventDefault();
					notYetAvailable('Ganti No Handphone');
				}}>Ganti No Handphone</a
			>
		</div>
	</div>

	<h2 class="profile-section-title">Data Dokumen Perusahaan</h2>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nomor Induk Berusaha</b>
			<span class="hint">NIB perusahaan terdaftar</span>
		</div>
		<div class="detail-row-value">{settings.nib || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nomor Pokok Wajib Pajak</b>
			<span class="hint">NPWP perusahaan terdaftar</span>
		</div>
		<div class="detail-row-value">{settings.npwp || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Lokasi KPP Terdaftar</b>
			<span class="hint">Lokasi saat daftar KPP</span>
		</div>
		<div class="detail-row-value">{settings.kppLocation || '-'}</div>
	</div>

	<div class="profile-info-card">
		<div class="profile-info-card-icon"><Wallet size={20} /></div>
		<div>
			<div class="profile-info-card-title">Data Rekening Bank</div>
			<div class="profile-info-card-desc">
				Informasi akun ini akan digunakan secara aman untuk proses pengembalian dana, seperti pembatalan order
				atau penyesuaian.
			</div>
		</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>Nama Bank</b>
			<span class="hint">Nama bank terkait rekening</span>
		</div>
		<div class="detail-row-value">{settings.bankName || '-'}</div>
	</div>
	<div class="detail-row">
		<div class="detail-row-label">
			<b>No Rekening</b>
			<span class="hint">Nomor rekening bank</span>
		</div>
		<div class="detail-row-value">{settings.bankAccountNumber || '-'}</div>
	</div>
	<div class="detail-row" style="border-bottom:none;">
		<div class="detail-row-label">
			<b>Nama Pemilik Rekening</b>
			<span class="hint">Nama pemilik / nama perusahaan di rekening</span>
		</div>
		<div class="detail-row-value">{settings.bankAccountName || '-'}</div>
	</div>

	<div class="profile-edit-actions">
		<button class="btn btn-primary" onclick={openEdit}><Pencil size={14} /> Edit</button>
	</div>
</div>

{#if showEditModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box modal-box-lg" role="dialog" aria-modal="true">
			<h3>Edit Profil Perusahaan</h3>
			<div class="modal-scroll-body">
				<div class="field">
					<label for="cp-logo">Logo Perusahaan</label>
					<div class="upload-image-row">
						{#if form.logoUrl}
							<img src={form.logoUrl} class="upload-image-preview" alt="Preview Logo" />
						{:else}
							<div class="upload-image-placeholder"><Building2 size={22} /></div>
						{/if}
						<div class="upload-image-actions">
							<label
								class="btn btn-outline btn-sm"
								style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;"
							>
								{uploadingLogo ? 'Memproses...' : form.logoUrl ? 'Ganti Logo' : 'Upload Logo'}
								<input
									id="cp-logo"
									type="file"
									accept="image/*"
									class="upload-image-input"
									disabled={uploadingLogo}
									onchange={onUploadLogo}
								/>
							</label>
							{#if form.logoUrl}
								<button type="button" class="upload-image-remove" onclick={removeLogo}>Hapus logo</button>
							{/if}
						</div>
					</div>
				</div>
				<div class="two-col">
					<div class="field">
						<label for="cp-name">Nama Perusahaan <span class="req">*</span></label>
						<input
							id="cp-name"
							type="text"
							bind:value={form.companyName}
							placeholder="cth. PT Star Karlo Indonesia"
						/>
					</div>
					<div class="field">
						<label for="cp-legal">Nama Legal Perusahaan</label>
						<input
							id="cp-legal"
							type="text"
							bind:value={form.legalName}
							placeholder="cth. Karlo Transporter"
						/>
					</div>
				</div>
				<div class="two-col">
					<div class="field">
						<label for="cp-phone">No HP/Telepon Perusahaan</label>
						<input id="cp-phone" type="text" bind:value={form.phone} placeholder="cth. 021-50919191" />
					</div>
					<div class="field">
						<label for="cp-year">Tahun Berdiri Perusahaan</label>
						<input
							id="cp-year"
							type="text"
							inputmode="numeric"
							bind:value={form.foundedYear}
							placeholder="cth. 2020"
						/>
					</div>
				</div>
				<div class="field">
					<label for="cp-address">Alamat Perusahaan</label>
					<textarea id="cp-address" rows="3" bind:value={form.address} placeholder="Alamat lengkap perusahaan"
					></textarea>
				</div>
				<div class="field">
					<label for="cp-service">Jenis Layanan</label>
					<FieldSelect
						bind:value={form.serviceTypes}
						options={SERVICE_TYPE_OPTIONS}
						placeholder="Pilih jenis layanan"
						multiple
						searchable
						chipsBelow
					/>
				</div>
				<div class="field">
					<label for="cp-region">Wilayah Operasi</label>
					<FieldSelect
						bind:value={form.operatingRegions}
						options={INDONESIAN_CITY_OPTIONS}
						placeholder="Pilih wilayah operasi"
						multiple
						searchable
						chipsBelow
					/>
				</div>
				<div class="field">
					<label for="cp-desc">Deskripsi Perusahaan</label>
					<textarea
						id="cp-desc"
						rows="3"
						bind:value={form.description}
						placeholder="Keterangan tambahan mengenai perusahaan"></textarea>
				</div>

				<div class="profile-section-title" style="margin-top:6px;">Data PIC Perusahaan</div>
				<div class="two-col">
					<div class="field">
						<label for="cp-pic">Nama Lengkap PIC</label>
						<input id="cp-pic" type="text" bind:value={form.picName} placeholder="cth. Budi Santoso" />
					</div>
					<div class="field">
						<label for="cp-pic-pos">Jabatan PIC</label>
						<input
							id="cp-pic-pos"
							type="text"
							bind:value={form.picPosition}
							placeholder="cth. Direktur Operasional"
						/>
					</div>
				</div>
				<div class="hint" style="margin:-6px 0 16px;">
					No Handphone PIC diubah lewat "Ganti No Handphone", bukan lewat form ini.
				</div>

				<div class="profile-section-title" style="margin-top:6px;">Data Dokumen Perusahaan</div>
				<div class="two-col">
					<div class="field">
						<label for="cp-nib">Nomor Induk Berusaha</label>
						<input id="cp-nib" type="text" bind:value={form.nib} placeholder="cth. 1234567890123" />
					</div>
					<div class="field">
						<label for="cp-npwp">Nomor Pokok Wajib Pajak</label>
						<input id="cp-npwp" type="text" bind:value={form.npwp} placeholder="cth. 01.234.567.8-901.000" />
					</div>
				</div>
				<div class="field">
					<label for="cp-kpp">Lokasi KPP Terdaftar</label>
					<input
						id="cp-kpp"
						type="text"
						bind:value={form.kppLocation}
						placeholder="cth. KPP Pratama Jakarta Kemayoran"
					/>
				</div>
				<div class="two-col">
					<div class="field">
						<label for="cp-bank">Nama Bank</label>
						<input id="cp-bank" type="text" bind:value={form.bankName} placeholder="cth. BANK BRI" />
					</div>
					<div class="field">
						<label for="cp-acc">No Rekening</label>
						<input
							id="cp-acc"
							type="text"
							bind:value={form.bankAccountNumber}
							placeholder="cth. 1234567890"
						/>
					</div>
				</div>
				<div class="field" style="margin-bottom:0;">
					<label for="cp-acc-name">Nama Pemilik Rekening</label>
					<input
						id="cp-acc-name"
						type="text"
						bind:value={form.bankAccountName}
						placeholder="cth. PT Star Karlo Indonesia"
					/>
				</div>
			</div>
			<div class="modal-actions">
				<button class="btn btn-outline" onclick={closeEdit}>Batal</button>
				<button class="btn btn-primary" disabled={saving} onclick={submit}
					>{saving ? 'Menyimpan...' : 'Simpan'}</button
				>
			</div>
		</div>
	</div>
{/if}
