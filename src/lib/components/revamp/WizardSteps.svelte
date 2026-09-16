<script lang="ts">
	/** Port of WizardSteps.vue: the sticky "Follow This Step" sidebar. Steps are clickable without validation. */
	import { Check } from 'lucide-svelte';

	let { steps, currentStep = $bindable(0) }: { steps: { label: string }[]; currentStep?: number } = $props();

	function go(i: number) {
		currentStep = i;
	}
</script>

<aside class="wizard-sidebar">
	<div class="wizard-sidebar-title">Follow This Step</div>
	<div class="wizard-step-list">
		{#each steps as step, i (i)}
			<button
				type="button"
				class="wizard-step"
				class:active={currentStep === i}
				class:completed={currentStep > i}
				onclick={() => go(i)}
			>
				<span class="wizard-step-circle">
					{#if currentStep > i}
						<span class="icon-wrap"><Check size={13} strokeWidth={2.6} /></span>
					{:else}
						{i + 1}
					{/if}
				</span>
				<span class="wizard-step-label">{step.label}</span>
			</button>
		{/each}
	</div>
</aside>
