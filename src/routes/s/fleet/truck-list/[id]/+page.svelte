<script lang="ts">
	import { page } from '$app/stores';
	import TruckFormPage from '$lib/pages/TruckFormPage.svelte';
</script>

<TruckFormPage basePath="/s/fleet/truck-list" id={$page.params.id ?? ''} />
