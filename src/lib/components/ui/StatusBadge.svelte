<script lang="ts">
	import { statusTone } from '$lib/utils/format';

	let { statusCode = '', label = '' }: { statusCode?: string; label?: string } = $props();

	let tone = $derived(statusTone(statusCode));
</script>

<span class={tone}>
	{label || statusCode || '-'}
</span>
