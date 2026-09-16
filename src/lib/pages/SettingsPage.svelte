<script lang="ts">
	import { Settings } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { currentUser, can, authStore } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { ROLES } from '$lib/constants/status';
	import { Button, Card, Input, PageHeader, Toggle } from '$lib/components/ui';

	let { title = 'Settings' }: { title?: string } = $props();

	let profile = $state({
		fullName: $currentUser?.fullName ?? '',
		email: $currentUser?.email ?? '',
		phone: $currentUser?.phone ?? ''
	});

	let passwords = $state({ current: '', next: '', confirm: '' });
	let saving = $state('');
	let message = $state<{ tone: 'ok' | 'error'; text: string } | null>(null);

	/**
	 * The company's own profile — what its documents print. Editable by
	 * whoever may manage members; everyone else sees it read-only.
	 */
	let company = $state({
		name: '',
		legalName: '',
		address: '',
		city: '',
		province: '',
		postalCode: '',
		country: 'ID',
		phone: '',
		email: '',
		website: ''
	});
	let companyLoaded = $state(false);
	let mayEditCompany = $derived($can('collaboration.manageMember'));

	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.companyMe);
			const c = res.data?.data ?? {};
			company = {
				name: c.name ?? '',
				legalName: c.legalName ?? '',
				address: c.address ?? '',
				city: c.city ?? '',
				province: c.province ?? '',
				postalCode: c.postalCode ?? '',
				country: c.country ?? 'ID',
				phone: c.phone ?? '',
				email: c.email ?? '',
				website: c.website ?? ''
			};
			companyLoaded = true;
		} catch {
			companyLoaded = false; // no company on this account (platform staff acting for nobody)
		}
	});

	async function saveCompany() {
		saving = 'company';
		message = null;
		try {
			await api.put(ENDPOINTS.companyMe, company);
			message = { tone: 'ok', text: 'Company profile saved.' };
		} catch (e: any) {
			message = { tone: 'error', text: e?.response?.data?.message ?? 'Could not save the company profile.' };
		} finally {
			saving = '';
		}
	}

	/** Client-level switches. Persisted per company, not per user. */
	let preferences = $state({ cancelValidation: false, agreementRequired: false });

	async function saveProfile() {
		saving = 'profile';
		message = null;
		try {
			await api.put(ENDPOINTS.users.updateMe, profile);
			message = { tone: 'ok', text: 'Profile saved.' };
		} catch (e: any) {
			message = { tone: 'error', text: e?.response?.data?.message ?? 'Could not save the profile.' };
		} finally {
			saving = '';
		}
	}

	// Every session, every device — a lost phone, a shared laptop. The
	// service revokes them all (POST /auth/logout-all); this one follows.
	async function signOutEverywhere() {
		if (!confirm('Sign out of every device, including this one?')) return;
		saving = 'logout-all';
		try {
			await api.post(ENDPOINTS.auth.logoutAll);
		} catch {
			/* the local session goes regardless */
		}
		authStore.logout();
		goto('/auth');
	}

	async function changePassword() {
		if (passwords.next !== passwords.confirm) {
			message = { tone: 'error', text: 'The new passwords do not match.' };
			return;
		}
		saving = 'password';
		message = null;
		try {
			await api.post(ENDPOINTS.auth.changePassword, {
				oldPassword: passwords.current,
				newPassword: passwords.next
			});
			passwords = { current: '', next: '', confirm: '' };
			message = { tone: 'ok', text: 'Password updated.' };
		} catch (e: any) {
			message = { tone: 'error', text: e?.response?.data?.message ?? 'Could not update the password.' };
		} finally {
			saving = '';
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Settings} />

	{#if message}
		<p
			class="rounded-card px-4 py-3 text-xs {message.tone === 'ok'
				? 'bg-success/10 text-success'
				: 'bg-danger/10 text-danger'}"
			role="status"
		>
			{message.text}
		</p>
	{/if}

	<Card title="Profile">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
			<div>
				<label for="fullName" class="form-label">Full Name</label>
				<Input id="fullName" bind:value={profile.fullName} />
			</div>
			<div>
				<label for="email" class="form-label">Email</label>
				<Input id="email" type="email" bind:value={profile.email} />
			</div>
			<div>
				<label for="phone" class="form-label">Phone</label>
				<Input id="phone" bind:value={profile.phone} />
			</div>
			<div>
				<label for="role" class="form-label">Role</label>
				<Input
					id="role"
					disabled
					value={ROLES[($currentUser?.role ?? '').toLowerCase() as keyof typeof ROLES] ??
						$currentUser?.role ??
						''}
				/>
			</div>
		</div>
		<div class="mt-5 flex justify-end">
			<Button variant="primary" loading={saving === 'profile'} onclick={saveProfile}>Save Changes</Button>
		</div>
	</Card>

	{#if companyLoaded}
		<Card title="Company">
			<p class="mb-4 text-xs text-muted">
				What your documents print — the legal name, address and contact details.
			</p>
			<div class="grid grid-cols-1 gap-5 md:grid-cols-2">
				<div>
					<label for="co-name" class="form-label">Display Name</label><Input
						id="co-name"
						bind:value={company.name}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-legal" class="form-label">Legal Name</label><Input
						id="co-legal"
						bind:value={company.legalName}
						placeholder="PT …"
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-phone" class="form-label">Phone</label><Input
						id="co-phone"
						bind:value={company.phone}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-email" class="form-label">Email</label><Input
						id="co-email"
						type="email"
						bind:value={company.email}
						disabled={!mayEditCompany}
					/>
				</div>
				<div class="md:col-span-2">
					<label for="co-address" class="form-label">Address</label><Input
						id="co-address"
						bind:value={company.address}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-city" class="form-label">City</label><Input
						id="co-city"
						bind:value={company.city}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-prov" class="form-label">Province</label><Input
						id="co-prov"
						bind:value={company.province}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-post" class="form-label">Postal Code</label><Input
						id="co-post"
						bind:value={company.postalCode}
						disabled={!mayEditCompany}
					/>
				</div>
				<div>
					<label for="co-web" class="form-label">Website</label><Input
						id="co-web"
						bind:value={company.website}
						disabled={!mayEditCompany}
					/>
				</div>
			</div>
			{#if mayEditCompany}
				<div class="mt-5 flex justify-end">
					<Button onclick={saveCompany} loading={saving === 'company'}>Save Company</Button>
				</div>
			{/if}
		</Card>
	{/if}

	<Card title="Change Password">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div>
				<label for="current" class="form-label">Current Password</label>
				<Input id="current" type="password" bind:value={passwords.current} />
			</div>
			<div>
				<label for="next" class="form-label">New Password</label>
				<Input id="next" type="password" bind:value={passwords.next} />
			</div>
			<div>
				<label for="confirm" class="form-label">Confirm Password</label>
				<Input id="confirm" type="password" bind:value={passwords.confirm} />
			</div>
		</div>
		<div class="mt-5 flex justify-end">
			<Button
				variant="primary"
				loading={saving === 'password'}
				disabled={!passwords.current || !passwords.next}
				onclick={changePassword}>Update Password</Button
			>
		</div>
		<div class="mt-6 flex items-center justify-between gap-6 rounded-card border border-line-card p-4">
			<div>
				<p class="text-xs font-medium text-ink">Sign out everywhere</p>
				<p class="text-xs italic text-muted">
					Ends every session of your account on every device, including this one.
				</p>
			</div>
			<Button variant="outline" loading={saving === 'logout-all'} onclick={signOutEverywhere}
				>Sign out of all devices</Button
			>
		</div>
	</Card>

	<Card title="Preferences">
		<ul class="space-y-4">
			<li class="flex items-center justify-between gap-6 rounded-card border border-line-card p-4">
				<div>
					<p class="text-xs font-medium text-ink">Pengaturan Cancel Validation</p>
					<p class="text-xs italic text-muted">Require a second approval before an order can be cancelled.</p>
				</div>
				<Toggle bind:checked={preferences.cancelValidation} />
			</li>
			<li class="flex items-center justify-between gap-6 rounded-card border border-line-card p-4">
				<div>
					<p class="text-xs font-medium text-ink">Pengaturan Agreement</p>
					<p class="text-xs italic text-muted">
						Refuse orders placed against an agreement that has not been verified.
					</p>
				</div>
				<Toggle bind:checked={preferences.agreementRequired} />
			</li>
		</ul>
		<p class="mt-4 text-xs italic text-muted">
			These switches are stored per company. They are not wired to an endpoint yet — the client settings
			service does not expose one.
		</p>
	</Card>
</div>
