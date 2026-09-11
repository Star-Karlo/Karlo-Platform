<script lang="ts">
	/**
	 * Label, control and help text, spaced the same way everywhere.
	 *
	 * Every form was writing its own `<label class="mb-1 block text-xs …">`,
	 * which is how a page ends up with three label sizes and two gaps. One
	 * component means changing the rhythm is one edit rather than forty.
	 *
	 * The markup is the ported design system's `.field` — so a control dropped
	 * in here picks up `.field input` / `.field textarea` styling without
	 * carrying a class of its own, exactly as it does in the reference console.
	 */
	let {
		label,
		id,
		required = false,
		help = '',
		error = '',
		/** Span both columns of a `.two-col` group. */
		wide = false,
		class: className = '',
		children
	}: {
		label: string;
		id: string;
		required?: boolean;
		help?: string;
		error?: string;
		wide?: boolean;
		class?: string;
		children?: any;
	} = $props();
</script>

<div class="field {className}" style={wide ? 'grid-column:1 / -1;' : ''}>
	<label for={id}>
		{label}
		{#if required}<span class="req">*</span>{/if}
	</label>
	{@render children?.()}
	{#if error}
		<p class="field-error">{error}</p>
	{:else if help}
		<p class="hint">{help}</p>
	{/if}
</div>
