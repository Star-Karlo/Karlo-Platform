<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Eye, EyeOff, Truck } from 'lucide-svelte';
	import { authStore } from '$lib/stores/auth';
	import { sharedSession } from '$lib/utils/session';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { homeForIdentity } from '$lib/constants/nav';
	import { BRAND, LOGIN_ILLUSTRATION_READY } from '$lib/constants/assets';
	import Button from '$lib/components/ui/Button.svelte';

	let identifier = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let loading = $state(false);
	let error = $state('');

	/**
	 * Where a user lands is derived from their navigation rather than a second
	 * map kept here, so the two cannot disagree.
	 *
	 * Takes the whole identity, not the role name: since roles became dynamic
	 * the name is company-chosen text, and the console is chosen from the
	 * company's side of the market instead.
	 */
	function land(user: any, token: string) {
		authStore.login(token, user);
		goto(homeForIdentity(user ?? {}));
	}

	async function signIn(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		loading = true;

		try {
			// The service folds email, username and phone into one identifier.
			// `product` turns "signed in but every screen is empty" into a clear
			// 403 for an account without TMS access.
			const res = await api.post(ENDPOINTS.auth.login, {
				email: identifier,
				password,
				product: 'tms'
			});
			const { token, user } = res.data.data;
			api.setToken(token);
			// The refresh token is not in the body for us to keep: the service
			// set it as an HttpOnly cookie on the shared Karlo domain, which is
			// what signs FMS in too and keeps this session alive past the
			// short access token.
			land(user, token);
		} catch (e: any) {
			// Two different failures land here and they are not the same thing.
			//
			// A rejected request carries a server message, and the service
			// returns the same one whatever went wrong so this endpoint cannot
			// be used to discover which accounts exist. Anything WITHOUT a
			// response is our own code throwing after a successful sign-in —
			// which previously reported "could not sign in" for a login that
			// had in fact worked, sending everyone to check their password.
			if (e?.response) {
				error = e.response.data?.message ?? 'Could not sign in. Please try again.';
			} else {
				console.error('sign-in succeeded but the app failed to continue', e);
				error = 'Signed in, but this page could not load. Please reload.';
			}
			loading = false;
		}
	}

	async function adopt(): Promise<boolean> {
		loading = true;
		if (await authStore.adoptShared()) {
			const me = (await api.get(ENDPOINTS.auth.me)).data?.data;
			goto(homeForIdentity(me ?? {}));
			return true;
		}
		loading = false;
		return false;
	}

	onMount(() => {
		// Someone signs in on the other Karlo app while this page sits open:
		// the marker appears, and this tab is signed in the same way a fresh
		// load would be.
		let last = sharedSession.who();
		const timer = setInterval(() => {
			const now = sharedSession.who();
			if (now && now !== last && !loading) void adopt();
			last = now;
		}, 1000);
		return () => clearInterval(timer);
	});

	onMount(async () => {
		// Already signed in on another Karlo app (or another tab): the shared
		// cookie signs this one in without the form.
		if (sharedSession.present()) {
			if (await adopt()) return;
		}

		// A token in the query string is still accepted, so an existing link from
		// another Karlo product keeps working.
		const token = $page.url.searchParams.get('token');
		if (!token) return;

		loading = true;
		try {
			api.setToken(token);
			const res = await api.get(ENDPOINTS.auth.me);
			land(res.data.data, token);
		} catch {
			error = 'That sign-in link is no longer valid. Please sign in below.';
			loading = false;
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-surface p-6">
	<div
		class="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line-card
		       md:grid-cols-2"
	>
		<!-- Illustration panel -->
		<div class="hidden items-center justify-center bg-surface p-12 md:flex">
			{#if LOGIN_ILLUSTRATION_READY}
				<img src={BRAND.loginIllustration} alt="" class="max-h-[360px] w-full object-contain" />
			{:else}
				<div class="flex flex-col items-center gap-6 text-center">
					<div class="flex h-28 w-28 items-center justify-center rounded-[32px] bg-cyan-soft">
						<Truck size={52} class="text-cyan" />
					</div>
					<div>
						<p class="text-xl font-semibold text-navy">Karlo Platform</p>
						<p class="mt-2 max-w-xs text-sm text-muted">
							Plan, dispatch and track every shipment in one place.
						</p>
					</div>
				</div>
			{/if}
		</div>

		<!-- Form panel -->
		<div class="flex items-center justify-center px-8 py-12 md:px-12">
			<form onsubmit={signIn} class="w-full max-w-sm">
				<h1 class="mb-9 text-center text-xl font-normal text-muted">Login</h1>

				<div class="mb-6">
					<label for="identifier" class="mb-2 block text-base font-semibold text-ink">
						Username / Email
					</label>
					<input
						id="identifier"
						bind:value={identifier}
						type="text"
						autocomplete="username"
						required
						disabled={loading}
						class="h-12 w-full rounded-input border border-line-input bg-surface px-5 text-sm
						       text-ink focus:border-cyan disabled:bg-canvas"
					/>
				</div>

				<div class="mb-8">
					<label for="password" class="mb-2 block text-base font-semibold text-ink">Password</label>
					<div class="relative">
						<input
							id="password"
							bind:value={password}
							type={showPassword ? 'text' : 'password'}
							autocomplete="current-password"
							required
							disabled={loading}
							class="h-12 w-full rounded-input border border-line-input bg-surface px-5 pr-12
							       text-sm text-ink focus:border-cyan disabled:bg-canvas"
						/>
						<button
							type="button"
							class="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
							aria-label={showPassword ? 'Hide password' : 'Show password'}
							onclick={() => (showPassword = !showPassword)}
						>
							{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
						</button>
					</div>
				</div>

				{#if error}
					<p class="mb-5 rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">
						{error}
					</p>
				{/if}

				<div class="flex justify-end">
					<Button
						type="submit"
						variant="primary"
						{loading}
						disabled={!identifier || !password}
						class="h-12 min-w-[180px] rounded-cta text-base font-semibold shadow-btn"
					>
						{loading ? 'Memuat…' : 'Masuk'}
					</Button>
				</div>
			</form>
		</div>
	</div>
</div>
