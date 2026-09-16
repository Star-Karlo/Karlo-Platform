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

/**
 * The prototype's toast: a dark pill at the bottom of the screen with a
 * green check, gone after 2.6 s. One function, no store — every screen
 * calls it the same way the Vue pages called `ui.toast(msg)`.
 */
export function toast(message: string): void {
	if (typeof document === 'undefined') return;
	let host = document.getElementById('revamp-toast-host');
	if (!host) {
		host = document.createElement('div');
		host.id = 'revamp-toast-host';
		host.style.cssText =
			'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:3000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;';
		document.body.appendChild(host);
	}
	const el = document.createElement('div');
	el.setAttribute('role', 'status');
	el.style.cssText =
		'background:#1A1C1E;color:#fff;border-radius:999px;padding:11px 18px;font-size:13.5px;font-weight:600;box-shadow:0 4px 14px rgba(11,25,58,.18);display:flex;align-items:center;gap:8px;max-width:min(92vw,560px);';
	el.innerHTML = `<span style="color:#7CDB99;font-weight:800">✓</span><span></span>`;
	(el.lastElementChild as HTMLElement).textContent = message;
	host.appendChild(el);
	setTimeout(() => el.remove(), 2600);
}
