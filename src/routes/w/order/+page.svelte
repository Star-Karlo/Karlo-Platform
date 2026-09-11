<script lang="ts">
	import OrderListPage from '$lib/pages/OrderListPage.svelte';
</script>

<!-- The warehouse sees the same list, but its rows must open the warehouse's
     own detail route rather than the shipper's. -->
<OrderListPage basePath="/w/order" title="Orders" />
