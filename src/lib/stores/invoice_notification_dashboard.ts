import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import type { Invoice, Notification, PaginatedResponse } from '$lib/types';

// Invoice Store
interface InvoiceState {
	invoices: Invoice[];
	currentInvoice: Invoice | null;
	loading: boolean;
	totalRows: number;
	/** Set when a request fails, so a page says so instead of showing "no data". */
	error: string;
}

export const invoiceStore = writable<InvoiceState>({
	invoices: [], currentInvoice: null, loading: false, totalRows: 0, error: ''
});

export const invoiceActions = {
	async getAll(params?: { page?: number; filtered?: any[] }) {
		invoiceStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.invoices.list, {
				page: params?.page || 0, pageSize: 20,
				filtered: params?.filtered ? JSON.stringify(params.filtered) : undefined
			});
			const data = res.data as PaginatedResponse<Invoice>;
			invoiceStore.update((s) => ({ ...s, invoices: data.data ?? [], totalRows: data.meta?.totalRows || 0, loading: false }));
		} catch (e: any) {
			invoiceStore.update((s) => ({
				...s,
				loading: false,
				error: e?.response?.data?.message ?? 'Could not load this list.'
			}));
		}
	},
	async updateStatus(id: string, action: string) {
		// The monolith had one endpoint per action (/invoice-paid/:id and so
		// on). There is now one status endpoint whose body names the target,
		// and the service enforces who may make each move: the transporter
		// issues and submits, the shipper verifies and settles.
		return (await api.put(ENDPOINTS.invoices.status(id), { status: action })).data;
	}
};

// Notification Store
interface NotificationState {
	notifications: Notification[];
	unreadCount: number;
	loading: boolean;
}

export const notificationStore = writable<NotificationState>({
	notifications: [], unreadCount: 0, loading: false
});

export const notificationActions = {
	async getAll() {
		notificationStore.update((s) => ({ ...s, loading: true }));
		try {
			const res = await api.get(ENDPOINTS.notifications.list);
			notificationStore.update((s) => ({ ...s, notifications: res.data.data || [], loading: false }));
		} catch {
			notificationStore.update((s) => ({ ...s, loading: false }));
		}
	},
	async getUnread() {
		const res = await api.get(ENDPOINTS.notifications.unread);
		notificationStore.update((s) => ({ ...s, unreadCount: res.data.data || 0 }));
	},
	async markRead(id: string) {
		await api.post(ENDPOINTS.notifications.read, { ids: id ? [id] : [], all: !id });
	}
};

// Dashboard Store
interface DashboardState {
	summary: any;
	chart: any;
	loading: boolean;
}

export const dashboardStore = writable<DashboardState>({
	summary: null, chart: null, loading: false
});

export const dashboardActions = {
	async getSummary(params?: any) {
		dashboardStore.update((s) => ({ ...s, loading: true }));
		try {
			const res = await api.get(ENDPOINTS.orders.summary, params);
			dashboardStore.update((s) => ({ ...s, summary: res.data.data, loading: false }));
		} catch {
			dashboardStore.update((s) => ({ ...s, loading: false }));
		}
	},
	async getChart(params?: any) {
		// No chart endpoint exists on the business service yet. The summary
		// returns counts by status, which is enough to render a breakdown;
		// a time series needs an endpoint that has not been built.
		const res = await api.get(ENDPOINTS.orders.summary, params);
		dashboardStore.update((s) => ({ ...s, chart: res.data.data }));
	}
};
