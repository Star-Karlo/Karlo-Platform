<script lang="ts">
	/** Underline tab strip: white bar, 10px radius, cyan underline on the active item. */
	let {
		tabs,
		activeTab = '',
		onChange,
		actions
	}: {
		tabs: { id: string; label: string; count?: number }[];
		activeTab?: string;
		onChange?: (tabId: string) => void;
		actions?: any;
	} = $props();
</script>

<!-- The ported order-list toolbar: an underlined tab strip that scrolls
     horizontally, with the actions parked at its right-hand end. A status list
     grows past the width of any screen, and wrapping it to two rows moves every
     tab whenever a count changes. -->
<div class="order-toolbar">
	<nav class="order-tabs-row">
		{#each tabs as tab}
			<button
				type="button"
				onclick={() => onChange?.(tab.id)}
				class="order-tab {activeTab === tab.id ? 'active' : ''}"
			>
				{tab.label}{#if tab.count !== undefined}&nbsp;({tab.count}){/if}
			</button>
		{/each}
	</nav>
	{#if actions}
		<div class="order-toolbar-actions">{@render actions()}</div>
	{/if}
</div>
