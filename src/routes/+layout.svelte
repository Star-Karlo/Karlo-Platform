<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth';
	import { isPublicPath } from '$lib/constants/publicRoutes';
	import AppHeader from '$lib/components/layout/AppHeader.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';

	let { children } = $props();

	let isAuthPage = $derived(isPublicPath($page.url.pathname));

	// init() sends a visitor with no session to /auth, which is right
	// everywhere except the pages that exist for people who have none.
	onMount(() => {
		if (!isPublicPath(window.location.pathname)) authStore.init();
	});
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
