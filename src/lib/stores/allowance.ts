import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/** One line of the driver's advance. */
export interface AllowanceComponent {
	code: string;
	label: string;
	amount: string;
	note?: string;
}

/**
 * What the system knows about the journey, for whoever is deciding the advance.
 *
 * The advance itself is typed by hand — by sales or finance, whichever the
 * company decided. This is the evidence it is typed against.
 */
export interface Evidence {
	/** Warehouse to warehouse: the revenue journey. */
	haulDistanceMeters?: number;
	/**
	 * The truck's run to the loading point. Separate because it is unpaid
	 * repositioning, and the part a driver is most likely to be short-changed on.
	 */
	approachDistanceMeters?: number;
	totalDistanceMeters: number;
	tollDistanceMeters: number;
	tollEstimate: string;
	/**
	 * "tariff" when every tolled leg carried MAPID's gate-priced fare (the
	 * estimate is the real tariff for tollGolongan); "rate" when at least one
	 * leg fell back to the per-km rate.
	 */
	tollEstimateSource?: 'tariff' | 'rate';
	/** Toll class (1–5) the tariff was read for, from the assigned truck's type. */
	tollGolongan?: number;
	/** Fare per golongan across the journey, when every tolled leg had a tariff. */
	tollPrices?: Record<string, number>;
	/**
	 * False when part of the route had no toll data. The estimate is then a
	 * floor rather than a figure, and the UI says so.
	 */
	tollDataComplete: boolean;
}

export interface AllowanceView {
	allowance?: {
		components: AllowanceComponent[];
		total: string;
		note?: string;
		enteredAt?: string;
		finalisedAt?: string;
	};
	evidence: Evidence;
	/** False once finalised. From the server, so the button and the API agree. */
	editable: boolean;
}

interface AllowanceState {
	view: AllowanceView | null;
	history: any[];
	loading: boolean;
	saving: boolean;
	error: string;
}

export const allowanceStore = writable<AllowanceState>({
	view: null,
	history: [],
	loading: false,
	saving: false,
	error: ''
});

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

/** One row of the Uang Sangu list, as the service returns it. */
export interface AllowanceListRow {
	orderId: string;
	orderNumber: string;
	statusCode: string;
	customerId?: string;
	originWarehouseId?: string;
	destinationWarehouseId?: string;
	truckId?: string;
	pickupAt?: string;
	total?: string | number;
	enteredAt?: string;
	finalisedAt?: string;
}

export const allowanceActions = {
	/**
	 * Page through the company's orders with their advances.
	 *
	 * `state` narrows: "pending" is entered but not finalised, "final" is
	 * finalised, "none" is no advance yet, "" is everything.
	 */
	async list(params: { page?: number; pageSize?: number; state?: string } = {}) {
		const res = await api.get(ENDPOINTS.orders.allowances, {
			page: params.page ?? 0,
			pageSize: params.pageSize ?? 20,
			state: params.state || undefined
		});
		return {
			rows: (res.data?.data ?? []) as AllowanceListRow[],
			totalRows: Number(res.data?.meta?.totalRows ?? 0)
		};
	},

	async load(orderId: string) {
		allowanceStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.orders.allowance(orderId));
			allowanceStore.update((s) => ({ ...s, view: res.data?.data ?? null, loading: false }));
		} catch (e: any) {
			// A 403 here is normal: the company decided this person may not see
			// the figure. The panel is hidden by permission before it ever
			// loads, so reaching this means something else went wrong.
			allowanceStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load the driver allowance.')
			}));
		}
	},

	/**
	 * Save the advance.
	 *
	 * The total is deliberately not sent. The server adds the components up, so
	 * a total that disagreed with its own lines cannot be stored — and nobody
	 * has to find the disagreement later by adding them up by hand.
	 */
	async save(
		orderId: string,
		components: AllowanceComponent[],
		opts: { note?: string; reason?: string; currencyId?: string } = {}
	) {
		allowanceStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			const res = await api.put(ENDPOINTS.orders.allowance(orderId), {
				components,
				note: opts.note ?? '',
				reason: opts.reason ?? '',
				currencyId: opts.currencyId ?? ''
			});
			allowanceStore.update((s) => ({ ...s, view: res.data?.data ?? s.view, saving: false }));
			return true;
		} catch (e: any) {
			allowanceStore.update((s) => ({
				...s,
				saving: false,
				error: message(e, 'Could not save the driver allowance.')
			}));
			return false;
		}
	},

	async finalise(orderId: string) {
		allowanceStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			const res = await api.post(ENDPOINTS.orders.allowanceFinalise(orderId));
			allowanceStore.update((s) => ({ ...s, view: res.data?.data ?? s.view, saving: false }));
			return true;
		} catch (e: any) {
			allowanceStore.update((s) => ({
				...s,
				saving: false,
				error: message(e, 'Could not finalise the driver allowance.')
			}));
			return false;
		}
	},

	async history(orderId: string) {
		try {
			const res = await api.get(ENDPOINTS.orders.allowanceHistory(orderId));
			allowanceStore.update((s) => ({ ...s, history: res.data?.data ?? [] }));
		} catch {
			// History is supporting detail. Failing to load it should not take
			// the panel down with it.
		}
	},

	reset() {
		allowanceStore.set({ view: null, history: [], loading: false, saving: false, error: '' });
	}
};

/** The advance components a company starts from, before anyone edits them. */
export const DEFAULT_COMPONENTS: AllowanceComponent[] = [
	{ code: 'bbm', label: 'Biaya BBM', amount: '0' },
	{ code: 'tol', label: 'Biaya Tol', amount: '0' },
	{ code: 'makan', label: 'Uang Makan', amount: '0' }
];
