<script lang="ts">
	import { page } from '$app/stores';
	import SpotOrderDetailPage from '$lib/pages/SpotOrderDetailPage.svelte';
</script>

{#key $page.params.id}
	<SpotOrderDetailPage id={$page.params.id ?? ''} basePath="/a" />
{/key}
