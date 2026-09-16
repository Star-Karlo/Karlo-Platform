<script lang="ts">
	import { page } from '$app/stores';
	import DriverDetailPage from '$lib/pages/DriverDetailPage.svelte';
</script>

<DriverDetailPage basePath="/a" id={$page.params.id ?? ''} />
