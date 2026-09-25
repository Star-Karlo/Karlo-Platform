<script lang="ts">
	/**
	 * The geofencing switch: ON, an arrival reported outside the warehouse's
	 * radius is refused; OFF, it is recorded with the distance and let
	 * through. The distance is stored either way, which is what makes turning
	 * it on later safe — you can look back and see how often a driver would
	 * have been blocked.
	 *
	 * Two scopes, one control. Given an `orderId` it sets that order's own
	 * answer (PUT /orders/{id}/geofencing); without one it sets the company
	 * default (PUT /companies/me). An order whose answer is unset follows the
	 * company, so the order page opens showing what will actually happen to
	 * that delivery rather than a blank switch.
	 */
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { actingFor } from '$lib/stores/actingFor';

	let {
		compact = false,
		orderId = '',
		/** The order's own answer: true, false, or null/undefined to inherit. */
		orderValue = undefined,
		onchanged
	}: {
		compact?: boolean;
		orderId?: string;
		orderValue?: boolean | null;
		onchanged?: (v: boolean) => void;
	} = $props();

	let on = $state(false);
	let inherited = $state(true);
	let saving = $state(false);

	async function load() {
		// The company default, which is what an order without its own answer
		// follows. Read even in per-order mode, so the switch shows what will
		// really happen to this delivery.
		let company = false;
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			company = res.data?.data?.settings?.finishWithGeofencing === true;
		} catch {
			company = false;
		}
		if (orderId && orderValue != null) {
			on = orderValue;
			inherited = false;
		} else {
			on = company;
			inherited = !!orderId;
		}
	}
	async function toggle() {
		if (saving) return;
		const next = !on;
		saving = true;
		try {
			if (orderId) {
				await api.put(ENDPOINTS.orders.geofencing(orderId), { enabled: next });
				inherited = false;
				toast(
					next
						? 'Geofencing aktif untuk order ini — driver harus di dalam radius gudang saat lapor tiba'
						: 'Geofencing nonaktif untuk order ini — lokasi tetap dicatat, tapi tidak menolak'
				);
			} else {
				await api.put(ENDPOINTS.companyMe, { settings: { finishWithGeofencing: next } });
				toast(
					next
						? 'Geofencing aktif — driver harus di dalam radius gudang saat lapor tiba'
						: 'Geofencing nonaktif — lokasi tetap dicatat, tapi tidak menolak'
				);
			}
			on = next;
			onchanged?.(next);
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal mengubah setelan geofencing');
		} finally {
			saving = false;
		}
	}

	// Reloads when the acting-for company changes: the setting belongs to
	// whichever company is being acted for, not to the signed-in account.
	$effect(() => {
		void $actingFor.companyId;
		void orderId;
		void orderValue;
		void load();
	});
</script>

<label
	class="geofence-toggle"
	class:compact
	title={orderId
		? `Wajibkan driver berada di dalam radius gudang saat melaporkan tiba, untuk order ini${inherited ? ' (saat ini mengikuti setelan perusahaan)' : ''}`
		: 'Setelan perusahaan: wajibkan driver berada di dalam radius gudang saat melaporkan tiba'}
>
	<span class="geofence-label">Geofencing {on ? 'ON' : 'OFF'}</span>
	{#if orderId && inherited}<span class="geofence-note">ikut perusahaan</span>{/if}
	<input type="checkbox" checked={on} disabled={saving} onchange={toggle} />
	<span class="geofence-track" class:on><span class="geofence-knob"></span></span>
</label>

<style>
	.geofence-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
	}
	.geofence-label {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--on-surface, #1b1c1e);
		white-space: nowrap;
	}
	.compact .geofence-label {
		font-size: 11.5px;
	}
	.geofence-note {
		font-size: 10.5px;
		color: var(--on-surface-variant, #6b7280);
		white-space: nowrap;
	}
	.geofence-toggle input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}
	.geofence-track {
		width: 38px;
		height: 22px;
		border-radius: 999px;
		background: var(--outline-variant, #d5d9e2);
		position: relative;
		transition: background 0.15s;
		flex: none;
	}
	.geofence-track.on {
		background: #16a34a;
	}
	.geofence-knob {
		position: absolute;
		top: 3px;
		left: 3px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
	}
	.geofence-track.on .geofence-knob {
		transform: translateX(16px);
	}
	.geofence-toggle input:focus-visible + .geofence-track {
		outline: 2px solid var(--primary, #0b57d0);
		outline-offset: 2px;
	}
	.geofence-toggle input:disabled ~ .geofence-track {
		opacity: 0.55;
	}
</style>
