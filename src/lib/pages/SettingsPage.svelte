<script lang="ts">
	import { Settings } from 'lucide-svelte';
	import { currentUser } from '$lib/stores/auth';
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
	</Card>

	<Card title="Preferences">
		<ul class="space-y-4">
			<li class="flex items-center justify-between gap-6 rounded-card border border-line-card p-4">
				<div>
					<p class="text-xs font-medium text-ink">Pengaturan Cancel Validation</p>
					<p class="text-xs italic text-muted">
						Require a second approval before an order can be cancelled.
					</p>
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
			These switches are stored per company. They are not wired to an endpoint yet — the client
			settings service does not expose one.
		</p>
	</Card>
</div>
