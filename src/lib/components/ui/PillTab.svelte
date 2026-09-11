<script lang="ts">
	/** The outline pill used for "Order List" / "Order Recap" style affordances. */
	let {
		href = undefined,
		active = false,
		onclick,
		children
	}: { href?: string; active?: boolean; onclick?: () => void; children?: any } = $props();

	let classes = $derived(
		`inline-flex h-[38px] items-center justify-center rounded-input border px-3 py-1.5 text-sm transition-colors ${
			active ? 'border-cyan text-cyan' : 'border-line-muted text-muted-dim hover:text-ink'
		}`
	);
</script>

{#if href}
	<a {href} class={classes}>{@render children?.()}</a>
{:else}
	<button type="button" class={classes} {onclick}>{@render children?.()}</button>
{/if}
