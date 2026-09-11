<script lang="ts">
	/**
	 * The Sales Manager's queue: amendments waiting on a decision.
	 *
	 * Only price/terms UPDATES appear here. A renewal takes effect without
	 * approval, because it is a fresh negotiation both sides have just agreed
	 * rather than a change to a bargain already struck and mid-flight.
	 */
	import { onMount } from 'svelte';
	import { CheckCheck } from 'lucide-svelte';
	import {
		agreementVersionStore,
		agreementVersionActions,
		VERSION_STATUS_LABEL
	} from '$lib/stores/agreementVersions';
	import { formatDate } from '$lib/utils/format';
	import { Button, Card, EmptyState, Input, PageHeader, Spinner, StatusBadge } from '$lib/components/ui';

	let { basePath }: { basePath: string } = $props();

	let note = $state('');
	let deciding = $state('');

	onMount(() => {
		void agreementVersionActions.pending();
		return () => agreementVersionActions.reset();
	});

	async function decide(id: string, approve: boolean) {
		deciding = id;
		const ok = await agreementVersionActions.decide(id, approve, note);
		deciding = '';
		if (ok) {
			note = '';
			await agreementVersionActions.pending();
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader
		title="Agreement Approvals"
		icon={CheckCheck}
		subtitle="Price and terms changes waiting on a decision. Renewals do not appear here — they take effect without approval."
	/>

	{#if $agreementVersionStore.loading}
		<Card><div class="flex justify-center py-8"><Spinner /></div></Card>
	{:else if $agreementVersionStore.pending.length === 0}
		<Card><EmptyState message="Nothing is waiting for approval" /></Card>
	{:else}
		{#each $agreementVersionStore.pending as revision (revision.id)}
			<Card>
				<div class="flex items-start justify-between gap-4">
					<div class="min-w-0">
						<a
							href="{basePath}/agreement"
							class="text-xs font-medium text-ink hover:text-cyan"
						>
							{revision.agreementNumber}
						</a>
						<p class="mt-1 text-xs text-muted">
							Version {revision.version} · requested {formatDate(revision.requestedAt, 'datetime')}
						</p>
						<p class="mt-1 text-xs text-muted">
							{formatDate(revision.validFrom)} – {formatDate(revision.validUntil)}
						</p>
						{#if revision.revisionNote}
							<p class="mt-1 text-xs text-ink">{revision.revisionNote}</p>
						{/if}
					</div>
					<StatusBadge
						statusCode={revision.statusCode}
						label={VERSION_STATUS_LABEL[revision.statusCode] ?? revision.statusCode}
					/>
				</div>

				<div class="mt-3 border-t border-line-card pt-3">
					<label for="note-{revision.id}" class="form-label">Decision note</label>
					<Input id="note-{revision.id}" bind:value={note} />
					<div class="mt-2 flex gap-2">
						<Button
							onclick={() => decide(revision.id, true)}
							loading={deciding === revision.id && $agreementVersionStore.saving}
						>
							Approve
						</Button>
						<Button variant="danger" onclick={() => decide(revision.id, false)}>Reject</Button>
					</div>
				</div>
			</Card>
		{/each}
	{/if}

	{#if $agreementVersionStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$agreementVersionStore.error}
		</p>
	{/if}
</div>
