import { get, writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

export interface CatalogEntry {
	id: string;
	name: string;
	code?: string;
	active?: boolean;
	sortOrder?: number;
	parentId?: string;
	attributes?: Record<string, any>;
}

/** The catalogue kinds the forms draw on. */
export type CatalogKind =
	| 'truckType'
	| 'truckBody'
	| 'truckHead'
	| 'brand'
	| 'cargoType'
	| 'itemType'
	| 'itemCharacter'
	| 'pricingType'
	| 'paymentType'
	| 'currency'
	| 'requirement'
	| 'kota'
	| 'provinsi'
	/**
	 * Kecamatan. Only loaded by companies that price lanes below city level —
	 * the list is an order of magnitude larger than kota, so a form that does
	 * not use it should not fetch it.
	 */
	| 'district'
	| 'route';

/**
 * Reference data, fetched once per kind and kept.
 *
 * Every form needs several of these and they change about once a year, so
 * refetching them per mount would be waste. `load` de-duplicates concurrent
 * callers, which matters when four selects on one form ask at the same moment.
 */
const cache = writable<Partial<Record<CatalogKind, CatalogEntry[]>>>({});
const inFlight = new Map<CatalogKind, Promise<CatalogEntry[]>>();

export const catalog = { subscribe: cache.subscribe };

export async function loadCatalog(kind: CatalogKind): Promise<CatalogEntry[]> {
	const existing = get(cache)[kind];
	if (existing) return existing;

	const pending = inFlight.get(kind);
	if (pending) return pending;

	const request = api
		.get(ENDPOINTS.catalog.list(kind), { pageSize: 500 })
		.then((res) => {
			const rows: CatalogEntry[] = res.data.data ?? [];
			const sorted = [...rows].sort(
				(a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
			);
			cache.update((c) => ({ ...c, [kind]: sorted }));
			return sorted;
		})
		.catch(() => {
			// A missing catalogue leaves its select empty rather than breaking the
			// form around it.
			cache.update((c) => ({ ...c, [kind]: [] }));
			return [];
		})
		.finally(() => inFlight.delete(kind));

	inFlight.set(kind, request);
	return request;
}

/** Load several kinds at once, for a form that opens with many selects. */
export async function loadCatalogs(kinds: CatalogKind[]): Promise<void> {
	await Promise.all(kinds.map(loadCatalog));
}

/** Catalogue entries as Select options. */
export function asOptions(entries: CatalogEntry[] | undefined) {
	return (entries ?? []).map((e) => ({ value: e.id, label: e.name }));
}
