<script lang="ts">
	/**
	 * Web-Field — the receiving PIC's page for one unloading.
	 *
	 * Opened from the handover WhatsApp (or the driver's screen). No account:
	 * the token is the credential. The PIC sees which truck is at the gate
	 * and what it should be carrying, answers "sesuai / tidak sesuai", and
	 * that answer is what lets the driver upload the unloading POD.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Truck, PackageCheck, CheckCircle2, XCircle, RefreshCw } from 'lucide-svelte';
	import { BRAND } from '$lib/constants/assets';

	type FieldView = {
		orderNumber: string;
		shipmentId: string;
		shipmentStatus: string;
		picName?: string;
		truck?: string;
		driver?: string;
		destination?: string;
		cargo?: Record<string, any>;
		cargoCheck?: { matches: boolean; note?: string; checkedAt: string } | null;
		pod?: { status: string; submittedAt: string } | null;
		handoverVerified: boolean;
	};

	let token = $derived(($page.params as Record<string, string>).token ?? '');
	let view = $state<FieldView | null>(null);
	let error = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let picName = $state('');
	let note = $state('');

	async function load() {
		try {
			const res = await fetch(`/api/v1/shipments/field/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } });
			if (!res.ok) {
				error = res.status === 404 ? 'Link tidak ditemukan atau sudah tidak berlaku.' : 'Gagal memuat data pengiriman.';
				return;
			}
			const body = await res.json();
			view = body?.data ?? body;
			if (view?.picName && !picName) picName = view.picName;
			error = '';
		} catch {
			error = 'Gagal memuat data pengiriman.';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
		const t = setInterval(load, 20_000);
		return () => clearInterval(t);
	});

	async function answer(matches: boolean) {
		if (saving) return;
		saving = true;
		try {
			const res = await fetch(`/api/v1/shipments/field/${encodeURIComponent(token)}/cargo-check`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({ matches, note: note.trim(), picName: picName.trim() })
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				error = body?.message || 'Gagal menyimpan verifikasi.';
				return;
			}
			view = body?.data ?? view;
			error = '';
		} finally {
			saving = false;
		}
	}

	const STATUS_LABEL: Record<string, string> = {
		toUnloading: 'Menuju lokasi bongkar',
		atUnloading: 'Tiba di lokasi bongkar — menunggu kode OTP',
		unloading: 'Proses bongkar',
		unloaded: 'Selesai bongkar',
		finished: 'Pengiriman selesai'
	};
	let canAnswer = $derived(!!view && view.shipmentStatus === 'unloading' && view.pod?.status !== 'approved');
	const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
	const cargoRows = $derived.by(() => {
		const c = view?.cargo ?? {};
		const rows: [string, string][] = [];
		if (c.namaMuatan || c.muatan) rows.push(['Muatan', String(c.namaMuatan ?? c.muatan)]);
		if (c.totalBerat != null) rows.push(['Total berat', `${c.totalBerat} kg`]);
		if (c.kuantitas != null) rows.push(['Kuantitas', String(c.kuantitas)]);
		if (c.totalVolume != null) rows.push(['Volume', `${c.totalVolume} m³`]);
		if (Array.isArray(c.cargoItems)) for (const it of c.cargoItems) rows.push([it.name ?? it.itemName ?? 'Item', `${it.qty ?? it.quantity ?? ''} ${it.unit ?? ''}`.trim()]);
		return rows;
	});
</script>

<svelte:head><title>Web-Field{view ? ` · ${view.orderNumber}` : ''}</title></svelte:head>

<div class="field-page">
	<header class="field-head">
		<img src={BRAND.logoWhiteWithText} alt="Karlo" class="field-logo" />
		<span class="field-head-title">Web-Field · Verifikasi Bongkar</span>
	</header>
	<main class="field-main">
		{#if loading}
			<div class="field-card field-empty">Memuat…</div>
		{:else if error && !view}
			<div class="field-card field-empty">{error}</div>
		{:else if view}
			<section class="field-card">
				<div class="field-eyebrow">Nomor Order</div>
				<div class="field-order-no">{view.orderNumber}</div>
				<div class="field-status">{STATUS_LABEL[view.shipmentStatus] ?? view.shipmentStatus}</div>
				<div class="field-grid">
					<div><div class="field-eyebrow"><Truck size={12} /> Armada</div><b>{view.truck || '—'}</b><span class="field-sub">{view.driver ? `Pengemudi: ${view.driver}` : ''}</span></div>
					<div><div class="field-eyebrow"><PackageCheck size={12} /> Gudang Bongkar</div><b>{view.destination || '—'}</b></div>
				</div>
			</section>

			<section class="field-card">
				<div class="field-eyebrow">Muatan sesuai order</div>
				{#if cargoRows.length}
					<table class="field-table">
						<tbody>{#each cargoRows as [k, v] (k + v)}<tr><td>{k}</td><td>{v}</td></tr>{/each}</tbody>
					</table>
				{:else}
					<div class="field-sub">Rincian muatan tidak tersedia.</div>
				{/if}
			</section>

			<section class="field-card">
				<div class="field-eyebrow">Verifikasi muatan</div>
				{#if view.cargoCheck}
					<div class="field-answer" class:ok={view.cargoCheck.matches} class:bad={!view.cargoCheck.matches}>
						{#if view.cargoCheck.matches}<CheckCircle2 size={18} /> Sesuai{:else}<XCircle size={18} /> Tidak sesuai{/if}
						<span class="field-sub">· {fmt(view.cargoCheck.checkedAt)}</span>
					</div>
					{#if view.cargoCheck.note}<p class="field-note">{view.cargoCheck.note}</p>{/if}
					<p class="field-sub">Driver kini dapat mengunggah foto POD bongkar.{#if view.pod} Status POD: <b>{view.pod.status}</b>.{/if}</p>
				{:else if !canAnswer}
					<p class="field-sub">
						{#if view.shipmentStatus === 'atUnloading'}Verifikasi dibuka setelah driver memasukkan kode OTP yang Anda terima.{:else}Verifikasi belum dapat dilakukan pada tahap ini.{/if}
					</p>
				{/if}
				{#if canAnswer}
					<label class="field-label" for="picName">Nama PIC</label>
					<input id="picName" class="field-input" bind:value={picName} placeholder="Nama Anda" />
					<label class="field-label" for="note">Catatan (wajib bila tidak sesuai)</label>
					<textarea id="note" class="field-input" rows="3" bind:value={note} placeholder="Mis. 2 koli rusak, jumlah kurang 5"></textarea>
					{#if error}<p class="field-error">{error}</p>{/if}
					<div class="field-actions">
						<button class="btn-field bad" disabled={saving || !note.trim()} onclick={() => answer(false)}><XCircle size={16} /> Tidak sesuai</button>
						<button class="btn-field ok" disabled={saving} onclick={() => answer(true)}><CheckCircle2 size={16} /> Sesuai</button>
					</div>
				{/if}
			</section>
			<div class="field-foot"><RefreshCw size={11} /> Diperbarui otomatis setiap 20 detik</div>
		{/if}
	</main>
</div>

<style>
	.field-page { min-height: 100vh; background: #f4f6fa; color: #1b1c1e; font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif; }
	.field-head { display: flex; align-items: center; gap: 14px; padding: 12px 20px; background: #0d2555; color: #fff; }
	.field-logo { height: 28px; }
	.field-head-title { font-size: 13px; font-weight: 600; opacity: 0.9; }
	.field-main { max-width: 640px; margin: 0 auto; padding: 20px 16px 40px; display: flex; flex-direction: column; gap: 14px; }
	.field-card { background: #fff; border: 1px solid #e3e6ec; border-radius: 14px; padding: 18px 20px; display: flex; flex-direction: column; gap: 8px; }
	.field-empty { text-align: center; color: #5b5f67; padding: 40px 20px; }
	.field-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5b5f67; display: flex; align-items: center; gap: 5px; }
	.field-order-no { font-size: 22px; font-weight: 800; font-family: 'Roboto Mono', monospace; }
	.field-status { display: inline-flex; align-self: flex-start; padding: 5px 12px; border-radius: 999px; background: #e3ecfc; color: #0b57d0; font-weight: 700; font-size: 12.5px; }
	.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 6px; font-size: 13px; }
	.field-grid > div { display: flex; flex-direction: column; gap: 3px; padding: 12px; border: 1px solid #eef0f4; border-radius: 10px; background: #fafbfd; }
	.field-sub { font-size: 12px; color: #5b5f67; }
	.field-table { width: 100%; border-collapse: collapse; font-size: 13px; }
	.field-table td { padding: 6px 0; border-bottom: 1px solid #eef0f4; }
	.field-table td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
	.field-label { font-size: 12px; font-weight: 600; margin-top: 6px; }
	.field-input { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #d5d9e2; border-radius: 10px; font: inherit; font-size: 14px; }
	.field-actions { display: flex; gap: 10px; margin-top: 10px; }
	.btn-field { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 12px; border: 0; font: inherit; font-weight: 700; font-size: 15px; cursor: pointer; }
	.btn-field.ok { background: #146c2e; color: #fff; }
	.btn-field.bad { background: #fce8e6; color: #b3261e; }
	.btn-field:disabled { opacity: 0.5; cursor: not-allowed; }
	.field-answer { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; }
	.field-answer.ok { color: #146c2e; }
	.field-answer.bad { color: #b3261e; }
	.field-note { margin: 0; padding: 10px 12px; background: #fafbfd; border-radius: 10px; font-size: 13px; }
	.field-error { color: #b3261e; font-size: 12.5px; margin: 4px 0 0; }
	.field-foot { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #5b5f67; justify-content: center; }
	@media (max-width: 480px) { .field-grid { grid-template-columns: 1fr; } }
</style>
