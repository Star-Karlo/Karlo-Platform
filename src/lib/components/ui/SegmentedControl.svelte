<script lang="ts">
	/** "This Month / Today" toggle: 800px-radius wrapper, green active segment. */
	let {
		options,
		value = $bindable(''),
		onChange
	}: {
		options: { value: string; label: string }[];
		value?: string;
		onChange?: (value: string) => void;
	} = $props();

	function pick(next: string) {
		value = next;
		onChange?.(next);
	}
</script>

<div class="inline-flex h-10 items-center rounded-segment border border-line-muted bg-surface p-0">
	{#each options as opt, i}
		<button
			type="button"
			onclick={() => pick(opt.value)}
			class="h-full px-3 py-1.5 text-base transition-colors
			       {i === 0 ? 'rounded-l-segment' : ''} {i === options.length - 1 ? 'rounded-r-segment' : ''}
			       {value === opt.value
				? 'border border-success bg-success text-white'
				: 'border border-transparent text-muted hover:text-ink'}"
		>
			{opt.label}
		</button>
	{/each}
</div>
