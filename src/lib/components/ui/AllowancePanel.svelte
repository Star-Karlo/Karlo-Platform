<script lang="ts">
	/**
	 * Uang sangu — the driver's cash advance.
	 *
	 * Two things this component is careful about:
	 *
	 * 1. Who may touch it. The company decides separately who sees the figure,
	 *    who sets it, and who commits it — for some that is sales, for others
	 *    finance. Three permissions rather than one. The server enforces them;
	 *    the gating here only decides what is worth rendering.
	 *
	 * 2. What the figure is typed against. The advance is entered by hand, so
	 *    the distances and the toll estimate sit beside the form. Without them
	 *    the number is a guess, which is what happens today.
	 */
	import { onMount } from 'svelte';
	import { allowanceStore, allowanceActions, DEFAULT_COMPONENTS } from '$lib/stores/allowance';
	import type { AllowanceComponent } from '$lib/stores/allowance';
	import { can } from '$lib/stores/auth';
	import { km } from '$lib/stores/dispatch';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import Card from './Card.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Spinner from './Spinner.svelte';

	let { orderId }: { orderId: string } = $props();

	let lines = $state<AllowanceComponent[]>([]);
	let note = $state('');
	let reason = $state('');

	let view = $derived($allowanceStore.view);
	let evidence = $derived(view?.evidence);

	let mayWrite = $derived($can('order.allowance.write'));
	let mayFinalise = $derived($can('order.allowance.finalise'));
	let finalised = $derived(!!view?.allowance?.finalisedAt);
	/** A finalised advance unlocks for editing only once a reason is given. */
	let locked = $derived(finalised && reason.trim() === '');

	/** The lines add up here as they are typed; the server recomputes on save. */
	let total = $derived(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));

	onMount(async () => {
		await allowanceActions.load(orderId);
		const stored = $allowanceStore.view?.allowance;
		lines = stored?.components?.length
			? stored.components.map((c) => ({ ...c }))
			: DEFAULT_COMPONENTS.map((c) => ({ ...c }));
		note = stored?.note ?? '';
	});

	function addLine() {
		lines = [...lines, { code: '', label: '', amount: '0' }];
	}

	function removeLine(index: number) {
		lines = lines.filter((_, i) => i !== index);
	}

	/**
	 * Offer the toll estimate rather than apply it.
	 *
	 * It is one rate over a distance and cannot be right for every road, so it
	 * is a starting point somebody accepts, not a number the system asserts.
	 */
	function useTollEstimate() {
		const estimate = evidence?.tollEstimate ?? '0';
		lines = lines.map((l) => (l.code === 'tol' ? { ...l, amount: estimate } : l));
	}

	async function save() {
		const cleaned = lines
			.filter((l) => l.code.trim() !== '')
			.map((l) => ({ ...l, amount: String(Number(l.amount) || 0) }));
		if (await allowanceActions.save(orderId, cleaned, { note, reason })) {
			reason = '';
		}
	}
</script>

<Card title="Uang Sangu">
	{#if $allowanceStore.loading}
		<Spinner />
	{:else}
		<!-- The evidence. Shown whether or not this user may edit: knowing the
		     journey is useful to anyone looking at the order. -->
		<dl class="mb-4 grid grid-cols-2 gap-y-2 rounded-card bg-zebra p-4 text-xs">
			<dt class="text-muted">Warehouse → warehouse</dt>
			<dd class="text-ink">{km(evidence?.haulDistanceMeters)}</dd>

			<dt class="text-muted">Driver → loading point</dt>
			<dd class="text-ink">
				{#if evidence?.approachDistanceMeters !== undefined}
					{km(evidence.approachDistanceMeters)}
				{:else}
					<span class="text-muted">no truck assigned yet</span>
				{/if}
			</dd>

			<dt class="text-muted">Total distance</dt>
			<dd class="font-medium text-ink">{km(evidence?.totalDistanceMeters)}</dd>

			<dt class="text-muted">Toll estimate</dt>
			<dd class="text-ink">
				{formatCurrency(Number(evidence?.tollEstimate ?? 0))}
				<span class="text-muted">({km(evidence?.tollDistanceMeters)} tolled)</span>
			</dd>
		</dl>

		{#if evidence && !evidence.tollDataComplete}
			<!-- Part of the route crosses toll roads the data does not describe.
			     Saying so matters: the estimate can then only be too low, and
			     somebody handing over cash should know that. -->
			<p class="mb-4 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="status">
				Part of this route crosses toll roads with no tariff data. The estimate is a minimum,
				not a figure.
			</p>
		{/if}

		{#if finalised}
			<p class="mb-4 rounded-card bg-zebra px-4 py-3 text-xs text-muted">
				Finalised {formatDate(view?.allowance?.finalisedAt, 'datetime')} — committed to the
				driver. Changing it needs a reason.
			</p>
		{/if}

		{#if mayWrite}
			<div class="space-y-2">
				<div class="grid grid-cols-[1fr_120px_140px_auto] gap-2 text-xs text-muted">
					<span>Component</span><span>Code</span><span>Amount</span><span></span>
				</div>
				{#each lines as line, i (i)}
					<div class="grid grid-cols-[1fr_120px_140px_auto] items-center gap-2">
						<Input bind:value={line.label} placeholder="Biaya BBM" disabled={locked} />
						<Input bind:value={line.code} placeholder="bbm" disabled={locked} />
						<Input type="number" bind:value={line.amount} disabled={locked} />
						<Button variant="ghost" onclick={() => removeLine(i)} disabled={locked}>
							Remove
						</Button>
					</div>
				{/each}

				<div class="flex items-center gap-2 pt-1">
					<Button variant="ghost" onclick={addLine} disabled={locked}>+ Add component</Button>
					{#if lines.some((l) => l.code === 'tol')}
						<Button variant="ghost" onclick={useTollEstimate} disabled={locked}>
							Use toll estimate
						</Button>
					{/if}
				</div>
			</div>

			<label for="allowance-note" class="mb-1 mt-4 block text-xs text-muted">Note</label>
			<Input id="allowance-note" bind:value={note} disabled={locked} />

			{#if finalised}
				<label for="allowance-reason" class="mb-1 mt-3 block text-xs text-muted">
					Reason for revising <span class="req">*</span>
				</label>
				<Input
					id="allowance-reason"
					bind:value={reason}
					placeholder="Required to change a finalised advance"
				/>
			{/if}

			<div class="mt-4 flex items-center justify-between border-t border-line-card pt-4">
				<span class="text-xs text-muted">
					Total
					<span class="ml-2 text-sm font-semibold text-navy">{formatCurrency(total)}</span>
				</span>
				<div class="flex gap-2">
					<Button onclick={save} loading={$allowanceStore.saving} disabled={locked}>Save</Button>
					{#if mayFinalise && !finalised}
						<Button
							variant="outline"
							onclick={() => allowanceActions.finalise(orderId)}
							loading={$allowanceStore.saving}
						>
							Finalise
						</Button>
					{/if}
				</div>
			</div>
		{:else if view?.allowance}
			<!-- Read-only: this person may see the advance but not set it. -->
			<dl class="grid grid-cols-2 gap-y-2 text-xs">
				{#each view.allowance.components as line}
					<dt class="text-muted">{line.label || line.code}</dt>
					<dd class="text-ink">{formatCurrency(Number(line.amount))}</dd>
				{/each}
				<dt class="border-t border-line-card pt-2 text-muted">Total</dt>
				<dd class="border-t border-line-card pt-2 font-semibold text-navy">
					{formatCurrency(Number(view.allowance.total))}
				</dd>
			</dl>
		{:else}
			<p class="text-xs text-muted">No advance has been set for this order.</p>
		{/if}

		{#if $allowanceStore.error}
			<p class="mt-3 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
				{$allowanceStore.error}
			</p>
		{/if}
	{/if}
</Card>
