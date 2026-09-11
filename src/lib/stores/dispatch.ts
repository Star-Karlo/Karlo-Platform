import { writable } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/** One truck the planner could assign, with the evidence for choosing it. */
export interface Candidate {
	truckId: string;
	policeNumber: string;
	truckTypeId: string;
	driverIds: string[];
	/**
	 * Distance to the loading point as the crow flies — not by road, which is
	 * always longer. Named for what it is so a planner reading "42 km" knows
	 * which 42 km.
	 */
	straightLineMeters: number;
	/** When the truck was last known to be there. */
	positionAt?: string;
	/**
	 * False for a truck that has never completed a shipment. Still assignable,
	 * but there is no evidence of where it is, so it sorts last.
	 */
	positionKnown: boolean;
}

export interface RouteLeg {
	id: string;
	leg: 'haul' | 'approach';
	reroutedAt?: string;
	route?: {
		distanceMeters: number;
		durationSeconds: number;
		geometry?: number[][];
		bbox?: number[];
		hasToll: boolean;
		tollDistanceMeters: number;
	};
}

interface DispatchState {
	candidates: Candidate[];
	routes: RouteLeg[];
	loading: boolean;
	error: string;
	/**
	 * Set when the server answers 402 — the company has not bought advanced
	 * routing. Held separately from `error` because it is not a failure: the
	 * UI should explain what the feature is, not show a red banner.
	 */
	notEntitled: string;
}

export const dispatchStore = writable<DispatchState>({
	candidates: [],
	routes: [],
	loading: false,
	error: '',
	notEntitled: ''
});

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

export const dispatchActions = {
	async candidates(orderId: string) {
		dispatchStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.orders.candidates(orderId));
			dispatchStore.update((s) => ({ ...s, candidates: res.data?.data ?? [], loading: false }));
		} catch (e: any) {
			dispatchStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load available trucks.')
			}));
		}
	},

	async routes(orderId: string) {
		try {
			const res = await api.get(ENDPOINTS.orders.routes(orderId));
			dispatchStore.update((s) => ({ ...s, routes: res.data?.data ?? [] }));
		} catch (e: any) {
			dispatchStore.update((s) => ({ ...s, error: message(e, 'Could not load the route.') }));
		}
	},

	async assign(orderId: string, driverId: string, truckId: string) {
		dispatchStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			await api.put(ENDPOINTS.orders.assign(orderId), { driverId, truckId });
			// The approach leg only exists once a truck is assigned, so the
			// routes are re-read rather than assumed unchanged.
			await dispatchActions.routes(orderId);
			dispatchStore.update((s) => ({ ...s, loading: false }));
			return true;
		} catch (e: any) {
			dispatchStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not assign this truck.')
			}));
			return false;
		}
	},

	/**
	 * Re-plan a leg. The paid feature.
	 *
	 * A 402 is handled separately from other failures: it means the company has
	 * not bought advanced routing, which is a sales conversation rather than
	 * something the user or their administrator did wrong.
	 */
	async reroute(orderId: string, leg: 'haul' | 'approach' = 'approach') {
		dispatchStore.update((s) => ({ ...s, loading: true, error: '', notEntitled: '' }));
		try {
			await api.post(ENDPOINTS.orders.reroute(orderId), { leg });
			await dispatchActions.routes(orderId);
			dispatchStore.update((s) => ({ ...s, loading: false }));
			return true;
		} catch (e: any) {
			const status = e?.response?.status;
			dispatchStore.update((s) => ({
				...s,
				loading: false,
				notEntitled: status === 402 ? message(e, 'Advanced routing is not enabled for your company.') : '',
				error: status === 402 ? '' : message(e, 'Could not re-plan this route.')
			}));
			return false;
		}
	},

	reset() {
		dispatchStore.set({ candidates: [], routes: [], loading: false, error: '', notEntitled: '' });
	}
};

/** Metres to a short human string. Rounded to the nearest tenth of a km. */
export function km(meters: number | undefined): string {
	if (meters === undefined || meters === null) return '—';
	return `${(meters / 1000).toFixed(1)} km`;
}
