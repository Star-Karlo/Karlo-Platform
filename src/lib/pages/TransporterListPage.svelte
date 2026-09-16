<script lang="ts">
	/**
	 * Transporter List — the 3PL vendors this company works with.
	 *
	 * Read from the same link table that gives a transporter its Customer
	 * List, seen from the other side. A transporter appears here once it has
	 * recorded this company as its client (or the platform linked the two);
	 * nothing is typed in on this screen, because a vendor relationship is
	 * something both parties hold, not a note one of them keeps.
	 */
	import { onMount } from 'svelte';
	import { Truck } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { DataTable, PageHeader, StatusBadge, type Column } from '$lib/components/ui';

	let { title = 'Transporter List' }: { title?: string } = $props();

	let rows = $state<any[]>([]);
	let loading = $state(true);
	let error = $state('');

	onMount(async () => {
		try {
			const res = await api.get('/transporters');
			rows = res.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load your transporters.';
		} finally {
			loading = false;
		}
	});

	const columns: Column[] = [
		{ key: 'name', label: 'Transporter' },
		{ key: 'abbreviation', label: 'Abbreviation', format: (r) => r.abbreviation ?? '—' },
		{ key: 'npwp', label: 'NPWP', format: (r) => r.npwp ?? r.taxNumber ?? '—' },
		{ key: 'phone', label: 'Phone', format: (r) => r.phone ?? '—' },
		{ key: 'address', label: 'Address', format: (r) => r.address ?? '—' },
		{ key: 'status', label: 'Status' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={Truck}
		subtitle="The transporters (3PL vendors) that carry your orders. A transporter is listed here once it records your company as its client."
	/>

	{#if error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	<DataTable
		{columns}
		data={rows}
		totalRows={rows.length}
		{loading}
		emptyMessage="No transporters linked to your company yet"
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'status'}
				<StatusBadge statusCode={row.status ?? 'active'} label={row.status ?? 'active'} />
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>
