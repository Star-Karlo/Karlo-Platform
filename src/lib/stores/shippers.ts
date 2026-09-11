import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/**
 * A client of this transporter.
 *
 * It is a COMPANY, not a master-data row and not a user. That distinction is
 * the point of the design: a transporter records a client so it can order on
 * their behalf, and the client may never sign in at all. When they do — through
 * a claim link — the same company becomes theirs, with the order history
 * already attached.
 */
export interface Shipper {
	id: string;
	name: string;
	/** Code used in agreement numbers: AGR-<transporter>-<client>-000001. */
	abbreviation?: string;
	/** 'company' or 'personal'. A personal shipper has an NPWP and no NIB. */
	entityType?: string;
	npwp?: string;
	nib?: string;
	address?: string;
	role?: string;
	createdAt?: string;
	/** Set when this company was folded into another as a duplicate. */
	mergedIntoCompanyId?: string;
}

interface ShipperState {
	shippers: Shipper[];
	loading: boolean;
	saving: boolean;
	error: string;
	/** The claim link, returned once at issue and never retrievable again. */
	claimLink: string;
}

export const shipperStore = writable<ShipperState>({
	shippers: [], loading: false, saving: false, error: '', claimLink: ''
});

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

export const shipperActions = {
	async list() {
		shipperStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.shippers.list);
			shipperStore.update((s) => ({ ...s, shippers: res.data?.data ?? [], loading: false }));
		} catch (e: any) {
			shipperStore.update((s) => ({
				...s, shippers: [], loading: false,
				error: message(e, 'Could not load your clients.')
			}));
		}
	},

	/**
	 * Record a client.
	 *
	 * The server deduplicates on the normalised NPWP and NIB: creating a client
	 * that another transporter already recorded LINKS to the existing company
	 * rather than making a second one. The response message says which
	 * happened, and it is worth showing — "linked to an existing company" tells
	 * the user their client is already on the platform.
	 */
	async create(payload: Record<string, unknown>) {
		shipperStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			const res = await api.post(ENDPOINTS.shippers.create, payload);
			shipperStore.update((s) => ({ ...s, saving: false }));
			return { ok: true, message: res.data?.message ?? 'Client saved.' };
		} catch (e: any) {
			const msg = message(e, 'Could not save this client.');
			shipperStore.update((s) => ({ ...s, saving: false, error: msg }));
			return { ok: false, message: msg };
		}
	},

	/**
	 * Issue the link a client uses to take ownership of their company.
	 *
	 * Returned ONCE and never stored — only its hash is kept — so a caller who
	 * loses it must issue another. That is deliberate: the link transfers
	 * ownership of a company and everything recorded against it, and one that
	 * could be fetched again would be a credential sitting in the database.
	 */
	async issueClaimLink(id: string) {
		shipperStore.update((s) => ({ ...s, saving: true, error: '', claimLink: '' }));
		try {
			const res = await api.post(ENDPOINTS.shippers.claimLink(id));
			const d = res.data?.data ?? {};
			shipperStore.update((s) => ({
				...s, saving: false,
				claimLink: d.url ?? d.link ?? d.token ?? ''
			}));
			return true;
		} catch (e: any) {
			shipperStore.update((s) => ({
				...s, saving: false, error: message(e, 'Could not issue a claim link.')
			}));
			return false;
		}
	},

	clearClaimLink() {
		shipperStore.update((s) => ({ ...s, claimLink: '' }));
	}
};
