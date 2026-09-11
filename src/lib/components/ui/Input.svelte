<script lang="ts">
	/** Pill input, shaped by `.revamp-input` — the app's only input shape. */
	let {
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		disabled = false,
		id = undefined,
		class: className = '',
		...rest
	}: {
		value?: any;
		type?: string;
		placeholder?: string;
		disabled?: boolean;
		id?: string;
		class?: string;
		[key: string]: any;
	} = $props();
</script>

<input
	{id}
	{type}
	{placeholder}
	{disabled}
	bind:value
	class="revamp-input {className}"
	{...rest}
/>
