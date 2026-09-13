<script lang="ts">
	/**
	 * A company's own roles, and what each one grants.
	 *
	 * The permission list offered here is the catalogue NARROWED to what the
	 * company has been sold. Offering the rest would be offering checkboxes
	 * that do nothing — the server refuses a key the company cannot grant
	 * rather than silently dropping it, so an editor showing them would produce
	 * an error the administrator could not act on.
	 */
	import { onMount } from 'svelte';
	import { UserCog, Pencil, Trash2, Lock } from 'lucide-svelte';
	import { roleStore, roleActions, bareKey, PRODUCTS, type Product, type Role, type PermissionSpec } from '$lib/stores/iam';
	import { authStore } from '$lib/stores/auth';
	import {
		Button,
		Card,
		DataTable,
		Field,
		Input,
		Modal,
		PageHeader,
		type Column
	} from '$lib/components/ui';

	let { title = 'Roles & Permissions' }: { title?: string } = $props();

	let showForm = $state(false);
	let editing = $state<Role | null>(null);
	let confirmingDelete = $state<Role | null>(null);

	let form = $state({ name: '', description: '', grantsAll: false });
	let chosen = $state<Set<string>>(new Set());

	/**
	 * Which product's keys the editor shows. A role holds both products'
	 * keys; the editor works on one at a time and the server leaves the
	 * other product's keys alone. The FMS tab appears only where FMS is in
	 * play: Karlo staff, or a company that holds an FMS product.
	 */
	let product = $state<Product>('tms');
	let showProducts = $derived(
		($authStore.user?.isPlatformStaff ?? false) || Boolean($authStore.user?.access?.fms)
	);

	onMount(() => void roleActions.load(product));

	async function switchProduct(p: Product) {
		if (p === product) return;
		product = p;
		showForm = false;
		await roleActions.load(product);
	}

	/** The assignable catalogue, grouped the way the editor reads. */
	let groups = $derived(
		$roleStore.assignable.reduce<Record<string, PermissionSpec[]>>((acc, spec) => {
			(acc[spec.group] ??= []).push(spec);
			return acc;
		}, {})
	);

	function openCreate() {
		editing = null;
		form = { name: '', description: '', grantsAll: false };
		chosen = new Set();
		showForm = true;
	}

	function openEdit(role: Role) {
		editing = role;
		form = { name: role.name, description: role.description ?? '', grantsAll: role.grantsAll };
		// Roles store product-qualified keys; the catalogue is bare.
		chosen = new Set((role.permissions ?? []).map(bareKey));
		showForm = true;
	}

	function toggle(key: string) {
		const next = new Set(chosen);
		next.has(key) ? next.delete(key) : next.add(key);
		chosen = next;
	}

	function toggleGroup(group: string) {
		const keys = groups[group].map((s) => s.key);
		const all = keys.every((k) => chosen.has(k));
		const next = new Set(chosen);
		for (const k of keys) (all ? next.delete(k) : next.add(k));
		chosen = next;
	}

	async function save() {
		const ok = await roleActions.save({
			id: editing?.id,
			name: form.name,
			description: form.description,
			grantsAll: form.grantsAll,
			permissions: form.grantsAll ? [] : [...chosen]
		}, product);
		if (ok) {
			showForm = false;
			await roleActions.load(product);
		}
	}

	async function remove() {
		if (!confirmingDelete) return;
		if (await roleActions.remove(confirmingDelete.id)) {
			confirmingDelete = null;
			await roleActions.load(product);
		}
	}

	const columns: Column[] = [
		{ key: 'name', label: 'Role' },
		{ key: 'description', label: 'Description', format: (r) => r.description ?? '-' },
		{
			key: 'permissions',
			label: 'Grants',
			format: (r: Role) =>
				r.grantsAll ? 'Everything the company holds' : `${r.permissions?.length ?? 0} permissions`
		},
		{ key: '__actions', label: '', align: 'right', width: '90px' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		{title}
		icon={UserCog}
		subtitle="What each role in your company may do. Limited to the features Karlo has enabled for you."
	>
		{#snippet actions()}
			<Button onclick={openCreate}>+ Add Role</Button>
		{/snippet}
	</PageHeader>

	{#if showProducts}
		<div class="order-tabs-row" role="tablist" aria-label="Product">
			{#each PRODUCTS as p}
				<button
					type="button"
					role="tab"
					aria-selected={product === p.value}
					class="order-tab {product === p.value ? 'active' : ''}"
					onclick={() => switchProduct(p.value)}
				>
					{p.label} permissions
				</button>
			{/each}
		</div>
	{/if}

	{#if $roleStore.error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
			{$roleStore.error}
		</p>
	{/if}

	<Card title="Roles" header="accent" padded={false}>
		<DataTable
			{columns}
			data={$roleStore.roles}
			loading={$roleStore.loading}
			totalRows={$roleStore.roles.length}
			pageSize={$roleStore.roles.length || 1}
			emptyMessage="No roles defined yet"
		>
			{#snippet cell(row: Role, column: Column, text: string)}
				{#if column.key === '__actions'}
					<div class="flex items-center justify-end gap-3">
						<button
							type="button"
							class="text-muted hover:text-cyan"
							aria-label="Edit {row.name}"
							onclick={() => openEdit(row)}
						>
							<Pencil size={14} />
						</button>
						{#if row.isSystem}
							<!-- The Administrator every company gets. It is what
							     the company falls back on when everything else is
							     misconfigured, so it cannot be deleted. -->
							<span class="text-muted" title="Maintained by the platform">
								<Lock size={14} />
							</span>
						{:else}
							<button
								type="button"
								class="text-muted hover:text-danger"
								aria-label="Remove {row.name}"
								onclick={() => (confirmingDelete = row)}
							>
								<Trash2 size={14} />
							</button>
						{/if}
					</div>
				{:else}
					{text}
				{/if}
			{/snippet}
		</DataTable>
	</Card>
</div>

<Modal open={showForm} title={editing ? `Edit ${editing.name}` : 'Add Role'} size="lg" onClose={() => (showForm = false)}>
	<div class="space-y-5">
		<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
			<Field id="role-name" label="Name" required>
				<Input id="role-name" bind:value={form.name} placeholder="cth. Sales" />
			</Field>
			<Field id="role-desc" label="Description">
				<Input id="role-desc" bind:value={form.description} placeholder="Creates agreements and orders" />
			</Field>
		</div>

		<label class="flex items-start gap-3 rounded-card bg-zebra p-4">
			<input type="checkbox" bind:checked={form.grantsAll} class="mt-0.5 h-4 w-4 accent-cyan" />
			<span class="text-xs">
				<span class="font-medium text-ink">Administrator — grants everything</span>
				<span class="mt-1 block leading-relaxed text-muted">
					Everything the company is entitled to, now and after the next purchase. Listing
					permissions instead would go stale the day you buy another module, and the
					administrator would silently not have it.
				</span>
			</span>
		</label>

		{#if !form.grantsAll}
			<div class="space-y-4">
				<p class="text-xs text-muted">
					{chosen.size} of {$roleStore.assignable.length} permissions selected. Only what
					Karlo has enabled for your company is listed.
				</p>

				{#each Object.keys(groups).sort() as group}
					<div class="rounded-card border border-line-card">
						<div class="flex items-center justify-between border-b border-line-card px-4 py-2.5">
							<span class="text-xs font-semibold text-ink">{group}</span>
							<button
								type="button"
								class="text-xs text-cyan hover:underline"
								onclick={() => toggleGroup(group)}
							>
								Toggle all
							</button>
						</div>
						<div class="grid grid-cols-1 gap-2 p-4 md:grid-cols-2">
							{#each groups[group] as spec}
								<label class="flex items-start gap-2.5 text-xs">
									<input
										type="checkbox"
										checked={chosen.has(spec.key)}
										onchange={() => toggle(spec.key)}
										class="mt-0.5 h-3.5 w-3.5 shrink-0 accent-cyan"
									/>
									<span>
										<span class="text-ink">{spec.label}</span>
										<span class="ml-1 font-mono text-[10px] text-muted">{spec.key}</span>
									</span>
								</label>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}

		{#if $roleStore.error}
			<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
				{$roleStore.error}
			</p>
		{/if}

		<div class="flex justify-end gap-2 border-t border-line-card pt-5">
			<Button variant="ghost" onclick={() => (showForm = false)}>Cancel</Button>
			<Button onclick={save} loading={$roleStore.saving} disabled={!form.name.trim()}>Save</Button>
		</div>
	</div>
</Modal>

<Modal open={!!confirmingDelete} title="Remove role" onClose={() => (confirmingDelete = null)}>
	<p class="text-xs text-ink">
		Remove <span class="font-medium">{confirmingDelete?.name}</span>?
	</p>
	<p class="mt-2 text-xs text-muted">
		Anyone still holding it must be moved to another role first — the server refuses otherwise,
		because an account pointing at a deleted role reads as having no permissions at all.
	</p>
	<div class="mt-4 flex justify-end gap-2">
		<Button variant="ghost" onclick={() => (confirmingDelete = null)}>Cancel</Button>
		<Button variant="danger" onclick={remove} loading={$roleStore.saving}>Remove</Button>
	</div>
</Modal>
