<script lang="ts">
	/**
	 * Page title row. The spec's rebuild checklist says to unify every page on
	 * "icon + 20px/700" and drop the 24px/400 variant, so this component is the
	 * only place a page title should be rendered.
	 */
	let {
		title,
		icon = undefined,
		subtitle = '',
		actions,
		children
	}: {
		title: string;
		icon?: any;
		subtitle?: string;
		actions?: any;
		children?: any;
	} = $props();

	const Icon = $derived(icon);
</script>

<div class="page-head">
	<div style="display:flex; align-items:center; gap:14px; min-width:0;">
		{#if Icon}
			<span
				style="width:44px; height:44px; border-radius:12px; flex-shrink:0; display:flex;
				       align-items:center; justify-content:center;
				       background:var(--primary-container); color:var(--primary-dark);"
			>
				<Icon size={22} />
			</span>
		{/if}
		<div style="min-width:0;">
			<h1>{title}</h1>
			{#if subtitle}<p>{subtitle}</p>{/if}
		</div>
	</div>
	{#if actions}
		<div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">{@render actions()}</div>
	{/if}
	{@render children?.()}
</div>
