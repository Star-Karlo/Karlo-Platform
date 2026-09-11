import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/** One version of a contract. Versions of one lineage share the number. */
export interface AgreementVersion {
	id: string;
	agreementNumber: string;
	version: number;
	rootAgreementId: string;
	supersedesAgreementId?: string;
	/** 'renewal' or 'update'. Absent on version 1 — the first version is not a change. */
	revisionKind?: 'renewal' | 'update';
	revisionNote?: string;
	statusCode: string;
	validFrom: string;
	validUntil: string;
	requestedByUserId?: string;
	requestedAt?: string;
	approvedByUserId?: string;
	approvedAt?: string;
	rejectedByUserId?: string;
	rejectedAt?: string;
	decisionNote?: string;
	/** When a later version took over. With approvedAt this dates the handover. */
	supersededAt?: string;
	rates?: any[];
}

export interface PriceLine {
	agreementId: string;
	agreementNumber: string;
	version: number;
	revisionKind?: string;
	revisionNote?: string;
	statusCode: string;
	approvedAt?: string;
	supersededAt?: string;
	rateId?: string;
	originCityId?: string;
	destinationCityId?: string;
	originDistrictId?: string;
	destinationDistrictId?: string;
	truckTypeId?: string;
	pricingTypeId?: string;
	price?: string;
}

interface VersionState {
	versions: AgreementVersion[];
	priceHistory: PriceLine[];
	pending: AgreementVersion[];
	loading: boolean;
	saving: boolean;
	error: string;
}

export const agreementVersionStore = writable<VersionState>({
	versions: [],
	priceHistory: [],
	pending: [],
	loading: false,
	saving: false,
	error: ''
});

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

export const agreementVersionActions = {
	async versions(id: string) {
		agreementVersionStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.agreements.versions(id));
			agreementVersionStore.update((s) => ({ ...s, versions: res.data?.data ?? [], loading: false }));
		} catch (e: any) {
			agreementVersionStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load the version history.')
			}));
		}
	},

	async priceHistory(id: string) {
		try {
			const res = await api.get(ENDPOINTS.agreements.priceHistory(id));
			agreementVersionStore.update((s) => ({ ...s, priceHistory: res.data?.data ?? [] }));
		} catch (e: any) {
			// Price history is gated by its own permission, so a 403 here means
			// this person may see the contract but not what it has cost over
			// time. Not an error worth a banner.
			if (e?.response?.status !== 403) {
				agreementVersionStore.update((s) => ({
					...s,
					error: message(e, 'Could not load the price history.')
				}));
			}
		}
	},

	async pending() {
		agreementVersionStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.agreements.pendingApproval);
			agreementVersionStore.update((s) => ({ ...s, pending: res.data?.data ?? [], loading: false }));
		} catch (e: any) {
			agreementVersionStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load the approval queue.')
			}));
		}
	},

	/**
	 * Propose a new version.
	 *
	 * A renewal takes effect at once; an update waits on a Sales Manager. That
	 * asymmetry is the server's rule, not this store's — a renewal is a fresh
	 * negotiation both sides just agreed, while an update changes a bargain
	 * already struck and mid-flight.
	 *
	 * Omitting `rates` carries the predecessor's prices forward, which is what
	 * a renewal at unchanged rates wants. Retyping a priced matrix invites
	 * transcription errors into a contract.
	 */
	async revise(
		id: string,
		body: {
			kind: 'renewal' | 'update';
			note?: string;
			validFrom?: string;
			validUntil?: string;
			rates?: any[];
		}
	) {
		agreementVersionStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			const res = await api.post(ENDPOINTS.agreements.revise(id), body);
			agreementVersionStore.update((s) => ({ ...s, saving: false }));
			return res.data?.data ?? null;
		} catch (e: any) {
			agreementVersionStore.update((s) => ({
				...s,
				saving: false,
				error: message(e, 'Could not create this revision.')
			}));
			return null;
		}
	},

	async decide(id: string, approve: boolean, note = '') {
		agreementVersionStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.put(ENDPOINTS.agreements.reviseDecision(id), { approve, note });
			agreementVersionStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			agreementVersionStore.update((s) => ({
				...s,
				saving: false,
				error: message(e, approve ? 'Could not approve this revision.' : 'Could not reject it.')
			}));
			return false;
		}
	},

	reset() {
		agreementVersionStore.set({
			versions: [], priceHistory: [], pending: [], loading: false, saving: false, error: ''
		});
	}
};

/**
 * How a version's state reads to a person.
 *
 * `superseded` is deliberately distinct from `expired`: a superseded version
 * may still be inside its dates, and orders priced against it stay valid.
 */
export const VERSION_STATUS_LABEL: Record<string, string> = {
	draft: 'Draft',
	submitted: 'Submitted',
	pendingApproval: 'Awaiting approval',
	active: 'Active',
	rejected: 'Rejected',
	superseded: 'Superseded',
	expired: 'Expired',
	cancelled: 'Cancelled'
};
