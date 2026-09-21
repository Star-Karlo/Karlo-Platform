<script lang="ts">
	/**
	 * TEMPORARY — Mode Uji (end-to-end testing).
	 *
	 * Walks an order through every status without the driver app: the
	 * order's own steps, then the shipment's driver/warehouse steps, then the
	 * closing order steps. The X-Status-Bypass header (see api.ts) is what
	 * lets a company Administrator take the driver's steps; the services
	 * still enforce tenancy. Remove together with the header once testing
	 * is over.
	 */
	import { onMount } from 'svelte';
	import { FlaskConical, ChevronRight, FastForward } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';

	let {
		orderId,
		basePath = '/t',
		onchanged
	}: { orderId: string; basePath?: string; onchanged?: () => void } = $props();

	let testMode = $state(false);
	let stepping = $state(false);
	let order = $state<any>(null);
	let shipment = $state<{ id: string; statusCode: string } | null>(null);
	let next = $state<{ kind: 'order' | 'shipment' | 'assign' | 'done'; status?: string; label: string } | null>(null);

	/** Never stepped into automatically — they end or unwind the order. */
	const SKIP = new Set(['cancelled', 'cancelRequested', 'rejected', 'readyToPlan']);

	onMount(() => {
		testMode = api.testMode();
		if (testMode) void compute();
	});
	function toggle() {
		testMode = !testMode;
		api.setTestMode(testMode);
		if (testMode) void compute();
	}
	async function compute() {
		next = null;
		shipment = null;
		try {
			order = (await api.get(ENDPOINTS.orders.one(orderId))).data?.data ?? null;
		} catch {
			order = null;
		}
		const o = order;
		if (!o) return;
		if (o.statusCode === 'approved' || o.statusCode === 'readyToPlan') {
			next = { kind: 'assign', label: 'Tugaskan truck dulu di Planner → Allocate' };
			return;
		}
		if (o.statusCode === 'assigned' || o.statusCode === 'inTransit') {
			try {
				const sh = (await api.get(ENDPOINTS.orders.shipment(o.id))).data?.data;
				if (sh?.id) {
					shipment = { id: sh.id, statusCode: sh.statusCode };
					const tr = (await api.get(ENDPOINTS.shipments.transitions(sh.id))).data?.data?.transitions ?? [];
					const t = tr.find((x: any) => x.status !== 'cancelled');
					if (t) {
						next = { kind: 'shipment', status: t.status, label: `${t.label ?? t.alias} (shipment)` };
						return;
					}
				}
			} catch {
				/* fall through to the order's own transitions */
			}
		}
		try {
			const tr = (await api.get(ENDPOINTS.orders.transitions(o.id))).data?.data?.transitions ?? [];
			const t = tr.find((x: any) => !SKIP.has(x.status));
			next = t
				? { kind: 'order', status: t.status, label: t.label ?? t.alias }
				: { kind: 'done', label: o.statusCode === 'completed' ? 'Order selesai' : 'Tidak ada langkah berikutnya' };
		} catch {
			next = { kind: 'done', label: 'Tidak ada langkah berikutnya' };
		}
	}
	async function step(): Promise<boolean> {
		const n = next;
		if (!n?.status) return false;
		stepping = true;
		try {
			if (n.kind === 'shipment' && shipment) {
				// Arrival steps need a position, as the driver app would send one.
				// Mode Uji reports the warehouse's own point, so the geofence
				// check passes the way a real arrival would.
				const body: Record<string, unknown> = { status: n.status, note: 'Mode Uji' };
				if (n.status === 'atLoading' || n.status === 'atUnloading') {
					const whId = n.status === 'atLoading' ? order?.originWarehouseId : order?.destinationWarehouseId;
					if (whId) {
						try {
							const wh = (await api.get(ENDPOINTS.warehouses.one(whId))).data?.data;
							if (wh?.latitude != null && wh?.longitude != null) {
								body.latitude = wh.latitude;
								body.longitude = wh.longitude;
							}
						} catch {
							/* fall through: the server says what it needs */
						}
					}
					if (body.latitude == null) {
						toast('Gudang tidak punya koordinat — isi titik gudang dulu di MyWarehouse');
						return false;
					}
				}
				await api.put(ENDPOINTS.shipments.status(shipment.id), body);
			} else if (n.kind === 'order') {
				await api.put(ENDPOINTS.orders.status(orderId), { status: n.status, note: 'Mode Uji' });
			}
			await compute();
			onchanged?.();
			return true;
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Langkah gagal');
			return false;
		} finally {
			stepping = false;
		}
	}
	async function runToEnd() {
		for (let i = 0; i < 20; i++) {
			if (!next?.status) break;
			if (!(await step())) break;
		}
		toast(`Berhenti di: ${order?.statusAlias ?? order?.statusCode}${shipment ? ` / shipment ${shipment.statusCode}` : ''}`);
	}
</script>

<div class="test-mode-strip">
	<label class="test-mode-toggle">
		<input type="checkbox" checked={testMode} onchange={toggle} />
		<FlaskConical size={14} /> <b>Mode Uji</b>
		<span class="hint">sementara — lewati status untuk testing end-to-end (Administrator / Karlo)</span>
	</label>
	{#if testMode}
		<div class="test-mode-body">
			{#if order}
				<span class="hint">
					Order: <b>{order.statusAlias ?? order.statusCode}</b>{#if shipment} · Shipment: <b>{shipment.statusCode}</b>{/if}
				</span>
			{/if}
			{#if next?.status}
				<button type="button" class="btn btn-primary btn-sm" disabled={stepping} onclick={step}>
					<ChevronRight size={14} /> {stepping ? 'Memproses…' : `Berikutnya: ${next.label}`}
				</button>
				<button type="button" class="btn btn-outline btn-sm" disabled={stepping} onclick={runToEnd}>
					<FastForward size={14} /> Jalankan sampai selesai
				</button>
			{:else if next}
				<span class="hint">{next.label}</span>
				{#if next.kind === 'assign'}<a class="btn btn-outline btn-sm" href="{basePath}/planner">Buka Allocate</a>{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.test-mode-strip {
		border: 1px dashed #b45309;
		border-radius: 10px;
		padding: 8px 12px;
		margin-bottom: 16px;
		background: #fffbeb;
		font-size: 12px;
	}
	.test-mode-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}
	.test-mode-body {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
	}
</style>
