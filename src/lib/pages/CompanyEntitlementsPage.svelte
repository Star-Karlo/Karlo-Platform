<script lang="ts">
	/**
	 * What a company has been sold.
	 *
	 * Karlo staff only, and it is the tier ABOVE roles: a company holds
	 * features, and its own administrator then hands out permissions from
	 * within them. Effective access is the intersection, so revoking a feature
	 * here silently narrows every role in that company — which is the intended
	 * behaviour and worth saying out loud on the screen.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Building2, Search } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { entitlementStore, entitlementActions, type Feature } from '$lib/stores/iam';
	import { Button, Card, Input, PageHeader, Select, Spinner } from '$lib/components/ui';

	let companies = $state<{ id: string; name: string; role?: string; abbreviation?: string }[]>([]);
	let selected = $state('');
	let search = $state('');
	let held = $state<Set<string>>(new Set());
	let notice = $state('');

	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.adminCompanies, { pageSize: 500 });
			companies = res.data?.data ?? [];
		} catch {
			companies = [];
		}
		// Arriving from Karlo Clients with a company already chosen.
		const preset = page.url.searchParams.get('company');
		if (preset && companies.some((c) => c.id === preset)) await choose(preset);
	});

	async function choose(id: string) {
		selected = id;
		notice = '';
		if (!id) return;
		await entitlementActions.load(id);
		held = new Set($entitlementStore.held);
	}

	function toggle(name: string) {
		const next = new Set(held);
		next.has(name) ? next.delete(name) : next.add(name);
		held = next;
	}

	async function save() {
		if (!selected) return;
		if (await entitlementActions.grant(selected, [...held])) {
			notice = 'Entitlements saved. Their people see the change on their next sign-in.';
		}
	}

	let companyOptions = $derived(
		companies
			.filter((c) => {
				const q = search.trim().toLowerCase();
				return !q || `${c.name} ${c.abbreviation ?? ''}`.toLowerCase().includes(q);
			})
			.map((c) => ({ value: c.id, label: `${c.name}${c.role ? ` — ${c.role}` : ''}` }))
	);

	/** Sellable features, with the roadmap ones marked rather than hidden. */
	let catalogue = $derived(
		[...$entitlementStore.catalogue].sort((a, b) => a.name.localeCompare(b.name))
	);

	let chosenCompany = $derived(companies.find((c) => c.id === selected));
</script>

<div class="space-y-gutter">
	<PageHeader
		title="Company Management"
		icon={Building2}
		subtitle="What each client company may use. Their own administrator hands out permissions from within this."
	/>

	<Card title="Choose a company" header="accent">
		<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
			<div>
				<label for="ce-search" class="form-label">Search</label>
				<Input id="ce-search" bind:value={search} placeholder="Company name or code…" />
			</div>
			<div>
				<label for="ce-company" class="form-label">Company</label>
				<Select
					id="ce-company"
					value={selected}
					options={companyOptions}
					placeholder="Choose a company"
					onchange={(e) => choose((e.target as HTMLSelectElement).value)}
				/>
			</div>
		</div>
	</Card>

	{#if notice}
		<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>
	{/if}
	{#if $entitlementStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$entitlementStore.error}
		</p>
	{/if}

	{#if selected}
		<Card title="Features for {chosenCompany?.name ?? ''}" header="accent">
			{#if $entitlementStore.loading}
				<div class="flex justify-center py-10"><Spinner /></div>
			{:else if catalogue.length === 0}
				<p class="text-xs text-muted">No sellable features were returned.</p>
			{:else}
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					{#each catalogue as feature}
						<label
							class="flex items-start gap-3 rounded-card border p-3.5 transition-colors
							       {held.has(feature.name) ? 'border-cyan bg-cyan-soft' : 'border-line-card'}"
						>
							<input
								type="checkbox"
								checked={held.has(feature.name)}
								onchange={() => toggle(feature.name)}
								class="mt-0.5 h-4 w-4 shrink-0 accent-cyan"
							/>
							<span class="min-w-0 text-xs">
								<span class="font-medium text-ink">{feature.name}</span>
								{#if feature.roadmap}
									<span class="ml-2 rounded bg-zebra px-1.5 py-0.5 text-[10px] text-muted">
										not built yet
									</span>
								{/if}
								{#if feature.description}
									<span class="mt-1 block leading-relaxed text-muted">{feature.description}</span>
								{/if}
							</span>
						</label>
					{/each}
				</div>

				<!-- Stated because it is the consequence people miss: features are
				     the OUTER tier. Taking one away narrows every role in that
				     company at once, without those roles changing. -->
				<p class="mt-5 rounded-card bg-zebra px-4 py-3 text-xs leading-relaxed text-muted">
					Effective access is the intersection of this list and each person's role.
					Removing a feature narrows every role in this company at once — the roles
					themselves are not edited, and will grant it again if the feature returns.
				</p>

				<div class="mt-5 flex items-center justify-between border-t border-line-card pt-5">
					<span class="text-xs text-muted">{held.size} features enabled</span>
					<Button onclick={save} loading={$entitlementStore.saving}>Save entitlements</Button>
				</div>
			{/if}
		</Card>
	{/if}
</div>
