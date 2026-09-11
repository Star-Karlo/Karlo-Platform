import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { PaginatedResponse, Warehouse } from '$lib/types';

interface WarehouseState {
	/** Set when a request fails, so a page says so instead of showing "no data". */
	error: string;
	warehouses: Warehouse[];
	currentWarehouse: Warehouse | null;
	loading: boolean;
	totalRows: number;
}

export const warehouseStore = writable<WarehouseState>({
	warehouses: [],
	currentWarehouse: null,
	loading: false,
	error: '',
	totalRows: 0
});

export const warehouseActions = {
	async getAll(params?: { page?: number; pageSize?: number; filtered?: any[] }) {
		warehouseStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.warehouses.list, {
				page: params?.page ?? 0,
				pageSize: params?.pageSize ?? 50,
				filtered: params?.filtered ? JSON.stringify(params.filtered) : undefined
			});
			const data = res.data as PaginatedResponse<Warehouse>;
			warehouseStore.update((s) => ({
				...s,
				// The service sends null rather than [] for a company with none.
				warehouses: data.data ?? [],
				totalRows: data.meta?.totalRows ?? 0,
				loading: false
			}));
		} catch (e: any) {
			warehouseStore.update((s) => ({ ...s, loading: false, error: e?.response?.data?.message ?? 'Could not load this list.' }));
		}
	},

	async getOne(id: string) {
		const res = await api.get(ENDPOINTS.warehouses.one(id));
		warehouseStore.update((s) => ({ ...s, currentWarehouse: res.data.data }));
	},

	async create(data: Partial<Warehouse>) {
		return (await api.post(ENDPOINTS.warehouses.create, data)).data;
	},

	async update(id: string, data: Partial<Warehouse>) {
		return (await api.put(ENDPOINTS.warehouses.update(id), data)).data;
	}
};
