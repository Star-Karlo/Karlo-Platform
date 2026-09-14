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
	<!-- Compact, in the navy bar. Amber when acting for a client so it stays
	     hard to miss — acting as somebody and forgetting is how a record lands
	     on the wrong company's books. -->
	<div class="ah-acting {$actingFor.companyId ? 'ah-acting--client' : ''}" title={$actingFor.companyId ? `Acting for ${$actingFor.companyName}` : 'Acting as Karlo'}>
		<Building2 size={14} />
		<select
			class="ah-acting-select"
			value={$actingFor.companyId}
			aria-label="Act as client"
			onchange={(e) => choose((e.target as HTMLSelectElement).value)}
		>
			<option value="">Act as Karlo</option>
			{#each companies as c (c.value)}
				<option value={c.value}>{c.label}</option>
			{/each}
		</select>
		{#if $actingFor.companyId}
			<button type="button" class="ah-acting-stop" title="Stop acting for this client" aria-label="Stop" onclick={() => choose('')}>
				<X size={12} />
			</button>
		{/if}
	</div>
{/if}
