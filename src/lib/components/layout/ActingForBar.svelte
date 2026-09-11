<script lang="ts">
	/**
	 * Who a Karlo staff member is currently working on behalf of.
	 *
	 * A persistent bar rather than a field on each form, because the choice
	 * applies to everything on the page — an agreement, an order, that client's
	 * form configuration. It is also deliberately hard to miss: acting as
	 * somebody else and forgetting is how a record ends up on the wrong
	 * company's books, and a discreet dropdown is exactly how that happens.
	 *
	 * Invisible to everyone who is not staff, because for them it is not a
	 * choice — the server writes their own company regardless.
	 */
	import { onMount } from 'svelte';
	import { Building2, X } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import Select from '$lib/components/ui/Select.svelte';

	let companies = $state<{ value: string; label: string; role: string }[]>([]);
	let isStaff = $derived($authStore.user?.isPlatformStaff ?? false);

	onMount(async () => {
		if (!isStaff) return;
		try {
			const res = await api.get(ENDPOINTS.adminCompanies, { pageSize: 500 });
			companies = (res.data?.data ?? [])
				// Karlo's own company is not a client to act for.
				.filter((c: any) => c.id !== $authStore.user?.companyId)
				.map((c: any) => ({
					value: c.id,
					// The side of the market is in the label because it decides
					// which console appears — picking a shipper and getting a
					// planner would look like a bug.
					label: `${c.name}${c.abbreviation ? ` (${c.abbreviation})` : ''} — ${c.role ?? '?'}`,
					role: c.role ?? ''
				}));
		} catch {
			companies = [];
		}
	});

	function choose(id: string) {
		const chosen = companies.find((c) => c.value === id);
		actingFor.set(id, chosen?.label ?? '', chosen?.role ?? '');
		// A hard reload rather than a store refresh: every page on screen was
		// loaded for the previous company, and quietly leaving stale rows in
		// place while new writes go elsewhere is worse than a blink.
		if (id || $actingFor.companyId) location.reload();
	}
</script>

{#if isStaff}
	<div
		class="flex flex-wrap items-center gap-3 px-gutter py-2 text-xs
		       {$actingFor.companyId ? 'bg-warning/15 text-ink' : 'bg-zebra text-muted'}"
	>
		<span class="flex items-center gap-1.5 font-medium">
			<Building2 size={14} />
			{#if $actingFor.companyId}
				Acting for <span class="text-ink-dark">{$actingFor.companyName}</span>
			{:else}
				Acting as Karlo
			{/if}
		</span>

		<div class="w-72">
			<Select
				value={$actingFor.companyId}
				options={companies}
				placeholder="Act as Karlo (no client)"
				onchange={(e) => choose((e.target as HTMLSelectElement).value)}
			/>
		</div>

		{#if $actingFor.companyId}
			<button
				type="button"
				class="flex items-center gap-1 rounded-btn border border-line-input bg-surface px-2.5 py-1 hover:border-cyan"
				onclick={() => choose('')}
			>
				<X size={12} /> Stop
			</button>
			<span class="text-muted">
				Showing the {$actingFor.companyRole || 'client'} console. Agreements and orders you
				create are recorded as this company's.
			</span>
		{/if}
	</div>
{/if}
