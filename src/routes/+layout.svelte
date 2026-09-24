<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth';
	import AppHeader from '$lib/components/layout/AppHeader.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { children } = $props();

	// Pages a person reaches before they have an account: login, the claim
	// link a transporter sends a new client, the customer's tracking link,
	// and Web-Field — the warehouse PIC at the gate has no account at all,
	// and their credential is the code on the driver's phone.
	const PUBLIC = ['/auth', '/claim/', '/track/', '/field/', '/webfield'];
	let isAuthPage = $derived(PUBLIC.some((prefix) => $page.url.pathname.startsWith(prefix)));

	onMount(() => authStore.init());
</script>

{#if isAuthPage}
	{@render children()}
{:else if $authStore.isAuthenticated}
	<!-- The ported shell: a navy header spanning the full width, then the
	     sidebar and content side by side beneath it. -->
	<AppHeader />
	<div class="shell">
		<Sidebar />
		<div class="main">
			<main class="content">
				{@render children()}
			</main>
		</div>
	</div>
{:else}
	<div class="flex h-screen flex-col items-center justify-center gap-4 bg-canvas">
		<Spinner size={40} />
		<p class="text-sm text-muted">Loading…</p>
	</div>
{/if}
