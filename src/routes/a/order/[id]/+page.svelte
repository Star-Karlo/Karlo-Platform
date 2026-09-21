<script lang="ts">
	import { page } from '$app/stores';
	import OrderDetailDispatchPage from '$lib/pages/OrderDetailDispatchPage.svelte';
</script>

{#key $page.params.id}
	<OrderDetailDispatchPage id={$page.params.id ?? ''} basePath="/a" />
{/key}
