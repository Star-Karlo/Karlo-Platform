import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/**
 * Drivers — employees who drive, as master data.
 *
 * Distinct from User Management on purpose: a user is somebody who signs
 * in; a driver is somebody a truck is assigned to. Most drivers never sign
 * in, and one who does is the same record with a userId on it.
 */
export interface Driver {
	id: string;
	companyId: string;
	fullName: string;
	phone?: string;
	employeeNo?: string;
	licenseNo?: string;
	licenseClass?: string;
	/** YYYY-MM-DD (the API returns an RFC3339 UTC midnight). */
	licenseExpiry?: string;
	status: 'active' | 'inactive';
	userId?: string;
	notes?: string;
	attributes?: Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
}

export interface DriverInput {
	fullName?: string;
	phone?: string;
	employeeNo?: string;
	licenseNo?: string;
	licenseClass?: string;
	licenseExpiry?: string;
	status?: string;
	userId?: string;
	notes?: string;
}

interface DriverState {
	drivers: Driver[];
	totalRows: number;
	loading: boolean;
	error: string;
}

export const driverStore = writable<DriverState>({ drivers: [], totalRows: 0, loading: false, error: '' });

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

export const driverActions = {
	async getAll(params?: { page?: number; pageSize?: number; search?: string; status?: string }) {
		driverStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.drivers.list, {
				page: params?.page ?? 0,
				pageSize: params?.pageSize ?? 20,
				search: params?.search || undefined,
				status: params?.status || undefined
			});
			driverStore.update((s) => ({
				...s,
				drivers: res.data?.data ?? [],
				totalRows: Number(res.data?.meta?.totalRows ?? 0),
				loading: false
			}));
		} catch (e: any) {
			driverStore.update((s) => ({ ...s, loading: false, error: message(e, 'Could not load drivers.') }));
		}
	},

	async create(input: DriverInput): Promise<Driver> {
		return (await api.post(ENDPOINTS.drivers.create, input)).data?.data;
	},

	async update(id: string, input: DriverInput): Promise<Driver> {
		return (await api.put(ENDPOINTS.drivers.update(id), input)).data?.data;
	},

	async remove(id: string): Promise<void> {
		await api.delete(ENDPOINTS.drivers.remove(id));
	}
};
