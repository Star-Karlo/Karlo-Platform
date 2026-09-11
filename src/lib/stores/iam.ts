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

export const roleActions = {
	async load() {
		roleStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.roles.list);
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

	async save(role: { id?: string; name: string; description?: string; permissions: string[]; grantsAll: boolean }) {
		roleStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			if (role.id) await api.put(ENDPOINTS.roles.one(role.id), role);
			else await api.post(ENDPOINTS.roles.create, role);
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
	catalogue: Feature[];
	held: string[];
	loading: boolean;
	saving: boolean;
	error: string;
}

export const entitlementStore = writable<EntitlementState>({
	catalogue: [], held: [], loading: false, saving: false, error: ''
});

export const entitlementActions = {
	async load(companyId: string) {
		entitlementStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const [cat, held] = await Promise.all([
				api.get(ENDPOINTS.entitlements.catalogue, { product: 'tms' }),
				api.get(ENDPOINTS.entitlements.forCompany(companyId))
			]);
			entitlementStore.update((s) => ({
				...s,
				catalogue: cat.data?.data?.features ?? cat.data?.data ?? [],
				held: (held.data?.data?.modules ?? held.data?.data ?? [])
					.filter((m: any) => m.enabled !== false)
					.map((m: any) => m.module ?? m.name ?? m),
				loading: false
			}));
		} catch (e: any) {
			entitlementStore.update((s) => ({
				...s, loading: false, error: message(e, 'Could not load entitlements.')
			}));
		}
	},

	async grant(companyId: string, modules: string[]) {
		entitlementStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.put(ENDPOINTS.entitlements.forCompany(companyId), {
				product: 'tms',
				modules
			});
			entitlementStore.update((s) => ({ ...s, saving: false, held: modules }));
			return true;
		} catch (e: any) {
			entitlementStore.update((s) => ({
				...s, saving: false, error: message(e, 'Could not save entitlements.')
			}));
			return false;
		}
	}
};
