<script lang="ts">
	import { Construction } from 'lucide-svelte';
	import { Card, EmptyState, PageHeader } from '$lib/components/ui';

	/**
	 * Placeholder for a route the navigation offers but nothing has been built
	 * for yet. It says so plainly rather than showing an empty table, which
	 * reads as "no data" and hides the fact that the page does not exist.
	 */
	let {
		title,
		note = 'This screen has not been built yet.'
	}: { title: string; note?: string } = $props();
</script>

<div class="space-y-gutter">
	<PageHeader {title} icon={Construction} />
	<Card>
		<EmptyState message={note} hint="It is listed in the navigation so the route is reachable once it exists." />
	</Card>
</div>
