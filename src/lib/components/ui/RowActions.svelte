<script lang="ts">
	import { Eye, Pencil, Copy, Trash2 } from 'lucide-svelte';

	/** The table action column: 20px cyan outline icons, red for destructive. */
	let {
		onView,
		onEdit,
		onDuplicate,
		onDelete
	}: {
		onView?: () => void;
		onEdit?: () => void;
		onDuplicate?: () => void;
		onDelete?: () => void;
	} = $props();

	const ACTIONS = $derived(
		[
			{ run: onView, icon: Eye, label: 'View', tone: 'text-cyan' },
			{ run: onEdit, icon: Pencil, label: 'Edit', tone: 'text-cyan' },
			{ run: onDuplicate, icon: Copy, label: 'Duplicate', tone: 'text-muted' },
			{ run: onDelete, icon: Trash2, label: 'Delete', tone: 'text-danger' }
		].filter((a) => a.run)
	);
</script>

<div class="flex items-center gap-2">
	{#each ACTIONS as action}
		{@const Icon = action.icon}
		<button
			type="button"
			title={action.label}
			aria-label={action.label}
			class="rounded p-1 {action.tone} hover:bg-canvas"
			onclick={(e) => {
				e.stopPropagation();
				action.run?.();
			}}
		>
			<Icon size={16} />
		</button>
	{/each}
</div>
