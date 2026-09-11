<script lang="ts">
	/**
	 * The planner's assignment panel.
	 *
	 * Candidate trucks ranked by how near they are to the loading point, the
	 * planned legs, and the re-plan button.
	 *
	 * Ranking is by straight-line distance, and the UI says so rather than
	 * calling it "distance". Routing every truck in the fleet to order a list
	 * would be one billable call per candidate; the road route is computed once,
	 * for the truck actually chosen.
	 */
	import { onMount } from 'svelte';
	import { dispatchStore, dispatchActions, km } from '$lib/stores/dispatch';
	import type { Candidate } from '$lib/stores/dispatch';
	import { can, hasFeature } from '$lib/stores/auth';
	import { formatDate } from '$lib/utils/format';
	import Card from './Card.svelte';
	import Button from './Button.svelte';
	import EmptyState from './EmptyState.svelte';
	import Spinner from './Spinner.svelte';

	let {
		orderId,
		/** Hides the truck picker once the order already has a driver. */
		assigned = false,
		onassigned = () => {}
	}: { orderId: string; assigned?: boolean; onassigned?: () => void } = $props();

	let selected = $state<Candidate | null>(null);
	let selectedDriver = $state('');

	let mayAssign = $derived($can('dispatch.assign'));
	/**
	 * The reroute button has two gates and they mean different things.
	 *
	 * mayReroute  — this person is not allowed. Their administrator can fix it,
	 *               so the button is hidden: showing it would be an invitation
	 *               to a dead end.
	 * entitled    — the company has not bought advanced routing. Sales can fix
	 *               it, so the button is SHOWN and disabled with a note. Hiding
	 *               it means nobody ever discovers the feature exists.
	 */
	let mayReroute = $derived($can('dispatch.reroute'));
	let entitled = $derived($hasFeature('routing.advanced'));

	let haul = $derived($dispatchStore.routes.find((r) => r.leg === 'haul'));
	let approach = $derived($dispatchStore.routes.find((r) => r.leg === 'approach'));

	onMount(() => {
		dispatchActions.routes(orderId);
		if (!assigned) dispatchActions.candidates(orderId);
		return () => dispatchActions.reset();
	});

	function choose(candidate: Candidate) {
		selected = candidate;
		selectedDriver = candidate.driverIds[0] ?? '';
	}

	async function assign() {
		if (!selected || !selectedDriver) return;
		if (await dispatchActions.assign(orderId, selectedDriver, selected.truckId)) {
			selected = null;
			onassigned();
		}
	}
</script>

<Card title="Dispatch">
	<!-- The planned legs. Two journeys, and they are not interchangeable: the
	     haul is the revenue trip, the approach is unpaid repositioning that
	     depends on which truck is chosen. -->
	<dl class="mb-4 grid grid-cols-2 gap-y-2 rounded-card bg-zebra p-4 text-xs">
		<dt class="text-muted">Haul (warehouse → warehouse)</dt>
		<dd class="text-ink">
			{km(haul?.route?.distanceMeters)}
			{#if haul?.route?.hasToll}
				<span class="text-muted">· crosses toll</span>
			{/if}
		</dd>

		<dt class="text-muted">Approach (truck → loading point)</dt>
		<dd class="text-ink">
			{#if approach?.route}
				{km(approach.route.distanceMeters)}
				{#if approach.reroutedAt}
					<span class="text-muted">· re-planned {formatDate(approach.reroutedAt, 'datetime')}</span>
				{/if}
			{:else}
				<span class="text-muted">not planned</span>
			{/if}
		</dd>
	</dl>

	{#if mayReroute}
		<div class="mb-4 flex items-center gap-3">
			<Button
				variant="outline"
				disabled={!entitled || $dispatchStore.loading}
				onclick={() => dispatchActions.reroute(orderId, 'approach')}
			>
				Re-plan route
			</Button>
			{#if !entitled}
				<span class="text-xs text-muted">
					Advanced routing is not enabled for your company.
				</span>
			{/if}
		</div>
	{/if}

	{#if $dispatchStore.notEntitled}
		<p class="mb-4 rounded-card bg-zebra px-4 py-3 text-xs text-muted">
			{$dispatchStore.notEntitled}
		</p>
	{/if}

	{#if !assigned}
		{#if $dispatchStore.loading && $dispatchStore.candidates.length === 0}
			<div class="flex justify-center py-6"><Spinner /></div>
		{:else if $dispatchStore.candidates.length === 0}
			<EmptyState message="No available trucks" />
		{:else}
			<p class="mb-2 text-xs text-muted">
				Nearest first, by straight-line distance to the loading point. The road is longer.
			</p>
			<ul class="scroll-cyan max-h-[320px] space-y-2 overflow-y-auto pr-1">
				{#each $dispatchStore.candidates as candidate (candidate.truckId)}
					<li>
						<button
							type="button"
							onclick={() => choose(candidate)}
							class="w-full rounded-nav border p-3 text-left hover:border-cyan
							       {selected?.truckId === candidate.truckId
								? 'border-cyan'
								: 'border-line-card'}"
						>
							<div class="flex items-center justify-between gap-2">
								<span class="text-xs font-medium text-ink">{candidate.policeNumber}</span>
								<span class="text-xs text-muted">
									{#if candidate.positionKnown}
										{km(candidate.straightLineMeters)} away
									{:else}
										position unknown
									{/if}
								</span>
							</div>
							{#if candidate.positionKnown}
								<!-- The age of the position matters as much as the
								     distance: a fix from three days ago should not be
								     weighed like one from this morning. -->
								<p class="mt-1 text-xs text-muted">
									Last seen {formatDate(candidate.positionAt, 'datetime')}
								</p>
							{:else}
								<p class="mt-1 text-xs text-muted">
									No completed shipment yet, so there is no position to rank on.
								</p>
							{/if}
							{#if candidate.driverIds.length === 0}
								<p class="mt-1 text-xs text-danger">No driver paired with this truck.</p>
							{/if}
						</button>
					</li>
				{/each}
			</ul>

			{#if selected && mayAssign}
				<div class="mt-4 flex items-center justify-between border-t border-line-card pt-4">
					<span class="text-xs text-muted">
						Assign <span class="font-medium text-ink">{selected.policeNumber}</span>
					</span>
					<Button
						onclick={assign}
						loading={$dispatchStore.loading}
						disabled={!selectedDriver}
					>
						{selectedDriver ? 'Assign' : 'No driver paired'}
					</Button>
				</div>
			{/if}
		{/if}
	{/if}

	{#if $dispatchStore.error}
		<p class="mt-3 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$dispatchStore.error}
		</p>
	{/if}
</Card>
