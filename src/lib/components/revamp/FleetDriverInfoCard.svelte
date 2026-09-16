<script lang="ts">
	/**
	 * Port of the prototype's FleetDriverInfoCard.vue — the assigned truck +
	 * driver card. `bare` skips the "Informasi Armada & Pengemudi" wrapper
	 * (Linimasa Order: plain assignment view with username + Ditugaskan pill).
	 */
	import { Signal } from 'lucide-svelte';
	import { initials } from '$lib/revamp/initials.js';
	import { formatPhoneDisplay } from '$lib/revamp/phone.js';

	let {
		truckPlate = '',
		truckType = '',
		truckCapacity = '',
		driverName = '',
		driverUsername = '',
		driverPhone = '',
		bare = false
	}: {
		truckPlate?: string;
		truckType?: string;
		truckCapacity?: string;
		driverName?: string;
		driverUsername?: string;
		driverPhone?: string;
		bare?: boolean;
	} = $props();

	let truckTypeLabel = $derived(truckCapacity ? `${truckType || '-'} - ${truckCapacity}` : truckType || '-');
</script>

{#if bare}
	<div class="fleet-inner fleet-inner--bare">
		{#if truckPlate}
			<div class="fleet-row">
				<span class="fleet-plate">{truckPlate}</span>
				<span class="fleet-dot">•</span>
				<span class="fleet-type">{truckTypeLabel}</span>
				<span class="fleet-gps-pill"><span class="icon-wrap"><Signal size={14} /></span> GPS Aktif</span>
				<span class="badge badge-active">Ditugaskan</span>
			</div>
			<div class="fleet-driver-row">
				<div class="fleet-driver-avatar fleet-driver-avatar--plain"></div>
				<div>
					<div class="fleet-driver-username">{driverUsername || driverName || '-'}</div>
					{#if driverPhone}
						<div class="fleet-driver-phone">{formatPhoneDisplay(driverPhone)}</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="fleet-empty">
				<span class="fleet-empty-icon">🚚</span>
				Belum ada truck/driver yang ditugaskan.
			</div>
		{/if}
	</div>
{:else}
	<div class="fleet-card">
		<div class="fleet-card-head">Informasi Armada &amp; Pengemudi</div>
		<div class="fleet-card-body">
			{#if truckPlate}
				<div class="fleet-inner">
					<div class="fleet-row">
						<span class="fleet-plate">{truckPlate}</span>
						<span class="fleet-dot">•</span>
						<span class="fleet-type">{truckTypeLabel}</span>
						<span class="fleet-gps-pill"><span class="icon-wrap"><Signal size={14} /></span> GPS Aktif</span>
					</div>
					<div class="fleet-driver-row">
						<div class="fleet-driver-avatar">{initials(driverName)}</div>
						<div>
							<div class="fleet-driver-name">{driverName || '-'}</div>
							{#if driverPhone}
								<div class="fleet-driver-phone">{formatPhoneDisplay(driverPhone)}</div>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="fleet-empty">
					<span class="fleet-empty-icon">🚚</span>
					Belum ada truck/driver yang ditugaskan.
				</div>
			{/if}
		</div>
	</div>
{/if}
