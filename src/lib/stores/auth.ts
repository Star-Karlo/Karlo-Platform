import { derived, writable } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { api, REFRESH_KEY, TOKEN_KEY, USER_KEY } from '$lib/utils/api';
import { actingFor } from '$lib/stores/actingFor';
import { consoleKeyFor } from '$lib/constants/nav';

export interface AuthState {
	isAuthenticated: boolean;
	user: any | null;
	token: string | null;
	/** False until init() has looked at storage, so the shell can hold its render. */
	ready: boolean;
}

function createAuthStore() {
	const { subscribe, set } = writable<AuthState>({
		isAuthenticated: false,
		user: null,
		token: null,
		ready: false
	});

	return {
		subscribe,
		init() {
			if (!browser) return;
			const token = localStorage.getItem(TOKEN_KEY);
			const user = localStorage.getItem(USER_KEY);
			if (token && user) {
				set({ isAuthenticated: true, token, user: JSON.parse(user), ready: true });
				api.setToken(token);
				actingFor.init();
			} else {
				set({ isAuthenticated: false, token: null, user: null, ready: true });
				goto('/auth');
			}
		},
		login(token: string, user: any, refreshToken?: string) {
			if (browser) {
				localStorage.setItem(TOKEN_KEY, token);
				localStorage.setItem(USER_KEY, JSON.stringify(user));
				// Absent when a session is resumed from a link that carried only
				// an access token; the existing one then stays valid.
				if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
			}
			api.setToken(token);
			set({ isAuthenticated: true, token, user, ready: true });
		},
		logout() {
			// Acting-for is cleared with the session it belongs to: a new
			// person signing in on this browser must never inherit the last
			// one's client.
			actingFor.clear();
			if (browser) {
				localStorage.removeItem(TOKEN_KEY);
				localStorage.removeItem(USER_KEY);
				localStorage.removeItem(REFRESH_KEY);
			}
			api.setToken('');
			set({ isAuthenticated: false, token: null, user: null, ready: true });
			goto('/auth');
		}
	};
}

export const authStore = createAuthStore();

/**
 * The signed-in user's role, as a store.
 *
 * Reading localStorage from a component does not re-run when the user signs in,
 * so anything that renders per role — the sidebar, the action bar — must read
 * it from here.
 */
export const role = derived(authStore, ($auth) => ($auth.user?.role ?? '') as string);

/**
 * Which console this user gets: admin, shipper, transporter, manager,
 * warehousepic or investor.
 *
 * Derived from the identity rather than from `role` alone. Since roles became
 * dynamic, `role` is the company's own NAME for it — "Administrator", "Sales" —
 * while `companyRole` remains a fixed platform vocabulary. Everything that
 * chooses navigation, quick actions or a URL prefix must read THIS, not `role`,
 * or it resolves to nothing for every account created under the new IAM.
 */
export const consoleKey = derived([authStore, actingFor], ([$auth, $acting]) =>
	consoleKeyFor($auth.user ?? {}, $acting.companyRole)
);

export const currentUser = derived(authStore, ($auth) => $auth.user);

/**
 * What this user may do, and what their company has bought.
 *
 * Two separate questions that are easy to conflate, and the UI has to answer
 * both differently:
 *
 *   permission — this person is not allowed. Their administrator can fix it.
 *   feature    — the company has not bought this. Sales can fix it.
 *
 * So a control gated by a missing permission is hidden, while one gated by a
 * missing feature is shown and disabled with a note. Hiding an unbought feature
 * means nobody ever discovers it exists.
 */
export interface ProductAccess {
	role: string;
	permissions: string[];
	features: string[];
	grantsAll: boolean;
}

const EMPTY_ACCESS: ProductAccess = { role: '', permissions: [], features: [], grantsAll: false };

/** TMS is this app's product. Access is per product; the platform serves one. */
export const access = derived(authStore, ($auth): ProductAccess => {
	const raw = $auth.user?.access?.tms;
	if (!raw) return EMPTY_ACCESS;
	return {
		role: raw.role ?? '',
		permissions: raw.permissions ?? [],
		features: raw.features ?? [],
		grantsAll: raw.grantsAll ?? false
	};
});

/**
 * Whether this user holds a permission.
 *
 * grantsAll short-circuits, and it has to: an administrator's permission list
 * is legitimately empty — they are unrestricted within the company's
 * entitlement rather than enumerated — so a plain `includes` would hide every
 * gated control from the people who should see all of them.
 *
 * The entitlement is still checked. An administrator of a company that has not
 * bought advanced routing does not get the reroute button, because "everything
 * the company holds" is not "everything".
 */
export const can = derived(access, ($access) => (key: string): boolean => {
	if ($access.grantsAll) return true;
	return $access.permissions.includes(key);
});

/** Whether the company has bought a feature. */
export const hasFeature = derived(access, ($access) => (name: string): boolean =>
	$access.features.includes(name)
);
