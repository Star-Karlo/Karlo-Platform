<script lang="ts">
	let { size = 24, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<span
	class="inline-block animate-spin rounded-full border-2 border-cyan border-t-transparent {className}"
	style="width:{size}px;height:{size}px"
	role="status"
	aria-label="Loading"
></span>
