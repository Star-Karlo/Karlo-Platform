<script lang="ts">
	import { page } from '$app/stores';
	import OrderKontrakInvoicePage from '$lib/pages/OrderKontrakInvoicePage.svelte';
</script>

<OrderKontrakInvoicePage id={$page.params.id ?? ''} basePath="/m" />
