<script lang="ts">
	/**
	 * Web-Field — the receiving warehouse's own page, following the Figma flow.
	 *
	 * Three steps in one route, because that is how the PIC experiences it:
	 * find the order (typed, scanned, or picked from the inbox of a signed-in
	 * PIC), prove you are standing with the driver by entering the code the
	 * DRIVER holds, then audit what arrived against what was ordered and
	 * finalise the manifest.
	 *
	 * The session token lives in sessionStorage so a dropped connection at the
	 * gate does not cost the PIC the code again. It is a credential for one
	 * delivery's audit and nothing else.
	 */
	import { onDestroy, onMount } from 'svelte';
	import {
		Truck, PackageCheck, CheckCircle2, XCircle, ScanLine, LogIn, Loader2,
		ArrowRight, ShieldCheck, Inbox, MapPin, AlertTriangle, Lock
	} from 'lucide-svelte';
	import { BRAND } from '$lib/constants/assets';

	type Site = { name?: string; address?: string; latitude?: number; longitude?: number };
	type Figures = { name?: string; weightKg?: number; volumeM3?: number; quantity?: number };
	type FieldView = {
		orderNumber: string;
		shipmentStatus: string;
		picName?: string;
		truck?: string;
		driver?: string;
		destination?: string;
		origin?: Site;
		drop?: Site;
		pickupAt?: string;
		arrivedAt?: string;
		expected?: Figures;
		actual?: Figures;
		cargoCheck?: { matches: boolean; note?: string; checkedAt: string } | null;
		pod?: { status: string; submittedAt: string } | null;
		handoverVerified: boolean;
		finalizedAt?: string;
		finalizedBy?: string;
		finalizedNote?: string;
	};
	type Lookup = {
		orderNumber: string;
		shipmentStatus: string;
		truck?: string;
		driver?: string;
		destination?: string;
		ready: boolean;
		message?: string;
	};
	type InboxRow = {
		orderNumber: string;
		shipmentStatus: string;
		truck?: string;
		driver?: string;
		destination?: string;
		arrivedAt?: string;
		ready: boolean;
	};

	const TOKEN_KEY = 'karlo-webfield-token';
	const PIC_TOKEN_KEY = 'karlo-webfield-pic-token';

	let step = $state<'entry' | 'otp' | 'sheet'>('entry');
	let busy = $state(false);
	let error = $state('');

	// Step 1 — find the order.
	let orderNumber = $state('');
	let lookup = $state<Lookup | null>(null);
	let scanning = $state(false);
	let scanError = $state('');

	// The signed-in PIC's side.
	let picToken = $state('');
	let showLogin = $state(false);
	let username = $state('');
	let password = $state('');
	let inbox = $state<InboxRow[]>([]);

	// Step 2 — the code the driver holds.
	let digits = $state(['', '', '', '', '', '']);
	let boxes: HTMLInputElement[] = [];

	// Step 3 — the audit.
	let token = $state('');
	let view = $state<FieldView | null>(null);
	let auditing = $state(false);
	let picName = $state('');
	let note = $state('');
	let actualWeight = $state('');
	let actualVolume = $state('');
	let actualQuantity = $state('');
	let confirm = $state<null | { matches: boolean }>(null);

	const headers = (auth = false): Record<string, string> => {
		const h: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
		if (auth && picToken) h.Authorization = `Bearer ${picToken}`;
		return h;
	};

	/**
	 * The services prefix a rejection with how it was classified —
	 * "validation failed: kode tidak sesuai". The classification is for the
	 * log; the PIC gets the sentence.
	 */
	const clean = (m?: string) =>
		(m ?? '').replace(/^(validation failed|forbidden|transition not allowed):\s*/i, '').trim();

	/**
	 * Every call goes to /api/v1/shipments/field/… — the endpoints sit under
	 * the shipments prefix because that is what the load balancer routes to the
	 * business service; a top-level /api/v1/field reached this console instead.
	 */
	async function call(path: string, body?: unknown, auth = false) {
		const res = await fetch(`/api/v1${path}`, {
			method: body === undefined ? 'GET' : 'POST',
			headers: headers(auth),
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const payload = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(clean(payload?.message) || 'Permintaan gagal. Coba lagi.');
		return payload?.data ?? payload;
	}

	onMount(() => {
		let params = new URLSearchParams();
		try {
			params = new URLSearchParams(location.search);
			picToken = sessionStorage.getItem(PIC_TOKEN_KEY) ?? '';
		} catch {
			/* private browsing: the PIC types the order number again, which is fine */
		}

		const order = params.get('order') ?? '';
		const linkCode = (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6);
		const token = params.get('token') ?? sessionStorage.getItem(TOKEN_KEY) ?? '';

		if (order && linkCode.length === 6) {
			// The dedicated link from the arrival message: order number and
			// code both in hand, so the PIC should land on the audit rather
			// than retype what they were just sent.
			orderNumber = order;
			digits = linkCode.split('');
			void openFromLink();
		} else if (token) {
			void openSession(token);
		} else if (order) {
			orderNumber = order;
			void find();
		}
		if (picToken) void loadInbox();
	});

	/**
	 * Look the order up and verify in one go, for a link that carries both.
	 *
	 * A PIC often opens the message before the driver has entered the code in
	 * K-Trip, so the page waits for them rather than making the PIC come back
	 * to it: the banner explains what is missing, and this keeps checking
	 * until the driver is done.
	 */
	async function openFromLink() {
		await find();
		if (lookup?.ready) {
			await verify();
			return;
		}
		const poll = setInterval(async () => {
			if (step !== 'otp' || busy) return;
			try {
				lookup = await call('/shipments/field/lookup', { orderNumber: orderNumber.trim() });
			} catch {
				return;
			}
			if (lookup?.ready) {
				clearInterval(poll);
				await verify();
			}
		}, 15_000);
		onDestroyPolls.push(poll);
	}

	const onDestroyPolls: ReturnType<typeof setInterval>[] = [];
	onDestroy(() => onDestroyPolls.forEach(clearInterval));

	// --- step 1 ---------------------------------------------------------------
	async function find() {
		if (busy || !orderNumber.trim()) return;
		busy = true;
		error = '';
		try {
			lookup = await call('/shipments/field/lookup', { orderNumber: orderNumber.trim() });
			step = 'otp';
			digits = ['', '', '', '', '', ''];
			queueMicrotask(() => boxes[0]?.focus());
		} catch (e: any) {
			error = e.message;
			lookup = null;
		} finally {
			busy = false;
		}
	}

	/**
	 * QR scan. The driver's screen shows a code carrying the order number, so
	 * this is a shortcut for typing — never a way past the OTP.
	 */
	async function scan() {
		scanError = '';
		const Detector = (window as any).BarcodeDetector;
		if (!Detector) {
			scanError = 'Perangkat ini tidak mendukung pemindaian. Masukkan nomor order secara manual.';
			return;
		}
		let stream: MediaStream | undefined;
		try {
			scanning = true;
			stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
			const video = document.getElementById('wf-video') as HTMLVideoElement;
			video.srcObject = stream;
			await video.play();
			const detector = new Detector({ formats: ['qr_code'] });
			const deadline = Date.now() + 30_000;
			while (scanning && Date.now() < deadline) {
				const found = await detector.detect(video).catch(() => []);
				if (found.length) {
					orderNumber = String(found[0].rawValue ?? '').trim().slice(0, 64);
					stopScan(stream);
					await find();
					return;
				}
				await new Promise((r) => setTimeout(r, 250));
			}
			scanError = 'Tidak ada QR yang terbaca.';
		} catch {
			scanError = 'Kamera tidak dapat dibuka. Masukkan nomor order secara manual.';
		} finally {
			stopScan(stream);
		}
	}
	function stopScan(stream?: MediaStream) {
		scanning = false;
		stream?.getTracks().forEach((t) => t.stop());
	}

	async function login() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const data = await call('/auth/login', { email: username.trim(), password });
			picToken = data?.token ?? '';
			if (!picToken) throw new Error('Login gagal.');
			sessionStorage.setItem(PIC_TOKEN_KEY, picToken);
			showLogin = false;
			password = '';
			await loadInbox();
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}
	async function loadInbox() {
		try {
			inbox = (await call('/shipments/field/inbox', undefined, true)) ?? [];
		} catch {
			inbox = [];
		}
	}

	// --- step 2 ---------------------------------------------------------------
	let code = $derived(digits.join(''));
	function onDigit(i: number, e: Event) {
		const el = e.target as HTMLInputElement;
		const v = el.value.replace(/\D/g, '');
		if (v.length > 1) {
			// A pasted code fills the row.
			v.split('').slice(0, 6 - i).forEach((d, k) => (digits[i + k] = d));
			boxes[Math.min(i + v.length, 5)]?.focus();
		} else {
			digits[i] = v;
			if (v) boxes[i + 1]?.focus();
		}
		el.value = digits[i];
	}
	function onKey(i: number, e: KeyboardEvent) {
		if (e.key === 'Backspace' && !digits[i] && i > 0) boxes[i - 1]?.focus();
	}
	async function verify() {
		if (busy || code.length !== 6) return;
		busy = true;
		error = '';
		try {
			const path = picToken ? '/shipments/field/open' : '/shipments/field/verify';
			const data = await call(path, { orderNumber: lookup?.orderNumber ?? orderNumber.trim(), code }, !!picToken);
			await openSession(data.token);
		} catch (e: any) {
			error = e.message;
			digits = ['', '', '', '', '', ''];
			boxes[0]?.focus();
		} finally {
			busy = false;
		}
	}

	// --- step 3 ---------------------------------------------------------------
	async function openSession(t: string) {
		try {
			view = await call(`/shipments/field/session/${encodeURIComponent(t)}`);
			token = t;
			sessionStorage.setItem(TOKEN_KEY, t);
			step = 'sheet';
			error = '';
			if (view?.picName && !picName) picName = view.picName;
			if (view?.actual) {
				actualWeight = view.actual.weightKg?.toString() ?? '';
				actualVolume = view.actual.volumeM3?.toString() ?? '';
				actualQuantity = view.actual.quantity?.toString() ?? '';
			}
		} catch (e: any) {
			error = e.message;
			sessionStorage.removeItem(TOKEN_KEY);
		}
	}

	const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
	async function submitAudit(matches: boolean) {
		if (busy) return;
		busy = true;
		error = '';
		try {
			view = await call(`/shipments/field/session/${encodeURIComponent(token)}/audit`, {
				matches,
				note: note.trim(),
				picName: picName.trim(),
				weightKg: num(actualWeight),
				volumeM3: num(actualVolume),
				quantity: num(actualQuantity)
			});
			confirm = null;
			auditing = false;
		} catch (e: any) {
			error = e.message;
			confirm = null;
		} finally {
			busy = false;
		}
	}
	async function finalize() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			view = await call(`/shipments/field/session/${encodeURIComponent(token)}/finalize`, {
				picName: picName.trim(),
				note: note.trim()
			});
		} catch (e: any) {
			error = e.message;
		} finally {
			busy = false;
		}
	}
	function leave() {
		sessionStorage.removeItem(TOKEN_KEY);
		token = '';
		view = null;
		lookup = null;
		orderNumber = '';
		step = 'entry';
	}

	const STATUS_LABEL: Record<string, string> = {
		toUnloading: 'Menuju titik bongkar',
		atUnloading: 'Sampai di titik bongkar',
		unloading: 'Proses bongkar',
		unloaded: 'POD bongkar terverifikasi',
		finished: 'Selesai shipment'
	};
	const fmt = (iso?: string) =>
		iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
	const coord = (s?: Site) =>
		s?.latitude && s?.longitude ? `${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)}` : '—';
	const qty = (v?: number, unit = '') => (v == null ? '—' : `${v.toLocaleString('id-ID')}${unit}`);

	let canAudit = $derived(!!view && view.shipmentStatus === 'unloading' && !view.finalizedAt);
	let canFinalize = $derived(!!view?.cargoCheck && !view?.finalizedAt);
	let diff = $derived.by(() => {
		const e = view?.expected ?? {};
		const a = view?.actual ?? {};
		const rows: { label: string; expected?: number; actual?: number; unit: string }[] = [
			{ label: 'Total berat', expected: e.weightKg, actual: a.weightKg, unit: ' kg' },
			{ label: 'Total volume', expected: e.volumeM3, actual: a.volumeM3, unit: ' m³' },
			{ label: 'Total kuantitas', expected: e.quantity, actual: a.quantity, unit: '' }
		];
		return rows.filter((r) => r.expected != null || r.actual != null);
	});
</script>

<svelte:head><title>Web-Field{view ? ` · ${view.orderNumber}` : ''}</title></svelte:head>

<div class="wf">
	<header class="wf-head">
		<img src={BRAND.logoWhiteWithText} alt="Karlo" class="wf-logo" />
		<span class="wf-head-title">Web-Field</span>
		<span class="wf-head-sub">Verifikasi &amp; audit muatan oleh PIC gudang</span>
	</header>

	<main class="wf-main">
		{#if step === 'entry'}
			<section class="wf-card wf-hero">
				<h1>Satu halaman untuk serah terima di gerbang gudang.</h1>
				<p class="wf-sub">
					Masukkan nomor order yang tertera pada surat jalan, atau pindai QR pada layar driver.
				</p>
				<label class="wf-label" for="orderNumber">Nomor Order</label>
				<input
					id="orderNumber"
					class="wf-input wf-mono"
					bind:value={orderNumber}
					placeholder="ORD-…"
					autocomplete="off"
					onkeydown={(e) => e.key === 'Enter' && find()}
				/>
				{#if error}<p class="wf-error">{error}</p>{/if}
				<div class="wf-actions">
					<button class="wf-btn wf-btn-ghost" type="button" onclick={scan} disabled={busy || scanning}>
						<ScanLine size={16} /> Pindai QR Code
					</button>
					<button class="wf-btn wf-btn-primary" type="button" onclick={find} disabled={busy || !orderNumber.trim()}>
						{#if busy}<Loader2 size={16} class="wf-spin" />{:else}<ArrowRight size={16} />{/if} Selanjutnya
					</button>
				</div>
				{#if scanning}
					<div class="wf-scan">
						<video id="wf-video" playsinline muted></video>
						<button class="wf-btn wf-btn-ghost" type="button" onclick={() => stopScan()}>Batal</button>
					</div>
				{/if}
				{#if scanError}<p class="wf-error">{scanError}</p>{/if}
			</section>

			<section class="wf-card">
				<div class="wf-eyebrow"><Inbox size={12} /> PIC gudang terdaftar</div>
				{#if !picToken}
					<p class="wf-sub">
						Masuk dengan akun PIC untuk melihat daftar kedatangan di gudang Anda. Kode OTP dari driver
						tetap diperlukan untuk membuka audit.
					</p>
					{#if showLogin}
						<label class="wf-label" for="wf-user">Email atau username</label>
						<input id="wf-user" class="wf-input" bind:value={username} autocomplete="username" />
						<label class="wf-label" for="wf-pass">Password</label>
						<input id="wf-pass" class="wf-input" type="password" bind:value={password} autocomplete="current-password" onkeydown={(e) => e.key === 'Enter' && login()} />
						<div class="wf-actions">
							<button class="wf-btn wf-btn-ghost" type="button" onclick={() => (showLogin = false)}>Batal</button>
							<button class="wf-btn wf-btn-primary" type="button" onclick={login} disabled={busy}>
								<LogIn size={16} /> Masuk
							</button>
						</div>
					{:else}
						<button class="wf-btn wf-btn-ghost wf-self" type="button" onclick={() => (showLogin = true)}>
							<LogIn size={16} /> Masuk sebagai PIC gudang
						</button>
					{/if}
				{:else if inbox.length === 0}
					<p class="wf-sub">Belum ada truk yang menuju atau berada di gudang Anda.</p>
				{:else}
					<ul class="wf-inbox">
						{#each inbox as row (row.orderNumber)}
							<li>
								<button
									type="button"
									onclick={() => {
										orderNumber = row.orderNumber;
										find();
									}}
								>
									<span class="wf-mono">{row.orderNumber}</span>
									<span class="wf-sub">{row.truck ?? '—'} · {STATUS_LABEL[row.shipmentStatus] ?? row.shipmentStatus}</span>
									<span class="wf-pill" class:ok={row.ready}>{row.ready ? 'Siap diverifikasi' : 'Menunggu driver'}</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}

		{#if step === 'otp' && lookup}
			<section class="wf-card">
				<div class="wf-eyebrow">Nomor Order</div>
				<div class="wf-order-no">{lookup.orderNumber}</div>
				<div class="wf-grid">
					<div>
						<div class="wf-eyebrow"><Truck size={12} /> Armada</div>
						<b>{lookup.truck || '—'}</b><span class="wf-sub">{lookup.driver ? `Pengemudi: ${lookup.driver}` : ''}</span>
					</div>
					<div>
						<div class="wf-eyebrow"><PackageCheck size={12} /> Gudang bongkar</div>
						<b>{lookup.destination || '—'}</b>
					</div>
				</div>
			</section>

			<section class="wf-card">
				<div class="wf-lock"><Lock size={22} /></div>
				<h2>Masukan Kode OTP</h2>
				<p class="wf-sub">Kode OTP yang diterima oleh driver. Minta driver membacakannya.</p>
				{#if !lookup.ready}
					<div class="wf-banner">
						<AlertTriangle size={18} />
						<div>
							<b>Belum bisa verifikasi muatan</b>
							<p>{lookup.message}</p>
						</div>
					</div>
				{/if}
				<div class="wf-otp">
					{#each digits as d, i (i)}
						<input
							bind:this={boxes[i]}
							class="wf-otp-box"
							inputmode="numeric"
							maxlength="6"
							value={d}
							disabled={!lookup.ready || busy}
							oninput={(e) => onDigit(i, e)}
							onkeydown={(e) => onKey(i, e)}
							aria-label={`Digit ${i + 1}`}
						/>
					{/each}
				</div>
				{#if error}<p class="wf-error">{error}</p>{/if}
				<div class="wf-actions">
					<button class="wf-btn wf-btn-ghost" type="button" onclick={leave}>Ganti order</button>
					<button class="wf-btn wf-btn-primary" type="button" onclick={verify} disabled={busy || code.length !== 6 || !lookup.ready}>
						{#if busy}<Loader2 size={16} class="wf-spin" />{:else}<ShieldCheck size={16} />{/if} Konfirmasi
					</button>
				</div>
			</section>
		{/if}

		{#if step === 'sheet' && view}
			{#if view.finalizedAt}
				<div class="wf-final">
					<CheckCircle2 size={18} /> Proses audit selesai · {fmt(view.finalizedAt)}
					{#if view.finalizedBy}<span class="wf-sub">oleh {view.finalizedBy}</span>{/if}
				</div>
			{/if}

			<section class="wf-card">
				<div class="wf-eyebrow">Nomor Order</div>
				<div class="wf-order-no">{view.orderNumber}</div>
				<div class="wf-status">{STATUS_LABEL[view.shipmentStatus] ?? view.shipmentStatus}</div>
				<div class="wf-grid">
					<div><div class="wf-eyebrow">Jadwal muat</div><b>{fmt(view.pickupAt)}</b></div>
					<div><div class="wf-eyebrow">Jam tiba di gudang</div><b>{fmt(view.arrivedAt)}</b></div>
					<div><div class="wf-eyebrow"><Truck size={12} /> Armada</div><b>{view.truck || '—'}</b></div>
					<div><div class="wf-eyebrow">Pengemudi</div><b>{view.driver || '—'}</b></div>
				</div>
			</section>

			<section class="wf-card">
				<div class="wf-eyebrow"><MapPin size={12} /> Informasi titik muat</div>
				<b>{view.origin?.name || '—'}</b>
				<span class="wf-sub">{view.origin?.address || ''}</span>
				<span class="wf-sub wf-mono">{coord(view.origin)}</span>
				<hr class="wf-rule" />
				<div class="wf-eyebrow"><MapPin size={12} /> Informasi titik bongkar</div>
				<b>{view.drop?.name || view.destination || '—'}</b>
				<span class="wf-sub">{view.drop?.address || ''}</span>
				<span class="wf-sub wf-mono">{coord(view.drop)}</span>
			</section>

			<section class="wf-card">
				<div class="wf-eyebrow">Audit data muat &amp; bongkar</div>
				{#if view.cargoCheck}
					<div class="wf-answer" class:ok={view.cargoCheck.matches} class:bad={!view.cargoCheck.matches}>
						{#if view.cargoCheck.matches}<CheckCircle2 size={18} /> Data bongkar sesuai muat{:else}<XCircle size={18} /> Data bongkar tidak sesuai muat{/if}
						<span class="wf-sub">· {fmt(view.cargoCheck.checkedAt)}</span>
					</div>
					{#if view.cargoCheck.note}<p class="wf-note">{view.cargoCheck.note}</p>{/if}
				{/if}

				<table class="wf-table">
					<thead><tr><th>Detail muatan</th><th>Data muat</th><th>Data bongkar</th></tr></thead>
					<tbody>
						{#each diff as row (row.label)}
							<tr>
								<td>{row.label}</td>
								<td>{qty(row.expected, row.unit)}</td>
								<td class:wf-gap={row.actual != null && row.expected != null && row.actual !== row.expected}>
									{qty(row.actual, row.unit)}
								</td>
							</tr>
						{/each}
						{#if diff.length === 0}
							<tr><td colspan="3" class="wf-sub">Rincian muatan tidak tersedia pada order ini.</td></tr>
						{/if}
					</tbody>
				</table>

				{#if !canAudit && !view.cargoCheck}
					<p class="wf-sub">
						{#if view.shipmentStatus === 'atUnloading'}Audit dibuka setelah driver memasukkan Kode OTP di K-Trip.{:else}Audit tidak tersedia pada tahap ini.{/if}
					</p>
				{/if}

				{#if canAudit && !auditing}
					<button class="wf-btn wf-btn-primary wf-self" type="button" onclick={() => (auditing = true)}>
						<PackageCheck size={16} /> {view.cargoCheck ? 'Perbarui audit data' : 'Mulai audit data'}
					</button>
				{/if}

				{#if canAudit && auditing}
					<div class="wf-audit">
						<label class="wf-label" for="wf-pic">Nama PIC</label>
						<input id="wf-pic" class="wf-input" bind:value={picName} placeholder="Nama Anda" />
						<div class="wf-three">
							<div>
								<label class="wf-label" for="wf-w">Berat diterima (kg)</label>
								<input id="wf-w" class="wf-input" inputmode="decimal" bind:value={actualWeight} />
							</div>
							<div>
								<label class="wf-label" for="wf-v">Volume diterima (m³)</label>
								<input id="wf-v" class="wf-input" inputmode="decimal" bind:value={actualVolume} />
							</div>
							<div>
								<label class="wf-label" for="wf-q">Kuantitas diterima</label>
								<input id="wf-q" class="wf-input" inputmode="decimal" bind:value={actualQuantity} />
							</div>
						</div>
						<label class="wf-label" for="wf-note">Catatan (wajib bila tidak sesuai)</label>
						<textarea id="wf-note" class="wf-input" rows="3" bind:value={note} placeholder="Mis. 2 koli rusak, kurang 5 karung"></textarea>
						{#if error}<p class="wf-error">{error}</p>{/if}
						<div class="wf-actions">
							<button class="wf-btn wf-btn-bad" type="button" disabled={busy || !note.trim()} onclick={() => (confirm = { matches: false })}>
								<XCircle size={16} /> Konfirmasi data tidak sesuai
							</button>
							<button class="wf-btn wf-btn-primary" type="button" disabled={busy} onclick={() => (confirm = { matches: true })}>
								<CheckCircle2 size={16} /> Konfirmasi data sesuai
							</button>
						</div>
					</div>
				{/if}
			</section>

			<section class="wf-card">
				<div class="wf-eyebrow">Finalisasi manifest</div>
				{#if view.finalizedAt}
					<p class="wf-sub">
						Manifest difinalisasi {fmt(view.finalizedAt)}{view.finalizedBy ? ` oleh ${view.finalizedBy}` : ''}. Data
						bongkar tidak dapat diubah lagi dari halaman ini.
					</p>
					{#if view.pod}<p class="wf-sub">Status POD bongkar: <b>{view.pod.status}</b>.</p>{/if}
					<button class="wf-btn wf-btn-ghost wf-self" type="button" onclick={leave}>Selesai</button>
				{:else}
					<p class="wf-sub">
						Finalisasi mengunci data bongkar dan tidak dapat dibatalkan. Lakukan setelah seluruh muatan
						selesai dihitung.
					</p>
					{#if error}<p class="wf-error">{error}</p>{/if}
					<button class="wf-btn wf-btn-primary wf-self" type="button" disabled={busy || !canFinalize} onclick={finalize}>
						<ShieldCheck size={16} /> Finalisasi manifest
					</button>
					{#if !canFinalize}<p class="wf-sub">Isi audit data terlebih dahulu.</p>{/if}
				{/if}
			</section>
		{/if}
	</main>

	{#if confirm}
		<div class="wf-modal-wrap" role="presentation">
			<div class="wf-modal" role="dialog" aria-modal="true" aria-label="Konfirmasi pengauditan data">
				<h3>Konfirmasi pengauditan data</h3>
				<p>
					Anda akan mencatat muatan order <b>{view?.orderNumber}</b> sebagai
					<b>{confirm.matches ? 'sesuai' : 'tidak sesuai'}</b>. Hasil ini dikirim ke transporter dan menjadi
					dasar verifikasi POD bongkar.
				</p>
				<div class="wf-actions">
					<button class="wf-btn wf-btn-ghost" type="button" onclick={() => (confirm = null)}>Batal</button>
					<button class="wf-btn wf-btn-primary" type="button" disabled={busy} onclick={() => submitAudit(confirm!.matches)}>
						Lanjutkan
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.wf {
		min-height: 100vh;
		background: #f4f6fa;
		color: #1b1c1e;
		font-family: 'Poppins', 'Segoe UI', system-ui, sans-serif;
	}
	.wf-head {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		padding: 12px 20px;
		background: #0d2555;
		color: #fff;
	}
	.wf-logo { height: 28px; }
	.wf-head-title { font-size: 14px; font-weight: 700; }
	.wf-head-sub { font-size: 12px; opacity: 0.8; }
	.wf-main {
		max-width: 680px;
		margin: 0 auto;
		padding: 20px 16px 48px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.wf-card {
		background: #fff;
		border: 1px solid #e3e6ec;
		border-radius: 14px;
		padding: 18px 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.wf-hero h1 { margin: 0; font-size: 20px; line-height: 1.35; text-wrap: balance; }
	.wf-card h2 { margin: 0; font-size: 17px; }
	.wf-eyebrow {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: #5b5f67;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.wf-sub { font-size: 12.5px; color: #5b5f67; }
	.wf-mono { font-family: 'Roboto Mono', ui-monospace, monospace; }
	.wf-order-no { font-size: 22px; font-weight: 800; font-family: 'Roboto Mono', ui-monospace, monospace; }
	.wf-status {
		align-self: flex-start;
		padding: 5px 12px;
		border-radius: 999px;
		background: #e3ecfc;
		color: #0b57d0;
		font-weight: 700;
		font-size: 12.5px;
	}
	.wf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; font-size: 13px; }
	.wf-grid > div {
		display: flex;
		flex-direction: column;
		gap: 3px;
		padding: 12px;
		border: 1px solid #eef0f4;
		border-radius: 10px;
		background: #fafbfd;
	}
	.wf-label { font-size: 12px; font-weight: 600; margin-top: 6px; }
	.wf-input {
		width: 100%;
		box-sizing: border-box;
		padding: 11px 12px;
		border: 1px solid #d5d9e2;
		border-radius: 10px;
		font: inherit;
		font-size: 14px;
		background: #fff;
	}
	.wf-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
	.wf-self { align-self: flex-start; }
	.wf-btn {
		flex: 1;
		min-width: 150px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 13px 16px;
		border-radius: 12px;
		border: 1px solid transparent;
		font: inherit;
		font-weight: 700;
		font-size: 14.5px;
		cursor: pointer;
	}
	.wf-btn-primary { background: #0b57d0; color: #fff; }
	.wf-btn-ghost { background: #fff; color: #0d2555; border-color: #d5d9e2; }
	.wf-btn-bad { background: #fce8e6; color: #b3261e; }
	.wf-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.wf-lock {
		align-self: center;
		display: grid;
		place-items: center;
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: #e3ecfc;
		color: #0b57d0;
		margin-bottom: 4px;
	}
	.wf-otp { display: flex; gap: 8px; margin-top: 10px; }
	.wf-otp-box {
		flex: 1;
		min-width: 0;
		text-align: center;
		font-size: 22px;
		font-weight: 700;
		padding: 12px 0;
		border: 1px solid #d5d9e2;
		border-radius: 12px;
		font-family: 'Roboto Mono', ui-monospace, monospace;
		background: #fff;
	}
	.wf-banner {
		display: flex;
		gap: 10px;
		padding: 12px 14px;
		border-radius: 12px;
		background: #fef7e0;
		color: #7a5900;
		border: 1px solid #f7d992;
		font-size: 12.5px;
	}
	.wf-banner p { margin: 2px 0 0; }
	.wf-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
	.wf-table th {
		text-align: left;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #5b5f67;
		padding: 6px 0;
		border-bottom: 1px solid #e3e6ec;
	}
	.wf-table td { padding: 8px 0; border-bottom: 1px solid #eef0f4; }
	.wf-table td:not(:first-child) { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
	.wf-gap { color: #b3261e; }
	.wf-answer { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14.5px; }
	.wf-answer.ok { color: #146c2e; }
	.wf-answer.bad { color: #b45309; }
	.wf-note { margin: 0; padding: 10px 12px; background: #fafbfd; border-radius: 10px; font-size: 13px; }
	.wf-final {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		border-radius: 12px;
		background: #e6f4ea;
		color: #146c2e;
		font-weight: 700;
		font-size: 13.5px;
	}
	.wf-audit { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
	.wf-three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
	.wf-rule { border: 0; border-top: 1px solid #eef0f4; margin: 10px 0; width: 100%; }
	.wf-error { color: #b3261e; font-size: 12.5px; margin: 4px 0 0; }
	.wf-inbox { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
	.wf-inbox button {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 10px;
		text-align: left;
		padding: 12px 14px;
		border: 1px solid #e3e6ec;
		border-radius: 12px;
		background: #fafbfd;
		font: inherit;
		cursor: pointer;
	}
	.wf-inbox .wf-sub { grid-column: 1; }
	.wf-pill {
		grid-row: 1 / span 2;
		grid-column: 2;
		align-self: center;
		padding: 4px 10px;
		border-radius: 999px;
		background: #eef0f4;
		color: #5b5f67;
		font-size: 11.5px;
		font-weight: 700;
	}
	.wf-pill.ok { background: #e6f4ea; color: #146c2e; }
	.wf-scan { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
	.wf-scan video { width: 100%; border-radius: 12px; background: #000; aspect-ratio: 4 / 3; object-fit: cover; }
	.wf-modal-wrap {
		position: fixed;
		inset: 0;
		background: rgba(13, 37, 85, 0.45);
		display: grid;
		place-items: center;
		padding: 16px;
		z-index: 50;
	}
	.wf-modal {
		background: #fff;
		border-radius: 16px;
		padding: 22px;
		max-width: 420px;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.wf-modal h3 { margin: 0; font-size: 17px; }
	.wf-modal p { margin: 0; font-size: 13.5px; color: #3c4043; }
	:global(.wf-spin) { animation: wf-spin 1s linear infinite; }
	@keyframes wf-spin { to { transform: rotate(360deg); } }
	@media (max-width: 520px) {
		.wf-grid, .wf-three { grid-template-columns: 1fr; }
		.wf-btn { flex: 1 1 100%; }
	}
</style>
