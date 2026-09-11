<script lang="ts" module>
	export interface FilterField {
		/**
		 * The server-side field name. It must appear in that endpoint's allowed
		 * list — filtering on anything else is a 400 naming the allowed fields.
		 */
		id: string;
		label: string;
		/** Control to render. */
		type?: 'text' | 'select' | 'date';
		/**
		 * Server filter operator. Defaults to `like` for text and `equal` for a
		 * select. A date range needs two fields on the same `id` with `gte` and
		 * `lte`, which is why `key` exists.
		 *
		 * `regex` is NOT supported — it returns zero rows rather than an error.
		 */
		op?: 'like' | 'contains' | 'equal' | 'in' | 'gte' | 'lte';
		/** Unique form key. Defaults to `id`; set it when two fields share an `id`. */
		key?: string;
		group?: string;
		options?: { value: string; label: string }[];
	}
</script>

<script lang="ts">
	import Button from './Button.svelte';
	import Input from './Input.svelte';
	import Select from './Select.svelte';

	/**
	 * A single inline row of filters.
	 *
	 * This used to render bordered fieldset groups inside a large card, which
	 * took a third of the screen before a single row of data was visible. The
	 * controls are the same and so is the filter payload — they are just laid
	 * out as one wrapping row, which is what a search bar should be.
	 *
	 * `group` is still accepted on a field so call sites did not have to
	 * change, but it is now used only to prefix a label where two fields would
	 * otherwise read the same ("From" and "From").
	 */
	let {
		fields = [],
		onSearch,
		onReset
	}: {
		fields: FilterField[];
		onSearch?: (filters: { id: string; value: any; type: string }[]) => void;
		onReset?: () => void;
	} = $props();

	/**
	 * Seeded with an empty string for every field.
	 *
	 * Input and Select declare `value = $bindable('')`, and Svelte refuses
	 * `bind:value={undefined}` against a fallback — binding a key that does not
	 * exist yet throws `props_invalid_value` and takes the whole page down with
	 * it, which is what an unseeded `{}` used to do here.
	 */
	function blankValues(): Record<string, any> {
		return Object.fromEntries(fields.map((field) => [field.key ?? field.id, '']));
	}

	let values: Record<string, any> = $state(blankValues());

	/**
	 * The label to show, disambiguated only when it needs to be.
	 *
	 * A date range contributes two fields both labelled "From"/"To"; prefixing
	 * the group name turns those into "Jadwal Muat From" and "Created From".
	 */
	function labelFor(field: FilterField): string {
		const clashes = fields.filter((f) => f.label === field.label).length > 1;
		return clashes && field.group ? `${field.group} ${field.label}` : field.label;
	}

	function search() {
		const filters = fields
			.map((f) => ({ f, key: f.key ?? f.id }))
			.filter(({ key }) => values[key] !== undefined && values[key] !== '')
			.map(({ f, key }) => ({
				id: f.id,
				value: values[key],
				type: f.op ?? (f.type === 'select' ? 'equal' : 'like')
			}));
		onSearch?.(filters);
	}

	function clear() {
		values = blankValues();
		onReset?.();
	}
</script>

<div class="filter-bar">
	{#each fields as field (field.key ?? field.id)}
		{@const key = field.key ?? field.id}
		<div class="filter-bar-field">
			<label for="filter-{key}">{labelFor(field)}</label>
			{#if field.type === 'select'}
				<Select id="filter-{key}" bind:value={values[key]} options={field.options ?? []} />
			{:else if field.type === 'date'}
				<Input id="filter-{key}" type="date" bind:value={values[key]} />
			{:else}
				<Input id="filter-{key}" bind:value={values[key]} placeholder={labelFor(field)} />
			{/if}
		</div>
	{/each}

	<div class="filter-bar-actions">
		<button type="button" class="btn btn-text btn-sm" onclick={clear}>Bersihkan</button>
		<button type="button" class="btn btn-primary btn-sm" onclick={search}>Cari</button>
	</div>
</div>
