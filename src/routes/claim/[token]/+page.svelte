<script lang="ts">
	/**
	 * The shipper's side of a claim link. A transporter records a client as a
	 * company before the client has any account and sends them this link;
	 * opening it shows which business is on offer (GET /claim/:token), and
	 * the form creates the first user and takes ownership (POST /claim/:token).
	 *
	 * Public by necessity — the claimant has no account yet — and in the
	 * login page's own style, since it is the same moment: a person's first
	 * door into the console.
	 */
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Eye, EyeOff, Truck, Building2 } from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { BRAND, LOGIN_ILLUSTRATION_READY } from '$lib/constants/assets';
	import Button from '$lib/components/ui/Button.svelte';

	let token = $derived(($page.params as Record<string, string>).token ?? '');
	let companyName = $state('');
	let checking = $state(true);
	let error = $state('');
	let done = $state('');

	let fullName = $state('');
	let email = $state('');
	let phone = $state('');
	let npwp = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let loading = $state(false);

	onMount(async () => {
		try {
			const res = await api.get(`/claim/${encodeURIComponent(token)}`);
			companyName = res.data?.data?.companyName ?? '';
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'That link is not valid.';
		} finally {
			checking = false;
		}
	});

	async function claim(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		loading = true;
		try {
			const res = await api.post(`/claim/${encodeURIComponent(token)}`, {
				fullName: fullName.trim(),
				email: email.trim(),
				phone: phone.trim(),
				npwp: npwp.trim(),
				password
			});
			done = res.data?.message ?? 'Your company is ready. Sign in with the account you just created.';
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not complete the claim.';
		} finally {
			loading = false;
		}
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-surface p-6">
	<div class="grid w-full max-w-5xl overflow-hidden rounded-[28px] border border-line-card md:grid-cols-2">
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

		<div class="flex items-center justify-center px-8 py-12 md:px-12">
			{#if checking}
				<p class="text-sm text-muted">Memeriksa tautan…</p>
			{:else if done}
				<div class="w-full max-w-sm text-center">
					<div class="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-soft">
						<Building2 size={30} class="text-cyan" />
					</div>
					<h1 class="mb-3 text-xl font-semibold text-ink">{companyName}</h1>
					<p class="mb-8 text-sm text-muted">{done}</p>
					<Button onclick={() => goto('/auth')}>Masuk</Button>
				</div>
			{:else if !companyName}
				<div class="w-full max-w-sm text-center">
					<h1 class="mb-3 text-xl font-semibold text-ink">Tautan tidak valid</h1>
					<p class="text-sm text-muted">{error}</p>
				</div>
			{:else}
				<form onsubmit={claim} class="w-full max-w-sm">
					<p class="mb-1 text-center text-xs font-semibold uppercase tracking-wide text-muted">
						Klaim perusahaan
					</p>
					<h1 class="mb-2 text-center text-xl font-semibold text-ink">{companyName}</h1>
					<p class="mb-8 text-center text-sm text-muted">
						Buat akun pertama untuk perusahaan ini. Anda akan menjadi administratornya.
					</p>

					<div class="mb-4">
						<label for="fullName" class="mb-2 block text-sm font-semibold text-ink">Nama lengkap</label>
						<input
							id="fullName"
							bind:value={fullName}
							type="text"
							required
							disabled={loading}
							class="h-12 w-full rounded-input border border-line-input bg-surface px-5 text-sm text-ink focus:border-cyan disabled:bg-canvas"
						/>
					</div>
					<div class="mb-4">
						<label for="email" class="mb-2 block text-sm font-semibold text-ink">Email</label>
						<input
							id="email"
							bind:value={email}
							type="email"
							autocomplete="email"
							required
							disabled={loading}
							class="h-12 w-full rounded-input border border-line-input bg-surface px-5 text-sm text-ink focus:border-cyan disabled:bg-canvas"
						/>
					</div>
					<div class="mb-4">
						<label for="phone" class="mb-2 block text-sm font-semibold text-ink">No. HP</label>
						<input
							id="phone"
							bind:value={phone}
							type="tel"
							autocomplete="tel"
							disabled={loading}
							class="h-12 w-full rounded-input border border-line-input bg-surface px-5 text-sm text-ink focus:border-cyan disabled:bg-canvas"
						/>
					</div>
					<div class="mb-4">
						<label for="npwp" class="mb-2 block text-sm font-semibold text-ink">NPWP perusahaan</label>
						<input
							id="npwp"
							bind:value={npwp}
							type="text"
							required
							disabled={loading}
							placeholder="01.234.567.8-901.000"
							class="h-12 w-full rounded-input border border-line-input bg-surface px-5 text-sm text-ink focus:border-cyan disabled:bg-canvas"
						/>
					</div>
					<div class="mb-8">
						<label for="password" class="mb-2 block text-sm font-semibold text-ink">Password</label>
						<div class="relative">
							<input
								id="password"
								bind:value={password}
								type={showPassword ? 'text' : 'password'}
								autocomplete="new-password"
								required
								minlength="8"
								disabled={loading}
								class="h-12 w-full rounded-input border border-line-input bg-surface px-5 pr-12 text-sm text-ink focus:border-cyan disabled:bg-canvas"
							/>
							<button
								type="button"
								class="absolute right-4 top-1/2 -translate-y-1/2 text-muted"
								onclick={() => (showPassword = !showPassword)}
								aria-label="Toggle password"
							>
								{#if showPassword}<EyeOff size={18} />{:else}<Eye size={18} />{/if}
							</button>
						</div>
					</div>

					{#if error}<p class="mb-4 text-sm text-danger">{error}</p>{/if}

					<Button type="submit" {loading} class="w-full">Klaim & buat akun</Button>
				</form>
			{/if}
		</div>
	</div>
</div>
