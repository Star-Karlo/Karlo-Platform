<script lang="ts">
	/**
	 * One agreement, with its version and price history.
	 *
	 * The PRD asks for both on this screen, plus the ability to renew or amend.
	 * The two revision kinds behave differently and the form says so rather
	 * than leaving the user to discover it after submitting: a renewal takes
	 * effect at once, an update waits on a Sales Manager.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { Handshake, ArrowLeft } from 'lucide-svelte';
	import { agreementStore, agreementActions } from '$lib/stores/agreements';
	import { agreementVersionActions } from '$lib/stores/agreementVersions';
	import { can, role } from '$lib/stores/auth';
	import { counterpartyLabel, counterpartyName } from '$lib/utils/counterparty';
	import { formatDate } from '$lib/utils/format';
	import {
		AgreementVersions,
		Button,
		Card,
		EmptyState,
		Input,
		PageHeader,
		Select,
		Spinner,
		StatusBadge
	} from '$lib/components/ui';

	let { basePath }: { basePath: string } = $props();

	let id = $derived($page.params.id ?? '');
	let agreement = $derived($agreementStore.currentAgreement as any);

	let mayRevise = $derived($can('agreement.revise'));

	let showForm = $state(false);
	let kind = $state<'renewal' | 'update'>('update');
	let note = $state('');
	let validFrom = $state('');
	let validUntil = $state('');
	let saving = $state(false);
	let error = $state('');

	const KINDS = [
		{ value: 'update', label: 'Price / terms update — needs approval' },
		{ value: 'renewal', label: 'Renewal — extends the term, takes effect at once' }
	];

	onMount(() => void agreementActions.getOne(id));

	async function submit(event: Event) {
		event.preventDefault();
		error = '';
		saving = true;

		const body: any = { kind, note };
		// Dates are sent only when given. Omitted, the predecessor's carry
		// forward — which is what an update that changes only price wants.
		if (validFrom) body.validFrom = new Date(validFrom).toISOString();
		if (validUntil) body.validUntil = new Date(validUntil).toISOString();

		const created = await agreementVersionActions.revise(id, body);
		saving = false;

		if (created) {
			showForm = false;
			note = '';
			validFrom = '';
			validUntil = '';
			await agreementActions.getOne(id);
			await agreementVersionActions.versions(id);
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader title="Agreement" icon={Handshake}>
		{#snippet actions()}
			<Button variant="ghost" href="{basePath}/agreement"><ArrowLeft size={14} /> Back</Button>
			{#if mayRevise && agreement}
				<Button onclick={() => (showForm = !showForm)}>
					{showForm ? 'Cancel' : 'Renew or amend'}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if $agreementStore.loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else if !agreement}
		<Card><EmptyState message="Agreement not found" /></Card>
	{:else}
		<Card title={agreement.agreementNumber}>
			<dl class="grid grid-cols-2 gap-y-3 text-xs md:grid-cols-4">
				<dt class="text-muted">Status</dt>
				<dd><StatusBadge statusCode={agreement.statusCode} label={agreement.status ?? agreement.statusCode} /></dd>

				<dt class="text-muted">Version</dt>
				<dd class="text-ink">{agreement.version ?? 1}</dd>

				<dt class="text-muted">{counterpartyLabel($role ?? '')}</dt>
				<dd class="text-ink">{counterpartyName(agreement, $role ?? '')}</dd>

				<dt class="text-muted">Term</dt>
				<dd class="text-ink">
					{formatDate(agreement.validFrom)} – {formatDate(agreement.validUntil)}
				</dd>
			</dl>
		</Card>

		{#if showForm}
			<Card title="Propose a new version">
				<form onsubmit={submit} class="space-y-4">
					<div>
						<label for="kind" class="form-label">
							Kind <span class="req">*</span>
						</label>
						<Select id="kind" bind:value={kind} options={KINDS} placeholder="Choose" />
						<p class="mt-1 text-xs text-muted">
							{#if kind === 'renewal'}
								A renewal must extend the term past {formatDate(agreement.validUntil)}. To change
								price within the current term, use an update instead.
							{:else}
								An update changes a bargain already struck, so it waits on a Sales Manager
								before taking effect. The current version stays orderable meanwhile.
							{/if}
						</p>
					</div>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label for="validFrom" class="form-label">
								Valid from {#if kind === 'renewal'}<span class="req">*</span>{/if}
							</label>
							<Input id="validFrom" type="date" bind:value={validFrom} />
						</div>
						<div>
							<label for="validUntil" class="form-label">
								Valid until {#if kind === 'renewal'}<span class="req">*</span>{/if}
							</label>
							<Input id="validUntil" type="date" bind:value={validUntil} />
						</div>
					</div>

					<div>
						<label for="note" class="form-label">
							Reason for this revision
						</label>
						<Input id="note" bind:value={note} placeholder="Fuel cost adjustment agreed with shipper" />
					</div>

					<!-- Rates are not restated here. Omitting them carries the
					     predecessor's prices forward, which is what a renewal at
					     unchanged rates wants; retyping a priced matrix invites
					     transcription errors into a contract. -->
					<p class="text-xs text-muted">
						Prices carry forward from the current version unless they are edited afterwards.
					</p>

					<div class="flex justify-end gap-2">
						<Button variant="ghost" onclick={() => (showForm = false)}>Cancel</Button>
						<Button type="submit" loading={saving}>Create version</Button>
					</div>

					{#if error}
						<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
							{error}
						</p>
					{/if}
				</form>
			</Card>
		{/if}

		<AgreementVersions agreementId={id} onchanged={() => agreementActions.getOne(id)} />
	{/if}
</div>
