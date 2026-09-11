<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Handshake, Download, Upload } from 'lucide-svelte';
	import { agreementStore, agreementActions } from '$lib/stores/agreements';
	import { role } from '$lib/stores/auth';
	import { counterpartyLabel, counterpartyName } from '$lib/utils/counterparty';
	import { formatDate, formatDateRange } from '$lib/utils/format';
	import {
		Button,
		DataTable,
		FilterPanel,
		PageHeader,
		PillTab,
		StatusBadge,
		Tabs,
		type Column,
		type FilterField
	} from '$lib/components/ui';

	let {
		basePath,
		title = 'Dashboard Agreement',
		canCreate = true
	}: { basePath: string; title?: string; canCreate?: boolean } = $props();

	let activeTab = $state('active');
	let pageSize = $state(20);

	const TABS: { id: string; label: string; statuses: string[] }[] = [
		{ id: 'active', label: 'Active', statuses: ['active'] },
		{ id: 'draft', label: 'Draft', statuses: ['draft', 'submitted'] },
		{ id: 'inactive', label: 'Non-active', statuses: ['expired', 'cancelled', 'rejected'] }
	];

	/**
	 * There is no pricing type or route on an agreement, so those filters are
	 * gone — filtering on a field the service does not have returns everything
	 * and looks broken.
	 */
	const FILTERS: FilterField[] = [
		{ group: 'Agreement', id: 'agreementNumber', label: 'Agreement Number' },
		{
			group: 'Agreement',
			id: 'verified',
			label: 'Verified',
			type: 'select',
			options: [
				{ value: 'true', label: 'Verified' },
				{ value: 'false', label: 'Not verified' }
			]
		},
		{ group: 'Validity', id: 'validFrom', label: 'Valid From', type: 'date', op: 'gte' },
		{ group: 'Validity', id: 'validUntil', label: 'Valid Until', type: 'date', op: 'lte' }
	];

	// The service resolves both company names once per page, so the column is a
	// plain read — no per-row lookup.
	let columns = $derived<Column[]>([
		{ key: 'agreementNumber', label: 'Agreement Number' },
		{
			key: 'companyName',
			label: counterpartyLabel($role),
			format: (row) => counterpartyName(row, $role)
		},
		{ key: 'statusAlias', label: 'Status' },
		{ key: 'verified', label: 'Verified', format: (row) => (row.verified ? 'Yes' : 'No') },
		{ key: 'validFrom', label: 'Agreement Date', format: (row) => formatDateRange(row.validFrom, row.validUntil) },
		{ key: 'createdAt', label: 'Created', format: (row) => formatDate(row.createdAt) }
	]);

	onMount(() => load());

	function load(page = 0, extraFilters: any[] = []) {
		const tab = TABS.find((t) => t.id === activeTab);
		const tabFilter = tab ? [{ id: 'statusCode', value: tab.statuses, type: 'in' }] : [];
		agreementActions.getAll({ page, pageSize, filtered: [...tabFilter, ...extraFilters] });
	}
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Handshake}>
		{#snippet actions()}
			{#if canCreate}
				<Button variant="outline" href="{basePath}/create">+ Create Agreement</Button>
				<Button variant="outline"><Download size={14} /> Download Format</Button>
				<Button variant="primary"><Upload size={14} /> Upload Agreement (XLS)</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if $agreementStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$agreementStore.error}</p>
	{/if}

	<FilterPanel fields={FILTERS} onSearch={(f) => load(0, f)} onReset={() => load(0)} />

	<Tabs
		tabs={TABS.map((t) => ({ id: t.id, label: t.label }))}
		{activeTab}
		onChange={(id) => {
			activeTab = id;
			load(0);
		}}
	>
		{#snippet actions()}
			<PillTab>Agreement Recap</PillTab>
		{/snippet}
	</Tabs>

	<DataTable
		{columns}
		data={$agreementStore.agreements}
		loading={$agreementStore.loading}
		page={$agreementStore.page}
		{pageSize}
		totalRows={$agreementStore.totalRows}
		emptyMessage="No agreements in this tab"
		onRowClick={(row) => goto(`${basePath}/${row.id}`)}
		onPageChange={(p) => load(p)}
		onPageSizeChange={(size) => {
			pageSize = size;
			load(0);
		}}
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'statusAlias'}
				<StatusBadge statusCode={row.statusCode ?? row.status ?? ''} label={row.statusAlias ?? ''} />
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>
