<script lang="ts">
	/**
	 * The people in a company, and what each may do.
	 *
	 * This is the INNER tier of the two-tier model. Karlo sells a company its
	 * features; the company's own administrator then hands out permissions from
	 * within them, by putting each colleague in a role. Nobody here can grant
	 * something the company was never sold — the role editor is already
	 * narrowed to that, so this screen only has to choose between roles.
	 */
	import { onMount } from 'svelte';
	import { Users, Shield, Ban, KeyRound } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { roleStore, roleActions, bareKey } from '$lib/stores/iam';
	import { can, authStore } from '$lib/stores/auth';
	import { actingFor } from '$lib/stores/actingFor';
	import { formatDate } from '$lib/utils/format';
	import {
		Button,
		Card,
		DataTable,
		Field,
		Input,
		Modal,
		PageHeader,
		Select,
		StatusBadge,
		type Column
	} from '$lib/components/ui';

	interface Member {
		id: string;
		fullName?: string;
		username?: string;
		email?: string;
		phone?: string;
		roleId?: string;
		role?: string;
		isSuspended?: boolean;
		isPlatformStaff?: boolean;
		createdAt?: string;
	}

	let members = $state<Member[]>([]);
	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let search = $state('');

	let showInvite = $state(false);
	let saving = $state(false);
	let assigning = $state<Member | null>(null);
	let chosenRole = $state('');

	let mayManage = $derived($can('collaboration.manageMember'));
	let mayInvite = $derived($can('collaboration.inviteMember'));
	let isStaff = $derived($authStore.user?.isPlatformStaff ?? false);

	let form = $state({ fullName: '', email: '', username: '', phone: '', password: '', roleId: '' });

	onMount(async () => {
		await Promise.all([load(), roleActions.load()]);
	});

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await api.get(ENDPOINTS.users.list, { page: 0, pageSize: 200 });
			members = res.data?.data ?? [];
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not load your people.';
			members = [];
		} finally {
			loading = false;
		}
	}

	let roleOptions = $derived(
		$roleStore.roles.map((r) => ({
			value: r.id,
			label: r.grantsAll ? `${r.name} — everything` : `${r.name} — ${r.permissions?.length ?? 0} permissions`
		}))
	);

	let filtered = $derived(
		members.filter((m) => {
			const q = search.trim().toLowerCase();
			if (!q) return true;
			return `${m.fullName ?? ''} ${m.username ?? ''} ${m.email ?? ''}`.toLowerCase().includes(q);
		})
	);

	function roleName(id?: string): string {
		return $roleStore.roles.find((r) => r.id === id)?.name ?? '—';
	}

	async function invite() {
		saving = true;
		error = '';
		try {
			await api.post(ENDPOINTS.users.registerMember, {
				fullName: form.fullName,
				email: form.email,
				username: form.username || undefined,
				phone: form.phone || undefined,
				password: form.password,
				// The legacy role string is still required by the service
				// alongside the role id; the ID is what decides access.
				role: 'staff',
				roleId: form.roleId
			});
			showInvite = false;
			notice = 'Account created with that role.';
			form = { fullName: '', email: '', username: '', phone: '', password: '', roleId: '' };
			await load();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not create the account.';
		} finally {
			saving = false;
		}
	}

	// ---------- Extra permissions on top of the role ----------
	// A role is the common case; this is the exception — one person who needs
	// one more key than their role gives. GET/PUT /users/:id/access carries a
	// per-product row with the extra keys; DELETE removes the product from
	// them entirely.
	let accessFor = $state<Member | null>(null);
	let extra = $state<Set<string>>(new Set());
	let accessLoading = $state(false);
	let extraGroups = $derived(
		$roleStore.assignable.reduce<Record<string, typeof $roleStore.assignable>>((acc, spec) => {
			(acc[spec.group] ??= []).push(spec);
			return acc;
		}, {})
	);
	async function openAccess(m: Member) {
		accessFor = m;
		accessLoading = true;
		extra = new Set();
		try {
			const res = await api.get(ENDPOINTS.users.access(m.id));
			const rows: any[] = res.data?.data ?? [];
			const tms = rows.find((r) => r.product === 'tms');
			extra = new Set((tms?.permissions ?? []).map((k: string) => bareKey(k)));
		} catch (e: any) {
			error = e?.response?.data?.message ?? "Could not load this person's access.";
		} finally {
			accessLoading = false;
		}
	}
	function toggleExtra(key: string) {
		const next = new Set(extra);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		extra = next;
	}
	async function saveAccess() {
		if (!accessFor) return;
		saving = true;
		error = '';
		try {
			await api.put(ENDPOINTS.users.access(accessFor.id), {
				product: 'tms',
				permissions: Array.from(extra)
			});
			notice = 'Extra permissions saved. They apply on their next sign-in.';
			accessFor = null;
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save those permissions.';
		} finally {
			saving = false;
		}
	}
	async function revokeTms() {
		if (!accessFor) return;
		if (
			!confirm(
				`Remove ${accessFor.fullName ?? accessFor.email} from TMS entirely? They keep their account but can no longer sign in here.`
			)
		)
			return;
		saving = true;
		error = '';
		try {
			await api.delete(ENDPOINTS.users.revokeAccess(accessFor.id, 'tms'));
			notice = 'TMS access removed.';
			accessFor = null;
			await load();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not remove their access.';
		} finally {
			saving = false;
		}
	}

	// ---------- Is that email / username still free? ----------
	// Asked as the field loses focus, so the answer is on screen before the
	// person types the rest of the form and hits Create.
	let taken = $state<{ email?: boolean; username?: boolean }>({});
	async function checkAvailable(kind: 'email' | 'username') {
		const value = form[kind].trim();
		if (!value) {
			taken = { ...taken, [kind]: undefined };
			return;
		}
		try {
			const res = await api.get(ENDPOINTS.auth.checkAvailable(kind), { value });
			taken = { ...taken, [kind]: res.data?.data?.available === false };
		} catch {
			/* the service will say so on Create */
		}
	}

	async function assignRole() {
		if (!assigning || !chosenRole) return;
		saving = true;
		error = '';
		try {
			await api.put(ENDPOINTS.users.role(assigning.id), { roleId: chosenRole });
			assigning = null;
			notice = 'Role assigned. They see the change on their next sign-in.';
			await load();
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not assign that role.';
		} finally {
			saving = false;
		}
	}

	const columns: Column[] = [
		{ key: 'fullName', label: 'Name', format: (r) => r.fullName ?? r.username ?? '—' },
		{ key: 'email', label: 'Email', format: (r) => r.email ?? '—' },
		{ key: 'roleId', label: 'Role', format: (r: Member) => roleName(r.roleId) },
		{ key: 'isSuspended', label: 'Status' },
		{ key: '__actions', label: '', align: 'right', width: '110px' }
	];
</script>

<div class="space-y-gutter">
	<PageHeader
		title="User Management"
		icon={Users}
		subtitle={$actingFor.companyId ? $actingFor.companyName : undefined}
	>
		{#snippet actions()}
			<Button variant="outline" href="roles">Roles &amp; Permissions</Button>
			{#if mayInvite}
				<Button onclick={() => (showInvite = true)}>+ Add User</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if notice}
		<p class="rounded-card bg-zebra px-4 py-3 text-xs text-ink" role="status">{notice}</p>
	{/if}
	{#if error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	<!-- Says the model out loud, because the two tiers are easy to conflate:
	     a role can only ever offer what the company was sold. -->
	<p class="rounded-card bg-zebra px-4 py-3 text-xs leading-relaxed text-muted">
		Karlo enables features for your company; you decide which of them each person gets by putting them in a
		role. A role cannot grant something your company does not hold.
	</p>

	<Card title="People" header="accent" padded={false}>
		<div class="border-b border-line-card px-5 py-4">
			<label for="u-search" class="form-label">Search</label>
			<Input id="u-search" bind:value={search} placeholder="Name, username or email…" />
		</div>

		<DataTable
			{columns}
			data={filtered}
			{loading}
			totalRows={filtered.length}
			pageSize={filtered.length || 1}
			emptyMessage="Nobody else in this company yet"
		>
			{#snippet cell(row: Member, column: Column, text: string)}
				{#if column.key === 'isSuspended'}
					<StatusBadge
						statusCode={row.isSuspended ? 'cancelled' : 'active'}
						label={row.isSuspended ? 'Suspended' : 'Active'}
					/>
				{:else if column.key === '__actions'}
					{#if mayManage}
						<button
							type="button"
							class="flex items-center gap-1 text-xs text-cyan hover:underline"
							onclick={() => {
								assigning = row;
								chosenRole = row.roleId ?? '';
							}}
						>
							<Shield size={12} /> Role
						</button>
						<button
							type="button"
							class="mt-1 flex items-center gap-1 text-xs text-cyan hover:underline"
							onclick={() => openAccess(row)}
						>
							<KeyRound size={12} /> Access
						</button>
					{/if}
				{:else}
					{text}
				{/if}
			{/snippet}
		</DataTable>
	</Card>
</div>

<Modal open={showInvite} title="Add User" onClose={() => (showInvite = false)}>
	<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
		<Field id="u-name" label="Full name" required>
			<Input id="u-name" bind:value={form.fullName} placeholder="cth. Budi Santoso" />
		</Field>
		<Field id="u-email" label="Email" required error={taken.email ? 'Email ini sudah dipakai.' : ''}>
			<Input
				id="u-email"
				type="email"
				bind:value={form.email}
				placeholder="budi@perusahaan.id"
				onblur={() => checkAvailable('email')}
			/>
		</Field>
		<Field id="u-username" label="Username" error={taken.username ? 'Username ini sudah dipakai.' : ''}>
			<Input
				id="u-username"
				bind:value={form.username}
				placeholder="budi"
				onblur={() => checkAvailable('username')}
			/>
		</Field>
		<Field id="u-phone" label="Phone">
			<Input id="u-phone" bind:value={form.phone} placeholder="081234567890" />
		</Field>
		<Field
			id="u-password"
			label="Temporary password"
			required
			help="They should change it after signing in."
			wide
		>
			<Input id="u-password" type="password" bind:value={form.password} />
		</Field>

		<Field
			id="u-role-new"
			label="Role"
			required
			help="What they may do. The service refuses an invite with no role rather than guessing — guessing high grants access nobody chose, and guessing low creates an account that cannot work."
			wide
		>
			<Select id="u-role-new" bind:value={form.roleId} options={roleOptions} placeholder="Choose a role" />
		</Field>

		<div class="flex justify-end gap-2 border-t border-line-card pt-5 md:col-span-2">
			<Button variant="ghost" onclick={() => (showInvite = false)}>Cancel</Button>
			<Button
				onclick={invite}
				loading={saving}
				disabled={!form.fullName.trim() ||
					!form.email.trim() ||
					!form.password ||
					!form.roleId ||
					!!taken.email ||
					!!taken.username}
			>
				Create
			</Button>
		</div>
	</div>
</Modal>

<Modal open={!!assigning} title="Assign role" onClose={() => (assigning = null)}>
	<p class="mb-4 text-xs text-ink">
		What may <span class="font-medium">{assigning?.fullName ?? assigning?.email}</span> do?
	</p>

	<Field id="u-role" label="Role" required>
		<Select id="u-role" bind:value={chosenRole} options={roleOptions} placeholder="Choose a role" />
	</Field>

	<p class="mt-3 text-xs leading-relaxed text-muted">
		Their existing sessions are ended, so the change takes effect at once rather than when their current token
		expires.
	</p>

	<div class="mt-5 flex justify-end gap-2 border-t border-line-card pt-5">
		<Button variant="ghost" onclick={() => (assigning = null)}>Cancel</Button>
		<Button onclick={assignRole} loading={saving} disabled={!chosenRole}>Assign</Button>
	</div>
</Modal>

<Modal open={!!accessFor} title="Extra permissions" onClose={() => (accessFor = null)}>
	<p class="mb-4 text-xs text-ink">
		Keys <span class="font-medium">{accessFor?.fullName ?? accessFor?.email}</span> holds on top of their role
		<span class="font-medium">{roleName(accessFor?.roleId)}</span>. The role stays as it is; these are this
		one person's exceptions.
	</p>

	{#if accessLoading}
		<p class="text-xs text-muted">Loading…</p>
	{:else}
		<div class="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
			{#each Object.keys(extraGroups).sort() as group (group)}
				<div class="rounded-card border border-line-card">
					<p class="border-b border-line-card px-4 py-2 text-xs font-semibold text-ink">{group}</p>
					<div class="grid grid-cols-1 gap-2 p-4 md:grid-cols-2">
						{#each extraGroups[group] as spec (spec.key)}
							<label class="flex items-start gap-2.5 text-xs">
								<input
									type="checkbox"
									checked={extra.has(spec.key)}
									onchange={() => toggleExtra(spec.key)}
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

	<div class="mt-5 flex items-center justify-between gap-2 border-t border-line-card pt-5">
		<Button variant="danger" onclick={revokeTms} loading={saving}><Ban size={12} /> Remove from TMS</Button>
		<div class="flex gap-2">
			<Button variant="ghost" onclick={() => (accessFor = null)}>Cancel</Button>
			<Button onclick={saveAccess} loading={saving} disabled={accessLoading}>Save</Button>
		</div>
	</div>
</Modal>
