<script lang="ts">
	/** Same pill as Input, with a caret drawn by `.revamp-select`. */
	let {
		value = $bindable(''),
		options = [],
		placeholder = 'All',
		disabled = false,
		id = undefined,
		onchange,
		class: className = ''
	}: {
		value?: any;
		options?: { value: string; label: string }[];
		placeholder?: string;
		disabled?: boolean;
		id?: string;
		/** Fired after the bound value updates, for dependent pickers. */
		onchange?: (event: Event) => void;
		class?: string;
	} = $props();
</script>

<select
	{id}
	{disabled}
	{onchange}
	bind:value
	class="revamp-input revamp-select {className}"
>
	<option value="">{placeholder}</option>
	{#each options as opt}
		<option value={opt.value}>{opt.label}</option>
	{/each}
</select>
