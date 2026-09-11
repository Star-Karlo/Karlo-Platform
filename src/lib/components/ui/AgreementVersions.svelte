<script lang="ts">
	/**
	 * An agreement's version history and price history, with the approve /
	 * reject decision.
	 *
	 * The PRD asks for both as tabs on the detail screen, and they answer
	 * different questions: version history is what happened to the contract,
	 * price history is what it cost at each point. The second is separately
	 * permissioned, because "may see the contract" and "may see what we have
	 * been charging" are different trusts.
	 */
	import { onMount } from 'svelte';
	import {
		agreementVersionStore,
		agreementVersionActions,
		VERSION_STATUS_LABEL
	} from '$lib/stores/agreementVersions';
	import { can } from '$lib/stores/auth';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import Card from './Card.svelte';
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Spinner from './Spinner.svelte';
	import StatusBadge from './StatusBadge.svelte';

	let { agreementId, onchanged = () => {} }: { agreementId: string; onchanged?: () => void } =
		$props();

	let tab = $state<'versions' | 'prices'>('versions');
	let decisionNote = $state('');
	let deciding = $state('');

	let mayDecide = $derived($can('agreement.approveRevision'));
	let maySeePrices = $derived($can('agreement.priceHistory'));

	let versions = $derived($agreementVersionStore.versions);
	let prices = $derived($agreementVersionStore.priceHistory);

	onMount(() => {
		void refresh();
		return () => agreementVersionActions.reset();
	});

	async function refresh() {
		await agreementVersionActions.versions(agreementId);
		if (maySeePrices) await agreementVersionActions.priceHistory(agreementId);
	}

	async function decide(id: string, approve: boolean) {
		deciding = id;
		const ok = await agreementVersionActions.decide(id, approve, decisionNote);
		deciding = '';
		if (ok) {
			decisionNote = '';
			await refresh();
			onchanged();
		}
	}

	/** Rate lines grouped under the version they belong to, newest first. */
	let pricesByVersion = $derived(
		prices.reduce<Record<number, typeof prices>>((acc, line) => {
			(acc[line.version] ??= []).push(line);
			return acc;
		}, {})
	);
</script>

<Card title="History">
	{#snippet actions()}
		<Button variant={tab === 'versions' ? 'primary' : 'ghost'} onclick={() => (tab = 'versions')}>
			Versions
		</Button>
		{#if maySeePrices}
			<Button variant={tab === 'prices' ? 'primary' : 'ghost'} onclick={() => (tab = 'prices')}>
				Price history
			</Button>
		{/if}
	{/snippet}

	{#if $agreementVersionStore.loading}
		<div class="flex justify-center py-8"><Spinner /></div>
	{:else if tab === 'versions'}
		<ol class="space-y-3">
			{#each versions as version (version.id)}
				<li class="rounded-card border border-line-card p-4">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="text-xs font-medium text-ink">
								Version {version.version}
								{#if version.revisionKind}
									<span class="ml-2 text-muted">
										{version.revisionKind === 'renewal' ? 'Renewal' : 'Price / terms update'}
									</span>
								{:else}
									<span class="ml-2 text-muted">Original</span>
								{/if}
							</p>
							<p class="mt-1 text-xs text-muted">
								{formatDate(version.validFrom)} – {formatDate(version.validUntil)}
							</p>
							{#if version.revisionNote}
								<p class="mt-1 text-xs text-ink">{version.revisionNote}</p>
							{/if}

							<!-- Who asked and who decided, kept apart. On an approved
							     update these are different people, and that separation
							     is the entire point of the approval. -->
							{#if version.requestedAt}
								<p class="mt-1 text-xs text-muted">
									Requested {formatDate(version.requestedAt, 'datetime')}
								</p>
							{/if}
							{#if version.approvedAt}
								<p class="text-xs text-muted">
									Approved {formatDate(version.approvedAt, 'datetime')}
									{#if version.decisionNote}— {version.decisionNote}{/if}
								</p>
							{/if}
							{#if version.rejectedAt}
								<p class="text-xs text-danger">
									Rejected {formatDate(version.rejectedAt, 'datetime')}
									{#if version.decisionNote}— {version.decisionNote}{/if}
								</p>
							{/if}
							{#if version.supersededAt}
								<p class="text-xs text-muted">
									Superseded {formatDate(version.supersededAt, 'datetime')}
								</p>
							{/if}
						</div>

						<StatusBadge
							statusCode={version.statusCode}
							label={VERSION_STATUS_LABEL[version.statusCode] ?? version.statusCode}
						/>
					</div>

					{#if version.statusCode === 'pendingApproval' && mayDecide}
						<div class="mt-3 border-t border-line-card pt-3">
							<label for="note-{version.id}" class="form-label">
								Decision note
							</label>
							<Input id="note-{version.id}" bind:value={decisionNote} />
							<div class="mt-2 flex gap-2">
								<Button
									onclick={() => decide(version.id, true)}
									loading={deciding === version.id && $agreementVersionStore.saving}
								>
									Approve
								</Button>
								<Button variant="danger" onclick={() => decide(version.id, false)}>
									Reject
								</Button>
							</div>
							<!-- The server also refuses a self-approval outright: an
							     approval the requester can grant themselves costs a
							     click and prevents nothing. -->
							<p class="mt-2 text-xs text-muted">
								A revision cannot be approved by the person who requested it.
							</p>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{:else}
		{#each Object.keys(pricesByVersion).map(Number).sort((a, b) => b - a) as version}
			<div class="mb-4">
				<p class="mb-2 text-xs font-medium text-ink">
					Version {version}
					{#if pricesByVersion[version][0].approvedAt}
						<span class="ml-2 text-muted">
							effective {formatDate(pricesByVersion[version][0].approvedAt, 'datetime')}
						</span>
					{/if}
				</p>
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead>
							<tr class="text-left text-muted">
								<th class="py-1 pr-4">Lane</th>
								<th class="py-1 pr-4">Truck type</th>
								<th class="py-1 pr-4">Pricing</th>
								<th class="py-1">Price</th>
							</tr>
						</thead>
						<tbody>
							{#each pricesByVersion[version] as line}
								<tr class="border-t border-line-card">
									<td class="py-1.5 pr-4 text-ink">
										{line.originCityId ?? 'Any'}
										{#if line.originDistrictId}<span class="text-muted"> · {line.originDistrictId}</span>{/if}
										→ {line.destinationCityId ?? 'Any'}
										{#if line.destinationDistrictId}<span class="text-muted"> · {line.destinationDistrictId}</span>{/if}
									</td>
									<td class="py-1.5 pr-4 text-muted">{line.truckTypeId ?? 'Any'}</td>
									<td class="py-1.5 pr-4 text-muted">{line.pricingTypeId ?? '—'}</td>
									<td class="py-1.5 font-medium text-navy">
										{line.price ? formatCurrency(Number(line.price)) : '—'}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/each}
		{#if prices.length === 0}
			<p class="text-xs text-muted">No priced lines recorded.</p>
		{/if}
	{/if}

	{#if $agreementVersionStore.error}
		<p class="mt-3 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$agreementVersionStore.error}
		</p>
	{/if}
</Card>
