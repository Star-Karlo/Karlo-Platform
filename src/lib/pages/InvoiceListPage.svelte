<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Receipt } from 'lucide-svelte';
	import { invoiceStore, invoiceActions } from '$lib/stores/invoice_notification_dashboard';
	import { role } from '$lib/stores/auth';
	import { counterpartyLabel, counterpartyName } from '$lib/utils/counterparty';
	import { formatCurrency, formatDate } from '$lib/utils/format';
	import {
		DataTable,
		FilterPanel,
		PageHeader,
		PillTab,
		RowActions,
		StatusBadge,
		Tabs,
		type Column,
		type FilterField
	} from '$lib/components/ui';

	let { basePath, title = 'Dashboard Invoice' }: { basePath: string; title?: string } = $props();

	let activeTab = $state('active');
	let pageSize = $state(20);

	const TABS: { id: string; label: string; statuses: string[] }[] = [
		{ id: 'active', label: 'Active', statuses: ['draft', 'issued', 'submitted', 'verified', 'paid'] },
		{ id: 'cancel', label: 'Cancel', statuses: ['cancelled'] }
	];

	const FILTERS: FilterField[] = [
		{ group: 'Invoice', id: 'invoiceNumber', label: 'Invoice Number' },
		{
			group: 'Type',
			id: 'statusCode',
			label: 'Status',
			type: 'select',
			options: [
				{ value: 'draft', label: 'Draft' },
				{ value: 'issued', label: 'Issued' },
				{ value: 'submitted', label: 'Submitted' },
				{ value: 'verified', label: 'Verified' },
				{ value: 'paid', label: 'Paid' }
			]
		},
		{ group: 'Issued Date', id: 'issuedAt', key: 'issuedFrom', label: 'From', type: 'date', op: 'gte' },
		{ group: 'Issued Date', id: 'issuedAt', key: 'issuedTo', label: 'To', type: 'date', op: 'lte' },
		{ group: 'Due Date', id: 'dueAt', key: 'dueFrom', label: 'From', type: 'date', op: 'gte' },
		{ group: 'Due Date', id: 'dueAt', key: 'dueTo', label: 'To', type: 'date', op: 'lte' }
	];

	let columns = $derived<Column[]>([
		{ key: 'invoiceNumber', label: 'Invoice Number' },
		{
			key: 'companyName',
			label: counterpartyLabel($role),
			format: (row) => counterpartyName(row, $role)
		},
		{ key: 'statusAlias', label: 'Status' },
		{ key: 'subtotal', label: 'Subtotal', align: 'right', format: (row) => formatCurrency(Number(row.subtotal ?? 0)) },
		// Withheld at source, so it comes off the subtotal rather than adding to it.
		{ key: 'pph23Amount', label: 'PPh23', align: 'right', format: (row) => formatCurrency(Number(row.pph23Amount ?? 0)) },
		// The total sits below the subtotal because PPh23 is withheld at source
		// rather than added. That is correct, not a rendering fault.
		{ key: 'total', label: 'Total', align: 'right', format: (row) => formatCurrency(Number(row.total ?? 0)) },
		{ key: 'issuedAt', label: 'Invoice Print Date', format: (row) => formatDate(row.issuedAt) },
		{ key: 'dueAt', label: 'Due', format: (row) => formatDate(row.dueAt) },
		{ key: 'actions', label: 'Action', align: 'center' }
	]);

	onMount(() => load());

	function load(page = 0, extraFilters: any[] = []) {
		const tab = TABS.find((t) => t.id === activeTab);
		const tabFilter = tab ? [{ id: 'statusCode', value: tab.statuses, type: 'in' }] : [];
		invoiceActions.getAll({ page, filtered: [...tabFilter, ...extraFilters] });
	}
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Receipt} />

	{#if $invoiceStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$invoiceStore.error}</p>
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
			<PillTab>Invoice Recap</PillTab>
		{/snippet}
	</Tabs>

	<DataTable
		{columns}
		data={$invoiceStore.invoices}
		loading={$invoiceStore.loading}
		{pageSize}
		totalRows={$invoiceStore.totalRows}
		emptyMessage="No invoices in this tab"
		onPageChange={(p) => load(p)}
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'statusAlias'}
				<StatusBadge statusCode={row.statusCode ?? row.status ?? ''} label={row.statusAlias ?? ''} />
			{:else if column.key === 'actions'}
				<RowActions onView={() => goto(`${basePath}/${row.id}`)} />
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>
