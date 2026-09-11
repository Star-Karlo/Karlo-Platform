import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import type { Order, PaginatedResponse } from '$lib/types';
import { ENDPOINTS, ORDER_STATUS } from '$lib/constants/endpoints';

interface OrderState {
	/** Set when a request fails, so a page says so instead of showing "no data". */
	error: string;
	orders: Order[];
	currentOrder: Order | null;
	loading: boolean;
	totalRows: number;
	totalPages: number;
	page: number;
	pageSize: number;
}

export const orderStore = writable<OrderState>({
	orders: [],
	currentOrder: null,
	loading: false,
	error: '',
	totalRows: 0,
	totalPages: 0,
	page: 0,
	pageSize: 20
});

export const orderActions = {
	async getAll(params?: { page?: number; pageSize?: number; filtered?: any[]; sorted?: any[] }) {
		orderStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.orders.list, {
				page: params?.page || 0,
				pageSize: params?.pageSize || 20,
				filtered: params?.filtered ? JSON.stringify(params.filtered) : undefined,
				sorted: params?.sorted ? JSON.stringify(params.sorted) : undefined
			});
			const data = res.data as PaginatedResponse<Order>;
			orderStore.update((s) => ({
				...s,
				orders: data.data ?? [],
				totalRows: data.meta?.totalRows || 0,
				totalPages: data.meta?.totalPages || 0,
				page: params?.page || 0,
				loading: false
			}));
		} catch (e: any) {
			orderStore.update((s) => ({ ...s, loading: false, error: e?.response?.data?.message ?? 'Could not load this list.' }));
		}
	},

	async getOne(id: string) {
		orderStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.orders.one(id));
			orderStore.update((s) => ({ ...s, currentOrder: res.data.data, loading: false }));
		} catch {
			orderStore.update((s) => ({ ...s, loading: false }));
		}
	},

	async create(data: Partial<Order>) {
		const res = await api.post(ENDPOINTS.orders.create, data);
		return res.data;
	},

	async update(id: string, data: any) {
		const res = await api.put(ENDPOINTS.orders.update(id), data);
		return res.data;
	},

	/**
	 * Cancel an order.
	 *
	 * The monolith had a dedicated /cancel-order endpoint. The business service
	 * routes every status change through one endpoint whose body names the
	 * target, and refuses the move with 409 if its state machine does not allow
	 * it from the order's current state — so a cancel that is not permitted now
	 * fails loudly rather than silently doing nothing.
	 */
	async cancel(id: string, reason?: string) {
		const res = await api.put(ENDPOINTS.orders.status(id), {
			status: ORDER_STATUS.CANCELLED,
			note: reason
		});
		return res.data;
	},

	/** Move an order to any state the machine allows from its current one. */
	async setStatus(id: string, status: string, note?: string) {
		const res = await api.put(ENDPOINTS.orders.status(id), { status, note });
		return res.data;
	},

	/**
	 * The transitions this caller may make right now.
	 *
	 * Render buttons from this rather than hardcoding them: it accounts for the
	 * order's state, the caller's role, and which side of the order their
	 * company is on.
	 */
	async transitions(id: string) {
		const res = await api.get(ENDPOINTS.orders.transitions(id));
		return res.data.data as { current: string; transitions: { status: string; label: string; alias: string }[] };
	},

	async history(id: string) {
		const res = await api.get(ENDPOINTS.orders.history(id));
		return res.data.data;
	},

	/**
	 * Assign a driver and truck.
	 *
	 * Field names changed from driver/truck to driverId/truckId, and the service
	 * verifies with master data that the driver is actually paired with that
	 * truck before accepting — the monolith wrote both ids with no check.
	 */
	async assignDriver(id: string, driverId: string, truckId: string) {
		const res = await api.put(ENDPOINTS.orders.assign(id), { driverId, truckId });
		return res.data;
	},

	async summary() {
		const res = await api.get(ENDPOINTS.orders.summary);
		return res.data.data as Record<string, number>;
	}
};
