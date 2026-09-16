<script lang="ts">
	import { page } from '$app/stores';
	import DriverDetailPage from '$lib/pages/DriverDetailPage.svelte';
</script>

<DriverDetailPage basePath="/t" id={$page.params.id ?? ''} />
