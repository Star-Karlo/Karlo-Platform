<script lang="ts">
	/** Settings toggle: ~50x26 track with the ON/OFF label to its right. */
	let {
		checked = $bindable(false),
		disabled = false,
		label = true,
		ariaLabel = 'Toggle',
		onchange
	}: {
		checked?: boolean;
		disabled?: boolean;
		label?: boolean;
		ariaLabel?: string;
		onchange?: (checked: boolean) => void;
	} = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<div class="inline-flex items-center gap-3">
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={ariaLabel}
		{disabled}
		onclick={toggle}
		class="relative h-[26px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-50
		       {checked ? 'bg-success' : 'bg-muted'}"
	>
		<span
			class="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-soft transition-all
			       {checked ? 'left-[27px]' : 'left-[3px]'}"
		></span>
	</button>
	{#if label}
		<span class="text-base text-muted">{checked ? 'ON' : 'OFF'}</span>
	{/if}
</div>
