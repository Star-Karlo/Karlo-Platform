import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Agreement, PaginatedResponse } from '$lib/types';

interface AgreementState {
	/** Set when a request fails, so a page says so instead of showing "no data". */
	error: string;
	agreements: Agreement[];
	currentAgreement: Agreement | null;
	loading: boolean;
	totalRows: number;
	page: number;
}

export const agreementStore = writable<AgreementState>({
	agreements: [],
	currentAgreement: null,
	loading: false,
	error: '',
	totalRows: 0,
	page: 0
});

export const agreementActions = {
	async getAll(params?: { page?: number; pageSize?: number; filtered?: any[] }) {
		agreementStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.agreements.list, {
				page: params?.page || 0,
				pageSize: params?.pageSize || 20,
				filtered: params?.filtered ? JSON.stringify(params.filtered) : undefined
			});
			const data = res.data as PaginatedResponse<Agreement>;
			agreementStore.update((s) => ({
				...s, agreements: data.data ?? [], totalRows: data.meta?.totalRows || 0, loading: false
			}));
		} catch (e: any) {
			agreementStore.update((s) => ({ ...s, loading: false, error: e?.response?.data?.message ?? 'Could not load this list.' }));
		}
	},

	async getOne(id: string) {
		agreementStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.agreements.one(id));
			agreementStore.update((s) => ({ ...s, currentAgreement: res.data.data, loading: false }));
		} catch {
			agreementStore.update((s) => ({ ...s, loading: false }));
		}
	},

	async create(data: Partial<Agreement>) {
		return (await api.post(ENDPOINTS.agreements.create, data)).data;
	},

	async approve(id: string) {
		// Approve and reject are one endpoint now; the body carries which.
		return (await api.put(ENDPOINTS.agreements.decision(id), { approve: true })).data;
	},

	async cancel(id: string) {
		return (await api.put(ENDPOINTS.agreements.decision(id), { approve: false })).data;
	},

	/**
	 * The shipper's explicit sign-off.
	 *
	 * Companies with strict verification refuse to order against an agreement
	 * that has not been verified, so this is a separate act from approving it.
	 */
	async verify(id: string) {
		return (await api.put(ENDPOINTS.agreements.verify(id))).data;
	}
}
