<script lang="ts">
	/**
	 * Port of Karlo-TMS-Revamp/src/components/common/FieldSelect.vue.
	 *
	 * Pill button with a chevron; the menu is portaled to <body> and
	 * positioned with fixed coordinates so an ancestor's overflow can't clip
	 * it. Multi-select shows removable chips (inside the button, or below it
	 * with `chipsBelow`); `searchable` swaps the button for a text input
	 * filtering by label.
	 */
	import { onMount, tick } from 'svelte';
	import { ChevronDown, X } from 'lucide-svelte';

	export interface FieldSelectOption {
		value: string;
		label: string;
	}

	let {
		value = $bindable<string | string[]>(''),
		options = [],
		placeholder = 'Pilih',
		multiple = false,
		searchable = false,
		compact = false,
		chipsBelow = false,
		disabled = false,
		menuMinWidth = null,
		style = '',
		onchange
	}: {
		value?: string | string[];
		options?: FieldSelectOption[];
		placeholder?: string;
		multiple?: boolean;
		searchable?: boolean;
		compact?: boolean;
		chipsBelow?: boolean;
		disabled?: boolean;
		menuMinWidth?: number | string | null;
		style?: string;
		onchange?: (value: string | string[]) => void;
	} = $props();

	let open = $state(false);
	let rootEl = $state<HTMLElement | null>(null);
	let btnEl = $state<HTMLElement | null>(null);
	let menuEl = $state<HTMLElement | null>(null);
	let menuStyle = $state('');
	let query = $state('');

	function updateMenuPosition() {
		if (!btnEl) return;
		const rect = btnEl.getBoundingClientRect();
		const width = menuMinWidth ? Math.max(rect.width, Number(menuMinWidth)) : rect.width;
		menuStyle = `top:${rect.bottom + 6}px;left:${rect.left}px;width:${width}px;`;
	}
	async function openMenu() {
		if (disabled) return;
		open = true;
		if (searchable) query = '';
		await tick();
		updateMenuPosition();
	}

	let values = $derived(Array.isArray(value) ? value : []);

	let currentLabel = $derived.by(() => {
		if (multiple) {
			return options
				.filter((o) => values.includes(o.value))
				.map((o) => o.label)
				.join(', ');
		}
		const found = options.find((o) => o.value === value);
		return found ? found.label : '';
	});

	let selectedChips = $derived(multiple ? options.filter((o) => values.includes(o.value)) : []);

	function emit(next: string | string[]) {
		value = next;
		onchange?.(next);
	}

	function removeChip(v: string, e: MouseEvent) {
		e.stopPropagation();
		emit(values.filter((x) => x !== v));
	}

	let filteredOptions = $derived.by(() => {
		if (!searchable || !query.trim()) return options;
		const q = query.trim().toLowerCase();
		return options.filter((o) => o.label.toLowerCase().includes(q));
	});

	function isSelected(v: string) {
		if (multiple) return values.includes(v);
		return v === value;
	}

	function toggle() {
		if (open) open = false;
		else openMenu();
	}
	function select(v: string) {
		if (multiple) {
			const next = [...values];
			const idx = next.indexOf(v);
			if (idx >= 0) next.splice(idx, 1);
			else next.push(v);
			emit(next);
			return;
		}
		emit(v);
		open = false;
	}
	function onDocClick(e: MouseEvent) {
		const target = e.target as Node;
		const inRoot = rootEl && rootEl.contains(target);
		const inMenu = menuEl && menuEl.contains(target);
		if (!inRoot && !inMenu) open = false;
	}
	function onScrollOrResize() {
		if (open) updateMenuPosition();
	}
	onMount(() => {
		document.addEventListener('click', onDocClick);
		window.addEventListener('scroll', onScrollOrResize, true);
		window.addEventListener('resize', onScrollOrResize);
		return () => {
			document.removeEventListener('click', onDocClick);
			window.removeEventListener('scroll', onScrollOrResize, true);
			window.removeEventListener('resize', onScrollOrResize);
		};
	});

	/** Moves the menu node under <body> (Vue's <Teleport to="body">). */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	export { openMenu as open };
</script>

<div class="field-select" class:open bind:this={rootEl} {style}>
	{#if !searchable}
		<button
			type="button"
			class="field-select-btn"
			class:field-select-btn-multi={multiple && selectedChips.length > 0 && !chipsBelow}
			class:field-select-btn-sm={compact}
			bind:this={btnEl}
			{disabled}
			onclick={toggle}
		>
			{#if multiple && selectedChips.length && !chipsBelow}
				<span class="field-select-chips">
					{#each selectedChips as opt (opt.value)}
						<span class="field-select-chip">
							{opt.label}
							<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
							<span class="field-select-chip-remove" onclick={(e) => removeChip(opt.value, e)}
								><span class="icon-wrap"><X size={10} /></span></span
							>
						</span>
					{/each}
				</span>
			{:else}
				<span class:placeholder={!currentLabel}>
					{chipsBelow && multiple && selectedChips.length
						? selectedChips.length + ' dipilih'
						: currentLabel || placeholder}
				</span>
			{/if}
			<span class="chevron"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
		</button>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="field-select-btn field-select-btn-searchable"
			bind:this={btnEl}
			onclick={() => !open && openMenu()}
		>
			<input
				type="text"
				value={open ? query : currentLabel}
				{placeholder}
				{disabled}
				oninput={(e) => {
					query = (e.currentTarget as HTMLInputElement).value;
					open = true;
				}}
				onfocus={() => !open && openMenu()}
			/>
			<span class="chevron"><span class="icon-wrap"><ChevronDown size={14} /></span></span>
		</div>
	{/if}
	{#if chipsBelow && multiple && selectedChips.length}
		<div class="field-select-chips-below">
			{#each selectedChips as opt (opt.value)}
				<span class="field-select-chip-sm">
					{opt.label}
					<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
					<span class="field-select-chip-remove-sm" onclick={(e) => removeChip(opt.value, e)}
						><span class="icon-wrap"><X size={8} /></span></span
					>
				</span>
			{/each}
		</div>
	{/if}
	{#if open}
		<div
			class="field-select-menu field-select-menu-teleported"
			bind:this={menuEl}
			style={menuStyle}
			use:portal
		>
			{#if !filteredOptions.length}
				<div class="field-select-empty">Tidak ada data yang cocok</div>
			{/if}
			{#each filteredOptions as opt (opt.value)}
				<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
				<div
					class="field-select-option"
					class:selected={isSelected(opt.value)}
					onclick={() => select(opt.value)}
				>
					{#if multiple}
						<input
							type="checkbox"
							checked={isSelected(opt.value)}
							class="field-select-checkbox"
							onclick={(e) => e.preventDefault()}
						/>
					{/if}
					<span class="field-select-option-label">{opt.label}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>
