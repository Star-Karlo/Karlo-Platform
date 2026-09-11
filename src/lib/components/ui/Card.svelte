<script lang="ts">
	/**
	 * Section card. The spec allows two treatments — a 1px hairline (used on the
	 * Order hero) or the standard drop shadow — both at a 10px radius.
	 */
	let {
		title = '',
		variant = 'shadow',
		/**
		 * `accent` draws the title on a solid navy bar rather than as plain
		 * text — the treatment the console uses for the paired master-data
		 * panels, where two cards sit side by side and the header is what
		 * separates them at a glance.
		 */
		header = 'plain',
		padded = true,
		class: className = '',
		actions,
		children
	}: {
		title?: string;
		variant?: 'shadow' | 'outline';
		header?: 'plain' | 'accent';
		padded?: boolean;
		class?: string;
		actions?: any;
		children?: any;
	} = $props();
</script>

<section
	class="card {className}"
>
	{#if title || actions}
		{#if header === 'accent'}
			<header
				class="flex items-center justify-between gap-4 rounded-t-card bg-navy px-6 py-3 text-surface"
			>
				<h2 class="text-sm font-semibold">{title}</h2>
				{#if actions}
					<div class="flex items-center gap-2">{@render actions()}</div>
				{/if}
			</header>
		{:else}
			<header class="flex items-center justify-between gap-4 px-6 pt-5 {padded ? '' : 'pb-4'}">
				<h2 class="text-lg font-semibold text-ink-heading">{title}</h2>
				{#if actions}
					<div class="flex items-center gap-2">{@render actions()}</div>
				{/if}
			</header>
		{/if}
	{/if}
	<div class={padded ? 'card-pad' : ''}>
		{@render children?.()}
	</div>
</section>
