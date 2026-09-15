import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Truck, PaginatedResponse } from '$lib/types';

interface TruckState {
	/** Set when a request fails, so a page says so instead of showing "no data". */
	error: string;
	trucks: Truck[];
	currentTruck: Truck | null;
	loading: boolean;
	totalRows: number;
}

export const truckStore = writable<TruckState>({
	trucks: [], currentTruck: null, loading: false,
	error: '', totalRows: 0
});

export const truckActions = {
	async getAll(params?: { page?: number; pageSize?: number; status?: string; isAvailable?: string; search?: string }) {
		truckStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.vehicles.list, {
				page: params?.page || 0,
				pageSize: params?.pageSize || 20,
				status: params?.status || undefined,
				isAvailable: params?.isAvailable || undefined,
				search: params?.search || undefined
			});
			const data = res.data as PaginatedResponse<Truck>;
			truckStore.update((s) => ({ ...s, trucks: data.data ?? [], totalRows: data.meta?.totalRows || 0, loading: false }));
		} catch (e: any) {
			truckStore.update((s) => ({ ...s, loading: false, error: e?.response?.data?.message ?? 'Could not load this list.' }));
		}
	},

	async getOne(id: string) {
		const res = await api.get(ENDPOINTS.vehicles.one(id));
		truckStore.update((s) => ({ ...s, currentTruck: res.data.data }));
	},

	async create(data: Partial<Truck>) {
		return (await api.post(ENDPOINTS.vehicles.create, data)).data;
	},

	async update(id: string, data: any) {
		return (await api.put(ENDPOINTS.vehicles.update(id), data)).data;
	}
};
