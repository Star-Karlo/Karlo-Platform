<script lang="ts">
	/**
	 * The whole button system, per the UI spec: four variants at 36px with a
	 * 20px radius, plus the two 50px-radius hero CTAs. There is deliberately no
	 * escape hatch for a fifth style — the legacy 5.6px/3.2px Bootstrap buttons
	 * the spec calls debt should not come back.
	 */
	type Variant = 'primary' | 'outline' | 'ghost' | 'danger' | 'cta' | 'ctaFilled';

	let {
		variant = 'primary',
		type = 'button',
		href = undefined,
		disabled = false,
		loading = false,
		full = false,
		class: className = '',
		onclick,
		children,
		...rest
	}: {
		variant?: Variant;
		type?: 'button' | 'submit' | 'reset';
		href?: string;
		disabled?: boolean;
		loading?: boolean;
		full?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
		children?: any;
		[key: string]: any;
	} = $props();

	/*
	 * Mapped onto the ported design system's own button classes rather than
	 * kept as Tailwind, so a button here and a button on a ported screen are
	 * the same object — same radius, same weight, same hover — instead of two
	 * that merely look similar until one of them changes.
	 */
	const VARIANTS: Record<Variant, string> = {
		primary: 'btn btn-primary',
		outline: 'btn btn-outline',
		ghost: 'btn btn-text',
		danger: 'btn btn-primary btn-danger',
		cta: 'btn btn-outline',
		ctaFilled: 'btn btn-primary'
	};

	let classes = $derived(
		[
			'inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors',
			'disabled:cursor-not-allowed disabled:opacity-50',
			VARIANTS[variant],
			full ? 'w-full' : '',
			className
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

{#if href}
	<a {href} class={classes} aria-disabled={disabled} {...rest}>
		{@render children?.()}
	</a>
{:else}
	<button {type} class={classes} disabled={disabled || loading} {onclick} {...rest}>
		{#if loading}
			<span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
		{/if}
		{@render children?.()}
	</button>
{/if}
