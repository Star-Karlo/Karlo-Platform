<script lang="ts">
	/**
	 * The geofencing switch: ON, an arrival reported outside the warehouse's
	 * radius is refused; OFF, it is recorded with the distance and let
	 * through. The distance is stored either way, which is what makes turning
	 * it on later safe — you can look back and see how often a driver would
	 * have been blocked.
	 *
	 * Per order, and only per order: the company-wide switch it replaced is
	 * gone, because a fenced distribution yard and a roadside drop happen on
	 * the same day and a single company answer was wrong for one of them. An
	 * order nobody has decided about is not enforced, so the switch opens OFF
	 * and means exactly what it says for this delivery.
	 */
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';

	let {
		compact = false,
		orderId,
		/** The order's own answer; null or undefined means nobody has decided. */
		orderValue = undefined,
		onchanged
	}: {
		compact?: boolean;
		orderId: string;
		orderValue?: boolean | null;
		onchanged?: (v: boolean) => void;
	} = $props();

	let saving = $state(false);
	let on = $derived(orderValue === true);

	async function toggle() {
		if (saving || !orderId) return;
		const next = !on;
		saving = true;
		try {
			await api.put(ENDPOINTS.orders.geofencing(orderId), { enabled: next });
			toast(
				next
					? 'Geofencing aktif untuk order ini — driver harus di dalam radius gudang saat lapor tiba'
					: 'Geofencing nonaktif untuk order ini — lokasi tetap dicatat, tapi tidak menolak'
			);
			onchanged?.(next);
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal mengubah setelan geofencing');
		} finally {
			saving = false;
		}
	}
</script>

<label
	class="geofence-toggle"
	class:compact
	title="Wajibkan driver berada di dalam radius gudang saat melaporkan tiba, untuk order ini"
>
	<span class="geofence-label">Geofencing {on ? 'ON' : 'OFF'}</span>
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
