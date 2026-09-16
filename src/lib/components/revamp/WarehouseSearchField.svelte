<script lang="ts">
	/**
	 * Port of WarehouseSearchField.vue. The model is the warehouse id ('' when
	 * nothing is picked); the input shows `${name} — ${city}` once picked and
	 * clears the model as soon as the planner types again.
	 */
	import { onMount } from 'svelte';
	import { Search } from 'lucide-svelte';

	export type WarehouseLike = {
		id: string;
		name: string;
		city?: string | null;
		address?: string | null;
	};

	let {
		value = $bindable(''),
		warehouses = [],
		placeholder = 'Cari alamat atau nama warehouse...',
		disabled = false,
		onchange
	}: {
		value?: string;
		warehouses?: WarehouseLike[];
		placeholder?: string;
		disabled?: boolean;
		onchange?: (id: string) => void;
	} = $props();

	let rootEl = $state<HTMLDivElement | null>(null);
	let query = $state('');
	let showResults = $state(false);

	// Mirrors the prototype's immediate watcher on modelValue: whenever the id
	// (or the warehouse list) resolves to a record, show its label.
	$effect(() => {
		const w = warehouses.find((x) => x.id === value);
		if (w) query = `${w.name} — ${w.city ?? ''}`;
	});

	function onInput() {
		if (value) {
			value = '';
			onchange?.('');
		}
		showResults = false;
	}

	let results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return warehouses;
		return warehouses.filter(
			(w) =>
				(w.name || '').toLowerCase().includes(q) ||
				(w.city || '').toLowerCase().includes(q) ||
				(w.address || '').toLowerCase().includes(q)
		);
	});

	function triggerSearch() {
		if (disabled) return;
		showResults = true;
	}
	function select(w: WarehouseLike) {
		value = w.id;
		onchange?.(w.id);
		query = `${w.name} — ${w.city ?? ''}`;
		showResults = false;
	}
	function onDocClick(e: MouseEvent) {
		if (rootEl && !rootEl.contains(e.target as Node)) showResults = false;
	}
	onMount(() => {
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick);
	});
</script>

<div class="warehouse-search-field" bind:this={rootEl}>
	<div class="search-field-row">
		<input
			type="text"
			bind:value={query}
			{placeholder}
			{disabled}
			oninput={onInput}
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					triggerSearch();
				}
			}}
		/>
		<button type="button" class="mini-icon-btn" title="Cari warehouse" {disabled} onclick={triggerSearch}>
			<span class="icon-wrap"><Search size={16} /></span>
		</button>
	</div>
	{#if showResults}
		<div class="search-field-results">
			{#if !results.length}
				<div class="search-result-empty">Tidak ada warehouse yang cocok.</div>
			{/if}
			{#each results as w (w.id)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div class="search-result-item" onclick={() => select(w)}>
					<div class="search-result-title">{w.name}</div>
					<div class="search-result-sub">{w.city ?? ''} — {w.address || '-'}</div>
				</div>
			{/each}
		</div>
	{/if}
</div>
