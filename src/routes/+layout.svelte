<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page, updated } from '$app/stores';
	import { beforeNavigate } from '$app/navigation';
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

	// A deploy that landed while this tab was open took its chunks with it:
	// the assets are immutable and named by hash, so the ones this page still
	// refers to are now 404. Client-side routing then dies with "Failed to
	// fetch dynamically imported module" and the planner gets a blank page
	// from a tab that worked a moment ago.
	//
	// version.json is polled (see svelte.config.js); once it has moved, the
	// next navigation is handed to the browser instead, which loads the new
	// build. Nothing is interrupted — this only takes effect when the person
	// is already leaving the page they are on.
	beforeNavigate((navigation) => {
		if ($updated && navigation.to?.url) {
			navigation.cancel();
			window.location.href = navigation.to.url.href;
		}
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
