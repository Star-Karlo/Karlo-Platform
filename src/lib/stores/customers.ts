import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Customer, PaginatedResponse } from '$lib/types';

interface CustomerState {
	customers: Customer[];
	loading: boolean;
	totalRows: number;
	page: number;
	/** Set when a request fails, so the page can say so instead of showing "no data". */
	error: string;
}

export const customerStore = writable<CustomerState>({
	customers: [],
	loading: false,
	totalRows: 0,
	page: 0,
	error: ''
});

export const customerActions = {
	async getAll(params?: { page?: number; pageSize?: number; filtered?: any[] }) {
		customerStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.customers.list, {
				page: params?.page ?? 0,
				pageSize: params?.pageSize ?? 20,
				filtered: params?.filtered ? JSON.stringify(params.filtered) : undefined
			});
			const data = res.data as PaginatedResponse<Customer>;
			customerStore.update((s) => ({
				...s,
				customers: data.data ?? [],
				totalRows: data.meta?.totalRows ?? 0,
				page: params?.page ?? 0,
				loading: false
			}));
		} catch (e: any) {
			customerStore.update((s) => ({
				...s,
				loading: false,
				error: e?.response?.data?.message ?? 'Could not load customers.'
			}));
		}
	},

	async create(data: Partial<Customer>) {
		return (await api.post(ENDPOINTS.customers.create, data)).data;
	},

	/** Only the fields passed are applied; omitted fields keep their value. */
	async update(id: string, data: Partial<Customer>) {
		return (await api.put(ENDPOINTS.customers.update(id), data)).data;
	},

	/** Soft delete — orders reference customers by id. */
	async remove(id: string) {
		return (await api.delete(ENDPOINTS.customers.remove(id))).data;
	}
};
