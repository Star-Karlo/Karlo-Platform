import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'karlo.sidebarCollapsed';

/**
 * Sidebar collapse state, 215px expanded to 75px collapsed.
 *
 * Persisted because it is a workspace preference: a planner who works from the
 * map wants the narrow rail every time, not once per session.
 */
function createSidebarStore() {
	const initial = browser && localStorage.getItem(STORAGE_KEY) === 'true';
	const { subscribe, set, update } = writable<boolean>(initial);

	return {
		subscribe,
		toggle() {
			update((collapsed) => {
				const next = !collapsed;
				if (browser) localStorage.setItem(STORAGE_KEY, String(next));
				return next;
			});
		},
		set(value: boolean) {
			if (browser) localStorage.setItem(STORAGE_KEY, String(value));
			set(value);
		}
	};
}

export const sidebarCollapsed = createSidebarStore();
