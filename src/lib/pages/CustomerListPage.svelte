<script lang="ts">
	import { onMount } from 'svelte';
	import { Users } from 'lucide-svelte';
	import { customerStore, customerActions } from '$lib/stores/customers';
	import {
		Button,
		DataTable,
		FilterPanel,
		Input,
		Modal,
		PageHeader,
		RowActions,
		type Column,
		type FilterField
	} from '$lib/components/ui';
	import type { Customer } from '$lib/types';

	/**
	 * Customer List — the shipper's own end-recipients, with create, edit and
	 * delete inline as the old app had them.
	 *
	 * A customer is not a platform user: they never sign in, and they are
	 * referenced by orders. That is why delete is soft on the service side —
	 * hard-deleting one would render last year's invoice with a blank consignee.
	 */
	let { title = 'Customer List' }: { basePath?: string; title?: string } = $props();

	let pageSize = $state(20);
	let editing = $state<Customer | null>(null);
	let confirming = $state<Customer | null>(null);
	let saving = $state(false);
	let formError = $state('');

	let form = $state({
		name: '',
		code: '',
		npwp: '',
		address: '',
		contactName: '',
		contactPhone: '',
		contactEmail: ''
	});

	const FILTERS: FilterField[] = [
		{ group: 'Customer', id: 'name', label: 'Name' },
		{ group: 'Customer', id: 'contactName', label: 'Contact' }
	];

	const columns: Column[] = [
		{ key: 'name', label: 'Name' },
		{ key: 'code', label: 'Code' },
		{ key: 'contactName', label: 'Contact' },
		{ key: 'contactPhone', label: 'Phone' },
		{ key: 'address', label: 'Address' },
		{ key: 'actions', label: 'Action', align: 'center' }
	];

	onMount(() => load());

	function load(page = 0, filtered: any[] = []) {
		customerActions.getAll({ page, pageSize, filtered });
	}

	function openCreate() {
		editing = null;
		formError = '';
		form = { name: '', code: '', npwp: '', address: '', contactName: '', contactPhone: '', contactEmail: '' };
		showForm = true;
	}

	function openEdit(row: Customer) {
		editing = row;
		formError = '';
		form = {
			name: row.name ?? '',
			code: row.code ?? '',
			npwp: row.npwp ?? '',
			address: row.address ?? '',
			contactName: row.contactName ?? '',
			contactPhone: row.contactPhone ?? '',
			contactEmail: row.contactEmail ?? ''
		};
		showForm = true;
	}

	let showForm = $state(false);

	async function save() {
		if (!form.name.trim()) {
			formError = 'A name is required.';
			return;
		}
		saving = true;
		formError = '';
		try {
			if (editing) await customerActions.update(editing.id, form);
			else await customerActions.create(form);
			showForm = false;
			load($customerStore.page);
		} catch (e: any) {
			formError = e?.response?.data?.message ?? 'Could not save this customer.';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!confirming) return;
		saving = true;
		try {
			await customerActions.remove(confirming.id);
			confirming = null;
			load($customerStore.page);
		} catch (e: any) {
			formError = e?.response?.data?.message ?? 'Could not delete this customer.';
		} finally {
			saving = false;
		}
	}

	const FIELDS: { key: keyof typeof form; label: string; type?: string; help?: string }[] = [
		{ key: 'name', label: 'Nama Perusahaan' },
		{
			key: 'code',
			label: 'Kode Singkatan Perusahaan',
			help: 'Dipakai sebagai segmen kode pada No. Agreement (cth. AGR-SKI-SMS-000001).'
		},
		{ key: 'npwp', label: 'Nomor NPWP' },
		{ key: 'contactName', label: 'Nama PIC' },
		{ key: 'contactPhone', label: 'Telepon' },
		{ key: 'contactEmail', label: 'Email', type: 'email' },
		{ key: 'address', label: 'Alamat' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Users}>
		{#snippet actions()}
			<Button variant="primary" onclick={openCreate}>+ Create</Button>
		{/snippet}
	</PageHeader>

	{#if $customerStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$customerStore.error}
		</p>
	{/if}

	<FilterPanel fields={FILTERS} onSearch={(f) => load(0, f)} onReset={() => load(0)} />

	<DataTable
		{columns}
		data={$customerStore.customers}
		loading={$customerStore.loading}
		page={$customerStore.page}
		{pageSize}
		totalRows={$customerStore.totalRows}
		emptyMessage="No customers yet"
		onPageChange={(p) => load(p)}
		onPageSizeChange={(size) => {
			pageSize = size;
			load(0);
		}}
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'actions'}
				<RowActions onEdit={() => openEdit(row)} onDelete={() => (confirming = row)} />
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>

<Modal
	open={showForm}
	title={editing ? 'Edit Customer' : 'Create Customer'}
	onClose={() => (showForm = false)}
>
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		{#each FIELDS as field}
			<div class={field.key === 'address' ? 'md:col-span-2' : ''}>
				<label for="cust-{field.key}" class="form-label">{field.label}</label>
				<Input id="cust-{field.key}" type={field.type ?? 'text'} bind:value={form[field.key]} />
				{#if field.help}
					<p class="mt-1 text-xs text-muted">{field.help}</p>
				{/if}
			</div>
		{/each}
	</div>
	{#if formError}
		<p class="mt-4 text-xs text-danger" role="alert">{formError}</p>
	{/if}
	{#snippet footer()}
		<Button variant="outline" onclick={() => (showForm = false)}>Cancel</Button>
		<Button variant="primary" loading={saving} onclick={save}>
			{editing ? 'Save Changes' : 'Create'}
		</Button>
	{/snippet}
</Modal>

<Modal open={!!confirming} title="Delete Customer" size="sm" onClose={() => (confirming = null)}>
	<p class="text-xs text-ink">
		Delete <strong>{confirming?.name}</strong>? Existing orders keep referencing this customer, so
		past invoices stay intact — it only disappears from this list.
	</p>
	{#snippet footer()}
		<Button variant="outline" onclick={() => (confirming = null)}>Cancel</Button>
		<Button variant="danger" loading={saving} onclick={remove}>Delete</Button>
	{/snippet}
</Modal>
