<script lang="ts">
	/**
	 * Drivers — the people a truck is assigned to.
	 *
	 * Master data, not identity: a driver is a name, a phone and a licence,
	 * and most never sign in. That is what separates this screen from User
	 * Management, which is for people who log in. A driver who does get a
	 * login is the same record, linked by userId, so the two never drift.
	 *
	 * Shared with FMS: a driver added here is the one FMS assigns to a
	 * vehicle, and vice versa.
	 */
	import { onMount } from 'svelte';
	import { Users, Plus, Pencil, Trash2, Search, UserPlus } from 'lucide-svelte';
	import { driverStore, driverActions, type Driver } from '$lib/stores/drivers';
	import { Button, DataTable, Field, FormGrid, Input, Modal, PageHeader, Select, StatusBadge, Tabs, type Column } from '$lib/components/ui';
	import { formatDate } from '$lib/utils/format';

	let { title = 'Drivers', basePath = '/t' }: { title?: string; basePath?: string } = $props();

	let activeTab = $state('all');
	let search = $state('');
	let pageSize = $state(20);

	const TABS = [
		{ id: 'all', label: 'All' },
		{ id: 'active', label: 'Active' },
		{ id: 'inactive', label: 'Inactive' }
	];

	function load(page = 0) {
		void driverActions.getAll({ page, pageSize, search, status: activeTab === 'all' ? '' : activeTab });
	}
	onMount(() => load(0));

	const columns: Column[] = [
		{ key: 'fullName', label: 'Name' },
		{ key: 'phone', label: 'Phone', format: (r) => r.phone ?? '—' },
		{ key: 'employeeNo', label: 'Employee No', format: (r) => r.employeeNo ?? '—' },
		{ key: 'licenseNo', label: 'Licence (SIM)', format: (r) => r.licenseNo ? `${r.licenseNo}${r.licenseClass ? ` · ${r.licenseClass}` : ''}` : '—' },
		{ key: 'licenseExpiry', label: 'SIM Expiry', format: (r) => r.licenseExpiry ? formatDate(r.licenseExpiry) : '—' },
		{ key: 'status', label: 'Status' },
		{ key: 'userId', label: 'Login', format: (r) => (r.userId ? 'Yes' : 'No') },
		{ key: 'actions', label: '', align: 'right' }
	];

	// --- Form ---------------------------------------------------------------
	let showForm = $state(false);
	let editing = $state<Driver | null>(null);
	let saving = $state(false);
	let formError = $state('');
	let confirmingDelete = $state<Driver | null>(null);

	function blank() {
		return { fullName: '', phone: '', employeeNo: '', licenseNo: '', licenseClass: '', licenseExpiry: '', status: 'active', notes: '' };
	}
	let form = $state(blank());

	function openCreate() {
		editing = null;
		form = blank();
		formError = '';
		showForm = true;
	}
	function openEdit(d: Driver) {
		editing = d;
		form = {
			fullName: d.fullName ?? '',
			phone: d.phone ?? '',
			employeeNo: d.employeeNo ?? '',
			licenseNo: d.licenseNo ?? '',
			licenseClass: d.licenseClass ?? '',
			licenseExpiry: d.licenseExpiry ? d.licenseExpiry.slice(0, 10) : '',
			status: d.status ?? 'active',
			notes: d.notes ?? ''
		};
		formError = '';
		showForm = true;
	}

	async function save() {
		if (!form.fullName.trim()) {
			formError = 'A name is required.';
			return;
		}
		saving = true;
		formError = '';
		try {
			if (editing) await driverActions.update(editing.id, form);
			else await driverActions.create(form);
			showForm = false;
			load(0);
		} catch (e: any) {
			formError = e?.response?.data?.message ?? 'Could not save the driver.';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		if (!confirmingDelete) return;
		try {
			await driverActions.remove(confirmingDelete.id);
			confirmingDelete = null;
			load(0);
		} catch (e: any) {
			formError = e?.response?.data?.message ?? 'Could not remove the driver.';
		}
	}

	const LICENCE_CLASSES = ['A', 'B1', 'B1 Umum', 'B2', 'B2 Umum', 'C'].map((c) => ({ value: c, label: c }));
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Users} subtitle="People who drive your trucks. Assign one to a truck from the truck's page; give one a login from User Management.">
		{#snippet actions()}
			<Button variant="outline" href="{basePath}/drivers/onboarding"><UserPlus size={14} /> Registrasi K-Trip</Button>
			<Button onclick={openCreate}><Plus size={14} /> Add Driver</Button>
		{/snippet}
	</PageHeader>

	{#if $driverStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{$driverStore.error}</p>
	{/if}

	<div class="order-toolbar">
		<Tabs tabs={TABS} {activeTab} onChange={(id) => { activeTab = id; load(0); }} />
		<div class="order-toolbar-actions" style="display:flex; gap:8px; align-items:center;">
			<div style="width:260px;"><Input bind:value={search} placeholder="Name, phone or employee no…" onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && load(0)} /></div>
			<button type="button" class="btn btn-outline btn-sm" onclick={() => load(0)}><Search size={14} /> Search</button>
		</div>
	</div>

	<DataTable
		{columns}
		data={$driverStore.drivers}
		loading={$driverStore.loading}
		{pageSize}
		totalRows={$driverStore.totalRows}
		emptyMessage="No drivers yet"
		onPageChange={(p) => load(p)}
		onPageSizeChange={(size) => { pageSize = size; load(0); }}
	>
		{#snippet cell(row: any, column: Column, text: string)}
			{#if column.key === 'status'}
				<StatusBadge statusCode={row.status ?? ''} label={row.status ?? ''} />
			{:else if column.key === 'actions'}
				<div class="action-cell" style="justify-content:flex-end;">
					<button type="button" class="frozen-icon-btn" title="Edit" onclick={() => openEdit(row)}><Pencil size={14} /></button>
					<button type="button" class="frozen-icon-btn" title="Remove" onclick={() => (confirmingDelete = row)}><Trash2 size={14} /></button>
				</div>
			{:else}
				{text}
			{/if}
		{/snippet}
	</DataTable>
</div>

<Modal open={showForm} size="lg" title={editing ? `Edit ${editing.fullName}` : 'Add Driver'} onClose={() => (showForm = false)}>
	<FormGrid>
		<Field label="Full Name" id="dr-name" required><Input id="dr-name" bind:value={form.fullName} /></Field>
		<Field label="Phone" id="dr-phone" help="Unique within your company."><Input id="dr-phone" bind:value={form.phone} placeholder="08xx…" /></Field>
		<Field label="Employee No" id="dr-emp"><Input id="dr-emp" bind:value={form.employeeNo} /></Field>
		<Field label="Status" id="dr-status"><Select id="dr-status" bind:value={form.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} /></Field>
		<Field label="Licence (SIM) Number" id="dr-lic"><Input id="dr-lic" bind:value={form.licenseNo} /></Field>
		<Field label="Licence Class" id="dr-cls"><Select id="dr-cls" bind:value={form.licenseClass} options={LICENCE_CLASSES} placeholder="—" /></Field>
		<Field label="Licence Expiry" id="dr-exp"><Input id="dr-exp" type="date" bind:value={form.licenseExpiry} /></Field>
		<Field label="Notes" id="dr-notes" class="!mb-0"><Input id="dr-notes" bind:value={form.notes} /></Field>
	</FormGrid>
	{#if formError}
		<div class="note-banner note-banner-error" role="alert"><span>⛔</span><div>{formError}</div></div>
	{/if}
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (showForm = false)}>Cancel</button>
		<Button onclick={save} loading={saving}>{editing ? 'Save' : 'Add Driver'}</Button>
	{/snippet}
</Modal>

<Modal open={confirmingDelete !== null} title="Remove driver" onClose={() => (confirmingDelete = null)}>
	<p class="text-sm">Remove <b>{confirmingDelete?.fullName}</b>? Any truck assigned to them is released.</p>
	{#snippet footer()}
		<button type="button" class="btn btn-outline" onclick={() => (confirmingDelete = null)}>Cancel</button>
		<Button variant="danger" onclick={remove}>Remove</Button>
	{/snippet}
</Modal>
