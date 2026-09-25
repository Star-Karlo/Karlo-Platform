<script lang="ts">
	/**
	 * The company's geofencing switch (settings.finishWithGeofencing).
	 *
	 * ON, an arrival reported outside the warehouse's fence is refused; OFF,
	 * it is recorded with the distance and let through. Either way the
	 * distance is stored, which is what makes turning it on later safe: you
	 * can look back and see how often drivers would have been blocked.
	 *
	 * It is a COMPANY setting, not a per-order one, and it is shown on the
	 * order page as well as Control Tower because that is where people go
	 * looking for it when a driver cannot report arrival. The label says so,
	 * so nobody reads it as a switch for the order they happen to have open.
	 */
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { actingFor } from '$lib/stores/actingFor';

	let { compact = false }: { compact?: boolean } = $props();

	let on = $state(false);
	let saving = $state(false);

	async function load() {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			on = res.data?.data?.settings?.finishWithGeofencing === true;
		} catch {
			on = false;
		}
	}
	async function toggle() {
		if (saving) return;
		const next = !on;
		saving = true;
		try {
			await api.put(ENDPOINTS.companyMe, { settings: { finishWithGeofencing: next } });
			on = next;
			toast(
				next
					? 'Geofencing aktif — driver harus di dalam radius gudang saat lapor tiba'
					: 'Geofencing nonaktif — lokasi tetap dicatat, tapi tidak menolak'
			);
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
		void load();
	});
</script>

<label
	class="geofence-toggle"
	class:compact
	title="Setelan perusahaan: wajibkan driver berada di dalam radius gudang saat melaporkan tiba"
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
