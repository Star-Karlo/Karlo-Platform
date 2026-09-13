import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/** One entry of a product's permission catalogue. */
export interface PermissionSpec {
	key: string;
	/** The entitlement gating it. Empty means ungated. */
	feature?: string;
	group: string;
	label: string;
}

export interface Role {
	id: string;
	companyId: string;
	name: string;
	description?: string;
	/** Product-qualified: "tms:order.read". */
	permissions: string[];
	/**
	 * An administrator role: everything the company is entitled to, without
	 * listing it. Listing instead would go stale the day the company buys
	 * another module.
	 */
	grantsAll: boolean;
	isSystem?: boolean;
}

interface RoleState {
	roles: Role[];
	/** The catalogue narrowed to what this company may actually grant. */
	assignable: PermissionSpec[];
	loading: boolean;
	saving: boolean;
	error: string;
}

export const roleStore = writable<RoleState>({
	roles: [], assignable: [], loading: false, saving: false, error: ''
});

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

/** Strip the product prefix a role stores, for comparing against the catalogue. */
export function bareKey(key: string): string {
	const at = key.indexOf(':');
	return at === -1 ? key : key.slice(at + 1);
}

/**
 * Which product a role editor is about.
 *
 * A role spans every product its company holds, but an editor only ever
 * shows one catalogue. Naming the product on every call means the server
 * vets against that catalogue and replaces only that product's keys — an
 * FMS save cannot strip the TMS keys it never showed, and vice versa.
 */
export type Product = 'tms' | 'fms';

export const PRODUCTS: { value: Product; label: string }[] = [
	{ value: 'tms', label: 'TMS' },
	{ value: 'fms', label: 'FMS' }
];

export const roleActions = {
	async load(product: Product = 'tms') {
		roleStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.roles.list, { product });
			const d = res.data?.data ?? {};
			roleStore.update((s) => ({
				...s,
				roles: d.roles ?? [],
				assignable: d.assignable ?? [],
				loading: false
			}));
		} catch (e: any) {
			roleStore.update((s) => ({
				...s, loading: false, error: message(e, 'Could not load roles.')
			}));
		}
	},

	async save(
		role: { id?: string; name: string; description?: string; permissions: string[]; grantsAll: boolean },
		product: Product = 'tms'
	) {
		roleStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			if (role.id) await api.put(`${ENDPOINTS.roles.one(role.id)}?product=${product}`, role);
			else await api.post(`${ENDPOINTS.roles.create}?product=${product}`, role);
			roleStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			roleStore.update((s) => ({ ...s, saving: false, error: message(e, 'Could not save the role.') }));
			return false;
		}
	},

	async remove(id: string) {
		roleStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.delete(ENDPOINTS.roles.one(id));
			roleStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			// The common refusal is "people still hold this role", which is a
			// real answer rather than a failure — surfaced as-is.
			roleStore.update((s) => ({ ...s, saving: false, error: message(e, 'Could not remove the role.') }));
			return false;
		}
	}
};

/** A sellable entitlement, for the company management screen. */
export interface Feature {
	name: string;
	owner?: string;
	description?: string;
	parent?: string;
	roadmap?: boolean;
}

interface EntitlementState {
	product: Product;
	catalogue: Feature[];
	/** What the company holds now, as its tokens would carry it. */
	held: string[];
	/** grant = opt-in (only what was sold); revoke = opt-out (everything sellable unless withdrawn). */
	mode: 'grant' | 'revoke';
	loading: boolean;
	saving: boolean;
	error: string;
}

export const entitlementStore = writable<EntitlementState>({
	product: 'tms', catalogue: [], held: [], mode: 'grant', loading: false, saving: false, error: ''
});

export const entitlementActions = {
	async load(companyId: string, product: Product = 'tms') {
		entitlementStore.update((s) => ({ ...s, product, loading: true, error: '' }));
		try {
			const [cat, eff] = await Promise.all([
				api.get(ENDPOINTS.entitlements.catalogue, { product }),
				api.get(ENDPOINTS.entitlements.effective(companyId), { product })
			]);
			entitlementStore.update((s) => ({
				...s,
				catalogue: cat.data?.data?.features ?? cat.data?.data ?? [],
				held: eff.data?.data?.modules ?? [],
				mode: eff.data?.data?.mode ?? 'grant',
				loading: false
			}));
		} catch (e: any) {
			entitlementStore.update((s) => ({
				...s, loading: false, error: message(e, 'Could not load entitlements.')
			}));
		}
	},

	/**
	 * Make the company hold exactly `modules` for the product.
	 *
	 * The server takes one module per call — a grant is a row with its own
	 * validity and audit entry — so this diffs against what is held and
	 * sends only the changes. Under revoke mode a "removal" writes a
	 * withdrawal row and a "grant" removes it; the server knows which.
	 */
	async save(companyId: string, product: Product, modules: string[]) {
		entitlementStore.update((s) => ({ ...s, saving: true, error: '' }));
		let current: string[] = [];
		entitlementStore.update((s) => { current = s.held; return s; });
		const want = new Set(modules);
		const have = new Set(current);
		try {
			for (const m of want) {
				if (!have.has(m)) {
					await api.put(ENDPOINTS.entitlements.forCompany(companyId), { product, module: m });
				}
			}
			for (const m of have) {
				if (!want.has(m)) {
					await api.delete(ENDPOINTS.entitlements.revoke(companyId, product, m));
				}
			}
			entitlementStore.update((s) => ({ ...s, saving: false, held: [...want] }));
			return true;
		} catch (e: any) {
			entitlementStore.update((s) => ({
				...s, saving: false, error: message(e, 'Could not save entitlements.')
			}));
			// Some changes may have landed; show what the server now says.
			await entitlementActions.load(companyId, product);
			return false;
		}
	},

	/** Kept for callers that grant a fresh set with no diff, e.g. onboarding. */
	async grant(companyId: string, modules: string[], product: Product = 'tms') {
		entitlementStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			for (const m of modules) {
				await api.put(ENDPOINTS.entitlements.forCompany(companyId), { product, module: m });
			}
			entitlementStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			entitlementStore.update((s) => ({
				...s, saving: false, error: message(e, 'Could not save entitlements.')
			}));
			return false;
		}
	}
};
