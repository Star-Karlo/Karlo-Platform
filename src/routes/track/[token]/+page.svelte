<script lang="ts">
	/**
	 * Public live tracking — the customer's page for one order.
	 *
	 * Opened from the link a transporter copies in Control Tower. No account:
	 * the token in the URL is the credential and the business service answers
	 * with that order's status, milestones, truck, planned road and (while the
	 * load is moving) the truck's last position. Refreshes every minute.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Truck, MapPin, Clock, RefreshCw, PackageCheck } from 'lucide-svelte';
	import { BRAND } from '$lib/constants/assets';
	import { MapView, type MapMarker, type MapLine } from '$lib/components/ui';
	import { TRUCK_MARKER } from '$lib/constants/assets';

	type Snapshot = {
		orderNumber: string;
		shipperName?: string;
		transporterName?: string;
		origin: { name?: string; city?: string; lat?: number; lon?: number };
		destination: { name?: string; city?: string; lat?: number; lon?: number };
		orderStatus: string;
		shipmentStatus?: string;
		statusLabel: string;
		truck?: string;
		driver?: string;
		pickupAt?: string;
		deliveryAt?: string;
		events: { status: string; label: string; at: string }[];
		position?: { lat: number; lon: number; at: string; city?: string; source: string } | null;
		route?: [number, number][];
		distanceMeters?: number;
		durationSeconds?: number;
		updatedAt: string;
	};

	let token = $derived(($page.params as Record<string, string>).token ?? '');
	let snap = $state<Snapshot | null>(null);
	let error = $state('');
	let loading = $state(true);
	let refreshedAt = $state<Date | null>(null);

	async function load() {
		try {
			const res = await fetch(`/api/v1/orders/track/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } });
			if (!res.ok) {
				error = res.status === 404 ? 'Link tidak ditemukan atau sudah tidak berlaku.' : 'Gagal memuat status pengiriman.';
				return;
			}
			const body = await res.json();
			snap = body?.data ?? body;
			error = '';
			refreshedAt = new Date();
		} catch {
			error = 'Gagal memuat status pengiriman.';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
		const t = setInterval(load, 60_000);
		return () => clearInterval(t);
	});

	// The customer's view of the journey: six milestones, from the shipment
	// machine, with the current one highlighted.
	const STEPS = [
		{ key: 'assigned', label: 'Ditugaskan', codes: ['assigned'] },
		{ key: 'toLoading', label: 'Menuju Muat', codes: ['toLoading', 'atLoading', 'loadingApproved', 'loading'] },
		{ key: 'loaded', label: 'Selesai Muat', codes: ['loaded'] },
		{ key: 'toUnloading', label: 'Menuju Bongkar', codes: ['toUnloading', 'atUnloading', 'unloadingApproved', 'unloading'] },
		{ key: 'unloaded', label: 'Selesai Bongkar', codes: ['unloaded'] },
		{ key: 'finished', label: 'Selesai', codes: ['finished', 'completed'] }
	];
	let stepIndex = $derived.by(() => {
		if (!snap) return -1;
		const code = snap.orderStatus === 'completed' || snap.orderStatus === 'delivered' ? 'finished' : (snap.shipmentStatus || 'assigned');
		if (['draft', 'submitted', 'approved', 'readyToPlan'].includes(snap.orderStatus)) return -1;
		const i = STEPS.findIndex((s) => s.codes.includes(code));
		return i < 0 ? 0 : i;
	});
	let fillPct = $derived(stepIndex < 0 ? 0 : (stepIndex / (STEPS.length - 1)) * 100);

	const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
	const durationLabel = (s?: number) => {
		if (!s) return '—';
		const m = Math.round(s / 60);
		return m < 60 ? `${m} menit` : `${Math.floor(m / 60)} jam ${m % 60} menit`;
	};

	let markers = $derived.by<MapMarker[]>(() => {
		if (!snap) return [];
		const out: MapMarker[] = [];
		if (snap.origin?.lat && snap.origin?.lon) out.push({ id: 'origin', lat: snap.origin.lat, lng: snap.origin.lon, color: '#0B57D0', label: 'Muat', title: snap.origin.name });
		if (snap.destination?.lat && snap.destination?.lon) out.push({ id: 'dest', lat: snap.destination.lat, lng: snap.destination.lon, color: '#146C2E', label: 'Bongkar', title: snap.destination.name });
		if (snap.position) out.push({ id: 'truck', lat: snap.position.lat, lng: snap.position.lon, icon: TRUCK_MARKER.onDuty, iconWidth: 18, iconHeight: 40, label: snap.truck ?? 'Truck', title: snap.truck, subtitle: `${snap.position.city ?? ''} · ${fmt(snap.position.at)}` });
		return out;
	});
	let lines = $derived.by<MapLine[]>(() => (snap?.route?.length ? [{ id: 'plan', coordinates: snap.route, color: '#0B57D0', width: 4 }] : []));
	let fitKey = $derived(snap ? `${snap.orderNumber}|${snap.route?.length ?? 0}` : '');
</script>

<svelte:head><title>Lacak Pengiriman{snap ? ` · ${snap.orderNumber}` : ''}</title></svelte:head>

<div class="track-page">
	<header class="track-head">
		<img src={BRAND.logoWhiteWithText} alt="Karlo" class="track-logo" />
		<span class="track-head-title">Lacak Pengiriman</span>
	</header>

	<main class="track-main">
		{#if loading}
			<div class="track-card track-empty">Memuat status pengiriman…</div>
		{:else if error}
			<div class="track-card track-empty">{error}</div>
		{:else if snap}
			<section class="track-card">
				<div class="track-order-row">
					<div>
						<div class="track-eyebrow">Nomor Order</div>
						<div class="track-order-no">{snap.orderNumber}</div>
						{#if snap.shipperName}<div class="track-sub">{snap.shipperName}{#if snap.transporterName} · diangkut oleh {snap.transporterName}{/if}</div>{/if}
					</div>
					<span class="track-status">{snap.statusLabel}</span>
				</div>

				<div class="ct-journey">
					<div class="ct-journey-track">
						<div class="ct-journey-fill" style="width:{fillPct}%"></div>
						{#each STEPS as s, i (s.key)}
							<div class="ct-journey-step" class:done={i < stepIndex || (i === stepIndex && stepIndex === STEPS.length - 1)} class:current={i === stepIndex && stepIndex !== STEPS.length - 1}>
								<span class="ct-journey-dot"></span>
								<span class="ct-journey-label">{s.label}</span>
							</div>
						{/each}
					</div>
				</div>

				<div class="track-grid">
					<div class="track-stop">
						<div class="track-eyebrow"><MapPin size={12} /> Lokasi Muat</div>
						<b>{snap.origin?.name || '—'}</b>
						{#if snap.origin?.city}<span class="track-sub">{snap.origin.city}</span>{/if}
						<span class="track-sub"><Clock size={11} /> Jadwal: {fmt(snap.pickupAt)}</span>
					</div>
					<div class="track-stop">
						<div class="track-eyebrow"><PackageCheck size={12} /> Lokasi Bongkar</div>
						<b>{snap.destination?.name || '—'}</b>
						{#if snap.destination?.city}<span class="track-sub">{snap.destination.city}</span>{/if}
						<span class="track-sub"><Clock size={11} /> Estimasi: {fmt(snap.deliveryAt)}{#if snap.durationSeconds} · {durationLabel(snap.durationSeconds)} perjalanan{/if}</span>
					</div>
					<div class="track-stop">
						<div class="track-eyebrow"><Truck size={12} /> Armada</div>
						<b>{snap.truck || 'Belum ditugaskan'}</b>
						{#if snap.driver}<span class="track-sub">Pengemudi: {snap.driver}</span>{/if}
						{#if snap.position}<span class="track-sub">Posisi terakhir: {snap.position.city || `${snap.position.lat.toFixed(4)}, ${snap.position.lon.toFixed(4)}`} · {fmt(snap.position.at)}</span>{/if}
					</div>
				</div>
			</section>

			{#if markers.length}
				<section class="track-card track-map-card">
					<MapView {markers} {lines} {fitKey} height="360px" />
					{#if !snap.position}<div class="track-sub" style="padding:8px 12px;">Posisi truck ditampilkan saat pengiriman sedang berjalan.</div>{/if}
				</section>
			{/if}

			<section class="track-card">
				<div class="track-eyebrow">Riwayat</div>
				{#if snap.events.length}
					<ol class="track-events">
						{#each [...snap.events].reverse() as e (e.status + e.at)}
							<li><span class="track-event-dot"></span><span class="track-event-label">{e.label}</span><span class="track-event-at">{fmt(e.at)}</span></li>
						{/each}
					</ol>
				{:else}
					<div class="track-sub">Belum ada riwayat.</div>
				{/if}
			</section>

			<div class="track-foot">
				<RefreshCw size={11} /> Diperbarui {refreshedAt ? refreshedAt.toLocaleTimeString('id-ID') : '—'} · otomatis setiap 1 menit
			</div>
		{/if}
	</main>
</div>

<style>
	.track-page { min-height: 100vh; background: #f4f6fa; color: #1b1c1e; font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif; }
	.track-head { display: flex; align-items: center; gap: 14px; padding: 12px 20px; background: #0d2555; color: #fff; }
	.track-logo { height: 28px; }
	.track-head-title { font-size: 13px; font-weight: 600; opacity: 0.9; }
	.track-main { max-width: 860px; margin: 0 auto; padding: 20px 16px 40px; display: flex; flex-direction: column; gap: 14px; }
	.track-card { background: #fff; border: 1px solid #e3e6ec; border-radius: 14px; padding: 18px 20px; }
	.track-map-card { padding: 0; overflow: hidden; }
	.track-empty { text-align: center; color: #5b5f67; padding: 40px 20px; }
	.track-order-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
	.track-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #5b5f67; display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
	.track-order-no { font-size: 22px; font-weight: 800; font-family: 'Roboto Mono', monospace; }
	.track-sub { font-size: 12px; color: #5b5f67; display: flex; align-items: center; gap: 4px; }
	.track-status { display: inline-flex; align-items: center; padding: 6px 14px; border-radius: 999px; background: #e3ecfc; color: #0b57d0; font-weight: 700; font-size: 12.5px; white-space: nowrap; }
	.track-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
	.track-stop { display: flex; flex-direction: column; gap: 3px; padding: 12px; border: 1px solid #eef0f4; border-radius: 10px; background: #fafbfd; font-size: 13px; }
	.track-events { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
	.track-events li { display: grid; grid-template-columns: 12px 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
	.track-event-dot { width: 10px; height: 10px; border-radius: 50%; background: #146c2e; }
	.track-events li:first-child .track-event-dot { background: #0b57d0; box-shadow: 0 0 0 4px #e3ecfc; }
	.track-event-at { font-size: 12px; color: #5b5f67; white-space: nowrap; }
	.track-foot { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #5b5f67; justify-content: center; }
	@media (max-width: 640px) { .track-grid { grid-template-columns: 1fr; } }
</style>
