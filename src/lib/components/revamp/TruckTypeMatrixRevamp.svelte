<script lang="ts">
	/**
	 * Port of Karlo-TMS-Revamp/src/components/common/TruckTypeMatrix.vue.
	 *
	 * TRUCK_BODY_TYPES x TRUCK_SIZES grid keyed `${body}|${size}`. The ui/
	 * TruckMatrix.svelte works on master-data ids with `body:class` keys, so it
	 * is not the same grid — this one is.
	 */
	import { Check } from 'lucide-svelte';
	import {
		TRUCK_BODY_TYPES as BODY_TYPES,
		TRUCK_SIZES as SIZES,
		truckTypeKey as key
	} from '$lib/revamp/truckTypes.js';

	let {
		value = $bindable<string[]>([]),
		readonly = false,
		recommendedKeys = null,
		allowedKeys = null,
		max = null,
		onchange,
		onLimitExceeded
	}: {
		value?: string[];
		readonly?: boolean;
		/** Visual highlight only, doesn't restrict selection. */
		recommendedKeys?: string[] | null;
		/** When set, only these keys can be ticked; the rest are greyed out (an agreement's own truck types). */
		allowedKeys?: string[] | null;
		/** null = no limit. */
		max?: number | null;
		onchange?: (value: string[]) => void;
		onLimitExceeded?: () => void;
	} = $props();

	function isChecked(body: string, size: string) {
		return (value || []).includes(key(body, size));
	}
	function isRecommended(body: string, size: string) {
		return !!recommendedKeys && recommendedKeys.includes(key(body, size));
	}
	function isAllowed(body: string, size: string) {
		return !allowedKeys || allowedKeys.includes(key(body, size));
	}
	function toggle(body: string, size: string) {
		if (readonly || !isAllowed(body, size)) return;
		const k = key(body, size);
		const current = value || [];
		const already = current.includes(k);
		if (!already && max != null && current.length >= max) {
			onLimitExceeded?.();
			return;
		}
		const next = already ? current.filter((x) => x !== k) : [...current, k];
		value = next;
		onchange?.(next);
	}
</script>

<div class="table-wrap">
	<table class="truck-matrix-table">
		<thead>
			<tr>
				<th></th>
				{#each SIZES as size (size)}
					<th>{size}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each BODY_TYPES as body (body)}
				<tr>
					<td class="truck-matrix-row-label">{body}</td>
					{#each SIZES as size (size)}
						<td class="truck-matrix-cell" class:recommended={isRecommended(body, size)} class:not-allowed={!isAllowed(body, size)}>
							{#if !readonly}
								<input type="checkbox" checked={isChecked(body, size)} disabled={!isAllowed(body, size)} title={!isAllowed(body, size) ? 'Tidak ada di agreement' : ''} onchange={() => toggle(body, size)} />
							{:else}
								<!-- A disabled native checkbox renders greyed-out regardless of
								     accent-color, which reads as "might not actually be
								     available" — a plain colored checkmark reads as "yes". -->
								<span class="truck-matrix-check" class:checked={isChecked(body, size)}>
									{#if isChecked(body, size)}
										<span class="icon-wrap"><Check size={10} strokeWidth={2.6} /></span>
									{/if}
								</span>
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
