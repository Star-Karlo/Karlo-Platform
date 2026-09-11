import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

export type Requirement = 'required' | 'optional' | 'hidden';

/** One configurable input, as it applies to this company. */
export interface FieldConfig {
	entity: string;
	key: string;
	dataType: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | 'ref' | 'list';
	/** False for fields that exist but must never be switched off. */
	locked: boolean;
	group: string;
	/** The company's own wording if it set one, otherwise the declared label. */
	label: string;
	help?: string;
	sort: number;
	requirement: Requirement;
	/** True when this company changed it from the default. */
	overridden: boolean;
}

interface FieldConfigState {
	/** Cached per entity: the form asks on every mount, the answer rarely moves. */
	agreement: FieldConfig[] | null;
	order: FieldConfig[] | null;
	loading: boolean;
	error: string;
}

export const fieldConfigStore = writable<FieldConfigState>({
	agreement: null,
	order: null,
	loading: false,
	error: ''
});

export const fieldConfigActions = {
	/**
	 * Load the configuration for an entity.
	 *
	 * This is the same answer the create endpoint validates against, from the
	 * same server-side method — so a form built from it cannot produce a
	 * submission the server then refuses for a field reason.
	 */
	async load(entity: 'agreement' | 'order', force = false) {
		const cached = get(fieldConfigStore)[entity];
		if (cached && !force) return cached;

		fieldConfigStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.config.fields(entity));
			const fields: FieldConfig[] = res.data?.data?.fields ?? [];
			fieldConfigStore.update((s) => ({ ...s, [entity]: fields, loading: false }));
			return fields;
		} catch (e: any) {
			fieldConfigStore.update((s) => ({
				...s,
				loading: false,
				error: e?.response?.data?.message ?? 'Could not load the form configuration.'
			}));
			return [];
		}
	},

	async update(
		entity: 'agreement' | 'order',
		fields: { key: string; requirement: Requirement; labelOverride?: string | null }[]
	) {
		fieldConfigStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.put(ENDPOINTS.config.fields(entity), { fields });
			const updated: FieldConfig[] = res.data?.data?.fields ?? [];
			fieldConfigStore.update((s) => ({ ...s, [entity]: updated, loading: false }));
			return true;
		} catch (e: any) {
			fieldConfigStore.update((s) => ({
				...s,
				loading: false,
				error: e?.response?.data?.message ?? 'Could not save the form configuration.'
			}));
			return false;
		}
	}
};

/** Fields a form should draw, in order. Hidden ones are not drawn at all. */
export function visibleFields(fields: FieldConfig[] | null, group?: string): FieldConfig[] {
	if (!fields) return [];
	return fields
		.filter((f) => f.requirement !== 'hidden')
		.filter((f) => (group ? f.group === group : true));
}

/** Whether a field is enabled for this company at all. */
export function isEnabled(fields: FieldConfig[] | null, key: string): boolean {
	const field = fields?.find((f) => f.key === key);
	return !!field && field.requirement !== 'hidden';
}

export function isRequired(fields: FieldConfig[] | null, key: string): boolean {
	return fields?.find((f) => f.key === key)?.requirement === 'required';
}

/**
 * The groups present, in the order their first field appears.
 *
 * `includeHidden` is what separates the two callers. A FORM draws only what is
 * enabled; the CONFIGURATOR must list the disabled fields too, because that is
 * the screen where one gets turned back on — filtering them out would make a
 * hidden field unreachable forever.
 */
export function groupsOf(fields: FieldConfig[] | null, includeHidden = false): string[] {
	const source = includeHidden ? (fields ?? []) : visibleFields(fields);
	const seen: string[] = [];
	for (const f of source) {
		if (!seen.includes(f.group)) seen.push(f.group);
	}
	return seen;
}
