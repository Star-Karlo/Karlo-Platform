<script lang="ts">
	import { onMount } from 'svelte';
	import { Truck } from 'lucide-svelte';
	import { truckStore, truckActions } from '$lib/stores/trucks';
	import {
		Button,
		DataTable,
		FilterPanel,
		PageHeader,
		StatusBadge,
		Tabs,
		type Column,
		type FilterField
	} from '$lib/components/ui';

	let {
		basePath,
		title = 'Truck List',
		canCreate = true
	}: { basePath: string; title?: string; canCreate?: boolean } = $props();

	let activeTab = $state('all');
	let pageSize = $state(20);

	const TABS = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'maintenance', label: 'Maintenance' },
		{ id: 'inactive', label: 'Inactive' }
	];

	const FILTERS: FilterField[] = [
		{ group: 'Truck', id: 'policeNumber', label: 'Police Number' },
		{ group: 'Truck', id: 'year', label: 'Year' },
		{
			group: 'Status',
			id: 'status',
			label: 'Status',
			type: 'select',
			options: [
				{ value: 'active', label: 'Active' },
				{ value: 'maintenance', label: 'Maintenance' },
				{ value: 'inactive', label: 'Inactive' }
			]
		},
		{
			group: 'Status',
			id: 'isAvailable',
			label: 'Availability',
			type: 'select',
			options: [
				{ value: 'true', label: 'Available' },
				{ value: 'false', label: 'In use' }
			]
		}
	];

	const columns: Column[] = [
		{ key: 'policeNumber', label: 'Police Number' },
		{ key: 'status', label: 'Status' },
		{ key: 'isAvailable', label: 'Available', format: (row) => (row.isAvailable ? 'Yes' : 'No') },
		// The record holds brandId / truckTypeId, not names. Showing the ids
		// would be worse than leaving the columns out until /catalog is joined.
		{ key: 'year', label: 'Year' },
		// driverIds holds authentication-service user ids; master data does not
		// resolve them to names, so the count is what can honestly be shown.
		{ key: 'driverIds', label: 'Drivers', align: 'right', format: (row) => String(row.driverIds?.length ?? 0) }
	];

	onMount(() => load());

	function load(page = 0, extraFilters: any[] = []) {
		const tabFilter = activeTab !== 'all' ? [{ id: 'status', value: activeTab, type: 'equal' }] : [];
		truckActions.getAll({ page, pageSize, filtered: [...tabFilter, ...extraFilters] });
	}
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Truck}>
		{#snippet actions()}
			{#if canCreate}
				<Button variant="primary" href="{basePath}/create">+ Add Truck</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if $truckStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$truckStore.error}</p>
	{/if}

	<FilterPanel fields={FILTERS} onSearch={(f) => load(0, f)} onReset={() => load(0)} />

	<Tabs
		tabs={TABS}
		{activeTab}
		onChange={(id) => {
			activeTab = id;
			load(0);
		}}
	/>

	<DataTable
		{columns}
		data={$truckStore.trucks}
		loading={$truckStore.loading}
		{pageSize}
		totalRows={$truckStore.totalRows}
		emptyMessage="No trucks in this tab"
		onPageChange={(p) => load(p)}
		onPageSizeChange={(size) => {
			pageSize = size;
			load(0);
		}}
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'status'}
				<StatusBadge statusCode={row.status ?? ''} label={row.status ?? ''} />
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>
