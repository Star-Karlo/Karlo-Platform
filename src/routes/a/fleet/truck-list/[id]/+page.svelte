<script lang="ts">
	import { page } from '$app/stores';
	import TruckFormPage from '$lib/pages/TruckFormPage.svelte';
</script>

<TruckFormPage basePath="/a/fleet/truck-list" id={$page.params.id ?? ''} />
