<script lang="ts">
	/**
	 * A row of side-by-side fields.
	 *
	 * The ported `.two-col` / `.three-col` grids already collapse to a single
	 * column below the tablet breakpoint, so pages get responsive behaviour
	 * without each one restating a `md:` variant it might get wrong.
	 */
	let {
		cols = 2,
		class: className = '',
		children
	}: { cols?: 2 | 3; class?: string; children?: any } = $props();
</script>

<div class="{cols === 3 ? 'three-col' : 'two-col'} {className}">
	{@render children?.()}
</div>
