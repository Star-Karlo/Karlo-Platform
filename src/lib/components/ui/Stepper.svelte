<script lang="ts">
	/**
	 * The "Follow This Step" rail: a numbered list where completed steps carry
	 * a tick, the current one is highlighted, and the rest are muted.
	 *
	 * A rail rather than a progress bar because the steps have names, and the
	 * name is what tells someone what they are about to be asked for.
	 *
	 * Rendered with the ported `.wizard-*` classes, which draw the connecting
	 * spine between circles — so a step reads as part of a sequence rather than
	 * as three unrelated buttons.
	 */
	import { Check } from 'lucide-svelte';

	let {
		steps,
		current = 0,
		title = 'Follow This Step',
		onStepClick
	}: {
		steps: string[];
		current?: number;
		title?: string;
		/** Only ever called for a step already completed — see below. */
		onStepClick?: (index: number) => void;
	} = $props();
</script>

<nav class="wizard-sidebar" aria-label={title}>
	<div class="wizard-sidebar-title">{title}</div>
	<div class="wizard-step-list">
		{#each steps as step, i}
			{@const done = i < current}
			{@const active = i === current}
			<!-- Going BACK is allowed, forward is not: a later step reads values
			     the earlier ones collect, so jumping ahead would show a form
			     built from nothing. -->
			<button
				type="button"
				class="wizard-step {active ? 'active' : ''} {done ? 'completed' : ''}"
				disabled={!done}
				onclick={() => done && onStepClick?.(i)}
				aria-current={active ? 'step' : undefined}
				style={done ? '' : 'cursor:default;'}
			>
				<span class="wizard-step-circle">
					{#if done}<Check size={12} />{:else}{i + 1}{/if}
				</span>
				<span class="wizard-step-label">{step}</span>
			</button>
		{/each}
	</div>
</nav>
