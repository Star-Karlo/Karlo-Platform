<script lang="ts">
	import { page } from '$app/stores';
	import OrderKontrakDetailPage from '$lib/pages/OrderKontrakDetailPage.svelte';
</script>

{#key $page.params.id}
	<OrderKontrakDetailPage id={$page.params.id ?? ''} basePath="/a" />
{/key}
