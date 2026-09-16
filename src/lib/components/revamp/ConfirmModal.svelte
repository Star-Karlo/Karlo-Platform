<script lang="ts">
	/**
	 * The prototype's confirm dialog (ConfirmModal.vue): a title, a message
	 * (may contain <b>), Batal + one confirm button, danger by default.
	 */
	let {
		open = false,
		title = '',
		message = '',
		confirmLabel = 'Ya, Lanjutkan',
		danger = true,
		busy = false,
		onConfirm = () => {},
		onClose = () => {}
	}: {
		open?: boolean;
		title?: string;
		message?: string;
		confirmLabel?: string;
		danger?: boolean;
		busy?: boolean;
		onConfirm?: () => void;
		onClose?: () => void;
	} = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onClose}>
		<div class="modal-box" role="dialog" aria-modal="true" onclick={(e) => e.stopPropagation()}>
			<h3>{title}</h3>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<p>{@html message}</p>
			<div class="modal-actions">
				<button type="button" class="btn btn-outline" onclick={onClose}>Batal</button>
				<button
					type="button"
					class="btn {danger ? 'btn-danger' : 'btn-primary'}"
					disabled={busy}
					onclick={onConfirm}
				>
					{busy ? 'Memproses...' : confirmLabel}
				</button>
			</div>
		</div>
	</div>
{/if}
