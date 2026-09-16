<script lang="ts">
	/**
	 * Driver Detail — the prototype's DriverDetailView.vue against
	 * GET /drivers/{id}. Address and birth date live in the driver's
	 * free-form `attributes`; the KTP and SIM tiles light up when a document
	 * of that type is on file (GET /documents?driverId=).
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { User, MapPin, Calendar, Phone, FileText } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { initials } from '$lib/revamp/initials.js';

	let { basePath = '/t', id }: { basePath?: string; id: string } = $props();

	interface DriverView {
		nama: string;
		telp: string;
		address: string;
		birthDate: string;
		hasProfile: boolean;
		hasKtp: boolean;
		hasSim: boolean;
	}
	let driver = $state<DriverView | null>(null);
	let loaded = $state(false);

	async function load() {
		try {
			const [d, docs] = await Promise.allSettled([
				api.get(ENDPOINTS.drivers.one(id)),
				api.get('/documents', { driverId: id, pageSize: 100 })
			]);
			if (d.status !== 'fulfilled') throw d.reason;
			const x = d.value.data?.data ?? {};
			const a = x.attributes ?? {};
			const rows: any[] =
				docs.status === 'fulfilled' ? (docs.value.data?.data?.items ?? docs.value.data?.data ?? []) : [];
			const has = (type: string) =>
				rows.some((r) => String(r.docType ?? '').toLowerCase() === type && (r.fileKey || r.number));
			driver = {
				nama: x.fullName ?? '',
				telp: String(x.phone ?? '').replace(/^\+/, ''),
				address: a.address ?? '',
				birthDate: a.birthDate ?? '',
				hasProfile: !!a.hasProfile || !!a.photoKey,
				hasKtp: has('ktp') || !!a.hasKtp,
				hasSim: has('sim') || !!x.licenseNo
			};
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat data driver');
		} finally {
			loaded = true;
		}
	}
	onMount(load);

	function backToFleet() {
		goto(`${basePath}/fleet/truck-list`);
	}
</script>

<button class="btn btn-text back-btn" onclick={backToFleet}>&larr; Kembali ke My Fleet</button>
<div class="page-head">
	<div><h1>Driver Detail</h1></div>
</div>

{#if loaded && !driver}
	<div class="card card-pad"><div class="empty">Driver tidak ditemukan.</div></div>
{:else if driver}
	<div class="card detail-card" style="max-width:900px;">
		<div class="detail-header header-blue">Info Driver</div>
		<div class="card-pad">
			<div class="driver-detail-grid">
				<div class="photo-placeholder" class:has-doc={driver.hasProfile}>
					{#if driver.hasProfile}
						<div
							style="width:100%;height:100%;border-radius:10px;background:linear-gradient(135deg,var(--primary),#4C8DFF);display:flex;align-items:center;justify-content:center;color:#fff;font-size:44px;font-weight:700;"
						>
							{initials(driver.nama)}
						</div>
					{:else}
						No photo profile
					{/if}
				</div>
				<div class="dfield-body-list">
					<div class="dfield">
						<div class="dfield-icon icon-blue"><User size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Name</div>
							<div class="detail-value">{driver.nama || '-'}</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><MapPin size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Address</div>
							<div class="detail-value">{driver.address || '-'}</div>
						</div>
					</div>
					<div class="dfield">
						<div class="dfield-icon icon-blue"><Calendar size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Birth Date</div>
							<div class="detail-value">{driver.birthDate || '-'}</div>
						</div>
					</div>
					<div class="dfield" style="margin-bottom:0;">
						<div class="dfield-icon icon-blue"><Phone size={16} /></div>
						<div class="dfield-body">
							<div class="dfield-label">Phone Number</div>
							<div class="detail-value">{driver.telp ? '+' + driver.telp : '-'}</div>
						</div>
					</div>
				</div>
			</div>

			<div class="divider"></div>

			<div class="dfield-row">
				<div>
					<div class="dfield-label" style="margin-bottom:8px;">ID Document</div>
					<div class="doc-photo-placeholder">
						{#if driver.hasKtp}
							<div
								style="width:100%;height:100%;border-radius:10px;background:#0B57D014;border:1.5px solid #0B57D0;padding:12px;display:flex;gap:10px;align-items:center;"
							>
								<div
									style="width:44px;height:54px;border-radius:6px;background:#0B57D0;opacity:.3;flex-shrink:0;"
								></div>
								<div style="flex:1;display:flex;flex-direction:column;gap:6px;">
									<div style="font-size:9.5px;font-weight:700;color:#0B57D0;letter-spacing:.5px;">KTP</div>
									<div style="height:6px;width:82%;background:#0B57D0;opacity:.35;border-radius:3px;"></div>
									<div style="height:6px;width:62%;background:#0B57D0;opacity:.35;border-radius:3px;"></div>
								</div>
							</div>
						{:else}
							<FileText size={22} />
							<span>No photo KTP</span>
						{/if}
					</div>
				</div>
				<div>
					<div class="dfield-label" style="margin-bottom:8px;">License Document</div>
					<div class="doc-photo-placeholder">
						{#if driver.hasSim}
							<div
								style="width:100%;height:100%;border-radius:10px;background:#146C2E14;border:1.5px solid #146C2E;padding:12px;display:flex;gap:10px;align-items:center;"
							>
								<div
									style="width:44px;height:54px;border-radius:6px;background:#146C2E;opacity:.3;flex-shrink:0;"
								></div>
								<div style="flex:1;display:flex;flex-direction:column;gap:6px;">
									<div style="font-size:9.5px;font-weight:700;color:#146C2E;letter-spacing:.5px;">SIM</div>
									<div style="height:6px;width:82%;background:#146C2E;opacity:.35;border-radius:3px;"></div>
									<div style="height:6px;width:62%;background:#146C2E;opacity:.35;border-radius:3px;"></div>
								</div>
							</div>
						{:else}
							<FileText size={22} />
							<span>No photo SIM</span>
						{/if}
					</div>
				</div>
			</div>

			<div class="detail-actions" style="justify-content:center;">
				<button class="btn btn-teal" onclick={() => toast('Sesi login driver berhasil direset')}
					>Reset Login Session</button
				>
				<button class="btn btn-amber" onclick={() => toast('Link ubah password telah dikirim ke driver')}
					>Change Password</button
				>
				<button class="btn btn-primary" onclick={backToFleet}>Back</button>
			</div>
		</div>
	</div>
{/if}
