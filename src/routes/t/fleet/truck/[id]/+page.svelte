<script lang="ts">
	import { page } from '$app/stores';
	import TruckDetailPage from '$lib/pages/TruckDetailPage.svelte';
</script>

<TruckDetailPage
	basePath="/t"
	id={$page.params.id ?? ''}
	editMode={$page.url.searchParams.get('edit') === '1'}
/>
