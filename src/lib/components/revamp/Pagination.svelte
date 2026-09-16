<script lang="ts">
	/** Port of Pagination.vue: a window of 5 page buttons with « ‹ › ». */
	let {
		totalItems,
		page = $bindable(1),
		pageSize = 5
	}: { totalItems: number; page?: number; pageSize?: number } = $props();

	let totalPages = $derived(Math.max(1, Math.ceil(totalItems / pageSize)));

	let pages = $derived.by(() => {
		const windowSize = 5;
		let start = Math.max(1, page - Math.floor(windowSize / 2));
		const end = Math.min(totalPages, start + windowSize - 1);
		start = Math.max(1, end - windowSize + 1);
		const arr: number[] = [];
		for (let p = start; p <= end; p++) arr.push(p);
		return arr;
	});

	function goTo(p: number) {
		if (p < 1 || p > totalPages) return;
		page = p;
	}
</script>

<div class="pagination">
	<button
		class="page-btn"
		disabled={page === 1}
		style={page === 1 ? 'opacity:.4;cursor:not-allowed;' : ''}
		onclick={() => goTo(1)}>&laquo;</button
	>
	<button
		class="page-btn"
		disabled={page === 1}
		style={page === 1 ? 'opacity:.4;cursor:not-allowed;' : ''}
		onclick={() => goTo(page - 1)}>&lsaquo;</button
	>
	{#each pages as p (p)}
		<button class="page-btn" class:active={p === page} onclick={() => goTo(p)}>{p}</button>
	{/each}
	<button
		class="page-btn"
		disabled={page === totalPages}
		style={page === totalPages ? 'opacity:.4;cursor:not-allowed;' : ''}
		onclick={() => goTo(page + 1)}>&rsaquo;</button
	>
	<button
		class="page-btn"
		disabled={page === totalPages}
		style={page === totalPages ? 'opacity:.4;cursor:not-allowed;' : ''}
		onclick={() => goTo(totalPages)}>&raquo;</button
	>
</div>
