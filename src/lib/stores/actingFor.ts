import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { api } from '$lib/utils/api';

/**
 * Which client company a Karlo staff member is working on behalf of.
 *
 * Staff administer across tenants, and much of what they do is FOR a client:
 * recording an agreement, raising an order, deciding which fields that client's
 * forms demand. Without this the only company they could act for is Karlo's
 * own, which is not a company that ships anything.
 *
 * Kept in session storage rather than local storage on purpose. Acting as
 * somebody else should not outlive the browser session — coming back tomorrow
 * still holding a client's identity is how an order ends up on the wrong
 * company's books.
 */
const STORAGE_KEY = 'acting-for';

export interface ActingFor {
	companyId: string;
	companyName: string;
	/**
	 * Which side of the market the client trades on: shipper or transporter.
	 *
	 * Stored alongside the id because the console follows it — the two behave
	 * differently, and staff acting for a shipper should not be shown a
	 * planner and a fleet the client does not have.
	 */
	companyRole: string;
}

const EMPTY: ActingFor = { companyId: '', companyName: '', companyRole: '' };

function restore(): ActingFor {
	if (!browser) return EMPTY;
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as ActingFor) : EMPTY;
	} catch {
		return EMPTY;
	}
}

const store = writable<ActingFor>(EMPTY);

export const actingFor = {
	subscribe: store.subscribe,

	/** Restore on boot, and re-apply the header the api client sends. */
	init() {
		const saved = restore();
		store.set(saved);
		api.setActingFor(saved.companyId);
	},

	set(companyId: string, companyName: string, companyRole = '') {
		const next = { companyId, companyName, companyRole };
		store.set(next);
		api.setActingFor(companyId);
		if (browser) {
			if (companyId) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
			else sessionStorage.removeItem(STORAGE_KEY);
		}
	},

	clear() {
		actingFor.set('', '', '');
	},

	current(): ActingFor {
		return get(store);
	}
};
