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
	import { Users, Shield, Ban } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { roleStore, roleActions } from '$lib/stores/iam';
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
		subtitle={$actingFor.companyId
			? `${$actingFor.companyName}'s people and what each may do.`
			: 'Your people, and what each may do. Limited to the features Karlo has enabled for you.'}
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
		Karlo enables features for your company; you decide which of them each person gets by
		putting them in a role. A role cannot grant something your company does not hold.
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
		<Field id="u-email" label="Email" required>
			<Input id="u-email" type="email" bind:value={form.email} placeholder="budi@perusahaan.id" />
		</Field>
		<Field id="u-username" label="Username">
			<Input id="u-username" bind:value={form.username} placeholder="budi" />
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
				disabled={!form.fullName.trim() || !form.email.trim() || !form.password || !form.roleId}
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
		Their existing sessions are ended, so the change takes effect at once rather than when
		their current token expires.
	</p>

	<div class="mt-5 flex justify-end gap-2 border-t border-line-card pt-5">
		<Button variant="ghost" onclick={() => (assigning = null)}>Cancel</Button>
		<Button onclick={assignRole} loading={saving} disabled={!chosenRole}>Assign</Button>
	</div>
</Modal>
