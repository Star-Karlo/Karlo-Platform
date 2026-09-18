<script lang="ts">
	/**
	 * The bare origin. Nothing lives here: once the session is known, go to
	 * the console's own landing page (the sidebar's first entry), the same
	 * place a sign-in lands.
	 */
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { homeForIdentity } from '$lib/constants/nav';

	$effect(() => {
		if (!$authStore.ready) return;
		goto($authStore.isAuthenticated ? homeForIdentity($authStore.user ?? {}) : '/auth', {
			replaceState: true
		});
	});
</script>
