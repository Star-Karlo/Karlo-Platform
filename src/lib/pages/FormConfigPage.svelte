<script lang="ts">
	/**
	 * Where a company decides what its own agreement and order forms demand.
	 *
	 * The flow is fixed for everyone — agreement, order, dispatch, driver,
	 * loading, unloading. This screen configures the one thing that genuinely
	 * differs between companies: how much detail each step captures.
	 *
	 * Two examples drove the design and both land here as the same control:
	 * whether routes stop at the city or go down to the kecamatan, and whether
	 * an order names a cargo category or itemises every component.
	 */
	import { onMount } from 'svelte';
	import { SlidersHorizontal } from 'lucide-svelte';
	import {
		fieldConfigStore,
		fieldConfigActions,
		groupsOf,
		type FieldConfig,
		type Requirement
	} from '$lib/stores/fieldconfig';
	import { can, authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { Button, Card, EmptyState, PageHeader, Select, Spinner } from '$lib/components/ui';

	let entity = $state<'agreement' | 'order'>('agreement');
	let draft = $state<Record<string, Requirement>>({});
	let saved = $state('');

	let mayEdit = $derived($can('config.fields.write'));
	let fields = $derived($fieldConfigStore[entity] ?? []);

	const REQUIREMENTS = [
		{ value: 'required', label: 'Required' },
		{ value: 'optional', label: 'Optional' },
		{ value: 'hidden', label: 'Not used' }
	];

	onMount(() => load());

	async function load() {
		const loaded = await fieldConfigActions.load(entity, true);
		draft = Object.fromEntries(loaded.map((f: FieldConfig) => [f.key, f.requirement]));
		saved = '';
	}

	async function switchEntity(next: 'agreement' | 'order') {
		entity = next;
		await load();
	}

	/** Only what actually changed is sent; the server stores nothing else. */
	let changed = $derived(fields.filter((f) => draft[f.key] !== undefined && draft[f.key] !== f.requirement));

	async function save() {
		const payload = changed.map((f) => ({ key: f.key, requirement: draft[f.key] }));
		if (payload.length === 0) return;
		if (await fieldConfigActions.update(entity, payload)) {
			saved = `${payload.length} field${payload.length === 1 ? '' : 's'} updated.`;
			await load();
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader
		title="Form Configuration"
		icon={SlidersHorizontal}
		subtitle={$actingFor.companyId
			? `What ${$actingFor.companyName}'s forms ask for. The steps of the flow do not change.`
			: 'Choose what your agreement and order forms ask for. The steps of the flow do not change.'}
	/>

	{#if $authStore.user?.isPlatformStaff && !$actingFor.companyId}
		<!-- Every customer can require different fields, so editing "the" form
		     is meaningless without saying whose. Karlo's own configuration is a
		     real thing to edit, just rarely the intended one. -->
		<p class="rounded-card bg-warning/15 px-4 py-3 text-xs leading-relaxed text-ink" role="status">
			You are editing <span class="font-medium">Karlo's own</span> forms. To change what a client's agreement or
			order asks for, choose that client in the bar above — each one can require different fields.
		</p>
	{/if}

	<div class="flex gap-2">
		<Button
			variant={entity === 'agreement' ? 'primary' : 'outline'}
			onclick={() => switchEntity('agreement')}
		>
			Agreement
		</Button>
		<Button variant={entity === 'order' ? 'primary' : 'outline'} onclick={() => switchEntity('order')}>
			Order
		</Button>
	</div>

	{#if $fieldConfigStore.loading}
		<Card><div class="flex justify-center py-8"><Spinner /></div></Card>
	{:else if fields.length === 0}
		<Card><EmptyState message="No configurable fields" /></Card>
	{:else}
		{#each groupsOf(fields, true) as group}
			<Card title={group}>
				<ul class="divide-y divide-line-card">
					{#each fields.filter((f) => f.group === group) as field (field.key)}
						<li class="flex items-center justify-between gap-4 py-3">
							<div class="min-w-0">
								<p class="text-xs font-medium text-ink">
									{field.label}
									{#if field.overridden}
										<span class="ml-2 text-muted">(changed from default)</span>
									{/if}
								</p>
								{#if field.help}
									<p class="mt-0.5 text-xs text-muted">{field.help}</p>
								{/if}
								{#if field.locked}
									<!-- Some fields exist but must never be switched off. An
									     order with no loading point cannot be dispatched, and
									     the driver app has nowhere to send anybody. -->
									<p class="mt-0.5 text-xs text-muted">
										Always required — the flow does not work without it.
									</p>
								{/if}
							</div>

							<div class="w-40 shrink-0">
								{#if field.locked}
									<p class="text-right text-xs text-muted">Required</p>
								{:else if draft[field.key] !== undefined}
									<!-- The store publishes the fields a tick before the draft is
									     filled from them; binding an undefined value is a Svelte error. -->
									<Select bind:value={draft[field.key]} options={REQUIREMENTS} disabled={!mayEdit} />
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</Card>
		{/each}

		{#if mayEdit}
			<div class="flex items-center justify-between">
				<span class="text-xs text-muted">
					{#if changed.length === 0}
						No changes.
					{:else}
						{changed.length} field{changed.length === 1 ? '' : 's'} changed.
					{/if}
					{#if saved}<span class="ml-2 text-ink">{saved}</span>{/if}
				</span>
				<Button onclick={save} disabled={changed.length === 0} loading={$fieldConfigStore.loading}>
					Save changes
				</Button>
			</div>
		{/if}

		{#if $fieldConfigStore.error}
			<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
				{$fieldConfigStore.error}
			</p>
		{/if}
	{/if}
</div>
