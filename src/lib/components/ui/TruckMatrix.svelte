<script lang="ts">
	/**
	 * Which body-and-size combinations an agreement covers.
	 *
	 * A grid rather than two lists, because that is the actual question. A
	 * Wingbox CDD and a Wingbox Tronton are different vehicles at different
	 * prices, and picking from two separate lists cannot say which PAIRS are
	 * agreed — it would offer every combination of what was ticked, including
	 * ones nobody agreed to.
	 *
	 * Both axes come from master data, so a company that runs something unusual
	 * adds it to the catalogue and it appears here. Hardcoding the grid would
	 * have made this the one screen where reference data was not reference data.
	 */
	import { Check, Truck } from 'lucide-svelte';
	import { ENV } from '$lib/constants/env';

	export interface Axis {
		id: string;
		label: string;
		/**
		 * An object-store key for the body's picture, from master data.
		 *
		 * A key, never a URL: a signed URL expires, so a stored one rots. The
		 * icon is decoration — a body kind is recognised faster by its shape
		 * than its name — so a missing one falls back to a glyph rather than
		 * leaving a hole.
		 */
		imageKey?: string;
	}

	let {
		bodies = [],
		classes = [],
		/** Selected pairs as `bodyId:classId`. */
		selected = $bindable<string[]>([]),
		disabled = false
	}: {
		bodies?: Axis[];
		classes?: Axis[];
		selected?: string[];
		disabled?: boolean;
	} = $props();

	function key(bodyId: string, classId: string) {
		return `${bodyId}:${classId}`;
	}

	function isOn(bodyId: string, classId: string) {
		return selected.includes(key(bodyId, classId));
	}

	function toggle(bodyId: string, classId: string) {
		if (disabled) return;
		const k = key(bodyId, classId);
		selected = selected.includes(k) ? selected.filter((s) => s !== k) : [...selected, k];
	}

	/** Whole row or column at once — the common case is "every size of this body". */
	function toggleRow(bodyId: string) {
		if (disabled) return;
		const all = classes.every((c) => isOn(bodyId, c.id));
		const keys = classes.map((c) => key(bodyId, c.id));
		selected = all
			? selected.filter((s) => !keys.includes(s))
			: [...new Set([...selected, ...keys])];
	}

	function toggleColumn(classId: string) {
		if (disabled) return;
		const all = bodies.every((b) => isOn(b.id, classId));
		const keys = bodies.map((b) => key(b.id, classId));
		selected = all
			? selected.filter((s) => !keys.includes(s))
			: [...new Set([...selected, ...keys])];
	}
</script>

{#if bodies.length === 0 || classes.length === 0}
	<p class="rounded-card bg-zebra px-4 py-3 text-xs text-muted">
		The grid needs both truck bodies and truck classes in master data. Add them under Master
		Data before agreeing combinations here.
	</p>
{:else}
	<div class="overflow-x-auto rounded-card border border-line-card">
		<table class="w-full border-collapse text-xs">
			<thead>
				<tr class="bg-navy text-white">
					<th class="sticky left-0 z-10 bg-navy px-4 py-3 text-left font-semibold">Body</th>
					{#each classes as truckClass}
						<th class="whitespace-nowrap px-3 py-3 text-center font-semibold">
							<button
								type="button"
								class="hover:underline disabled:no-underline"
								{disabled}
								onclick={() => toggleColumn(truckClass.id)}
								title="Toggle every body for {truckClass.label}"
							>
								{truckClass.label}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each bodies as body, row}
					<tr class="border-b border-line-card last:border-0 {row % 2 === 1 ? 'bg-zebra/50' : ''}">
						<th
							class="sticky left-0 z-10 whitespace-nowrap px-4 py-2 text-left font-medium text-ink
							       {row % 2 === 1 ? 'bg-zebra/50' : 'bg-surface'}"
						>
							<button
								type="button"
								class="flex items-center gap-2.5 hover:text-cyan disabled:hover:text-ink"
								{disabled}
								onclick={() => toggleRow(body.id)}
								title="Toggle every size of {body.label}"
							>
								<span
									class="flex h-8 w-11 shrink-0 items-center justify-center overflow-hidden
									       rounded border border-line-card bg-surface text-muted"
								>
									{#if body.imageKey}
										<img
											src={ENV.STORAGE_URL + body.imageKey}
											alt=""
											class="h-full w-full object-contain"
											loading="lazy"
										/>
									{:else}
										<Truck size={16} />
									{/if}
								</span>
								{body.label}
							</button>
						</th>
						{#each classes as truckClass}
							{@const on = isOn(body.id, truckClass.id)}
							<td class="px-3 py-2.5 text-center">
								<button
									type="button"
									{disabled}
									onclick={() => toggle(body.id, truckClass.id)}
									aria-pressed={on}
									aria-label="{body.label} {truckClass.label}"
									class="flex h-5 w-5 items-center justify-center rounded border transition-colors
									       {on
										? 'border-cyan bg-cyan text-white'
										: 'border-line-input bg-surface hover:border-cyan'}
									       {disabled ? 'cursor-not-allowed opacity-50' : ''}"
								>
									{#if on}<Check size={13} strokeWidth={3} />{/if}
								</button>
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<p class="mt-2 text-xs text-muted">
		{selected.length} combination{selected.length === 1 ? '' : 's'} agreed. Click a row or column
		header to toggle it all.
	</p>
{/if}
