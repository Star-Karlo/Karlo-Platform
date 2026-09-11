<script lang="ts">
	/**
	 * Dialog, in the ported design system's shape.
	 *
	 * `.modal-overlay` / `.modal-box` / `.modal-scroll-body` / `.modal-actions`
	 * come from the reference console, so a form inside one is laid out and
	 * scrolled exactly as it is there — the body scrolls, the title and the
	 * action row stay put.
	 */
	import { X } from 'lucide-svelte';

	let {
		open = false,
		title = '',
		size = 'md',
		onClose,
		footer,
		children
	}: {
		open?: boolean;
		title?: string;
		/** sm is the reference's 420px default; md/lg/xl widen it in its own steps. */
		size?: 'sm' | 'md' | 'lg' | 'xl';
		onClose?: () => void;
		footer?: any;
		children?: any;
	} = $props();

	const SIZE: Record<string, string> = {
		sm: '',
		md: 'modal-box-lg',
		lg: 'modal-box-lg',
		xl: 'modal-box-lg modal-box-xl'
	};

	/**
	 * Close only on the backdrop itself.
	 *
	 * Without the target check, releasing a drag that started inside the dialog
	 * — selecting text in a field, say — counts as a click on the overlay and
	 * throws away whatever was being typed.
	 */
	function onOverlayClick(event: MouseEvent) {
		if (event.target === event.currentTarget) onClose?.();
	}
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && onClose?.()} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box {SIZE[size]}" role="dialog" aria-modal="true" aria-label={title} tabindex="-1">
			<div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
				<h3>{title}</h3>
				<button type="button" class="mini-icon-btn" aria-label="Tutup" onclick={onClose}>
					<X size={15} />
				</button>
			</div>
			<div class="modal-scroll-body">
				{@render children?.()}
			</div>
			{#if footer}
				<div class="modal-actions">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}
