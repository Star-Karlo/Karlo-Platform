import { derived, get, writable } from 'svelte/store';
import { isPublicPath } from '$lib/constants/publicRoutes';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { api, TOKEN_KEY, USER_KEY, tabStore } from '$lib/utils/api';
import { sharedSession } from '$lib/utils/session';
import { ENDPOINTS } from '$lib/constants/endpoints';
import { actingFor } from '$lib/stores/actingFor';
import { consoleKeyFor, homeForIdentity } from '$lib/constants/nav';

export interface AuthState {
	isAuthenticated: boolean;
	user: any | null;
	token: string | null;
	/** False until init() has looked at storage, so the shell can hold its render. */
	ready: boolean;
}

let stopWatch: () => void = () => {};
function startWatch() {
	stopWatch();
	stopWatch = sharedSession.watch(
		// The other Karlo app signed out: the shared marker is gone. Follow
		// suit without a server round trip — the session is already revoked.
		() => void authStore.logout({ remote: false }),
		// Someone else signed in on the other app: the browser's session is
		// theirs now, so this tab becomes them too. Their identity may land
		// on a different console than the page we are on.
		() => {
			stopWatch();
			tabStore.clear();
			void authStore.adoptShared().then((ok) => {
				if (ok) window.location.href = homeForIdentity(get(authStore).user ?? {});
				else void authStore.logout({ remote: false });
			});
		}
	);
}

function createAuthStore() {
	const { subscribe, set } = writable<AuthState>({
		isAuthenticated: false,
		user: null,
		token: null,
		ready: false
	});

	const signedOut = () => set({ isAuthenticated: false, token: null, user: null, ready: true });

	return {
		subscribe,
		init() {
			if (!browser) return;
			// A tab that already has its session (a reload).
			const token = tabStore.get(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
			const user = tabStore.get(USER_KEY) ?? localStorage.getItem(USER_KEY);
			// A stored session is only ours while the browser's shared session
			// is still the same person's; otherwise adopt whoever it is now.
			const who = sharedSession.who();
			const stale = !!user && !!who && JSON.parse(user)?.id !== who;
			if (token && user && !stale) {
				set({ isAuthenticated: true, token, user: JSON.parse(user), ready: true });
				api.setToken(token);
				actingFor.init();
				startWatch();
				return;
			}
			// No session of our own — the browser may hold the shared one
			// (signed in on the other Karlo app, or a new tab of this one).
			void this.adoptShared().then((adopted) => {
				if (adopted) return;
				signedOut();
				// Not from a page built for people with no account: Web-Field's
				// PIC is at a warehouse gate and has nothing to sign in with.
				if (!isPublicPath(window.location.pathname)) goto('/auth');
			});
		},
		/**
		 * Sign in from the shared session cookie: exchange it for an access
		 * token and load the identity. True when it worked; false when there
		 * is no shared session or it no longer validates.
		 */
		async adoptShared(): Promise<boolean> {
			if (!browser || !sharedSession.present()) return false;
			try {
				const token = await api.refresh();
				const me = (await api.get(ENDPOINTS.auth.me)).data?.data;
				if (!me) return false;
				this.login(token, me);
				actingFor.init();
				return true;
			} catch {
				api.setToken('');
				return false;
			}
		},
		login(token: string, user: any) {
			tabStore.set(TOKEN_KEY, token);
			tabStore.set(USER_KEY, JSON.stringify(user));
			api.setToken(token);
			set({ isAuthenticated: true, token, user, ready: true });
			startWatch();
		},
		/**
		 * End the session everywhere: the service revokes it and clears the
		 * shared cookies (so the other app notices within a second and its
		 * next request cannot refresh), then this tab forgets it.
		 * `remote: false` is for when the server already knows — the other
		 * app signed out, or the token was rejected.
		 */
		async logout(opts: { remote?: boolean } = {}) {
			stopWatch();
			if (opts.remote !== false && browser && (tabStore.get(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY))) {
				try {
					await api.post(ENDPOINTS.auth.logout);
				} catch {
					/* the local sign-out proceeds regardless */
				}
			}
			// Acting-for is cleared with the session it belongs to: a new
			// person signing in on this browser must never inherit the last
			// one's client.
			actingFor.clear();
			tabStore.clear();
			api.setToken('');
			signedOut();
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
export const hasFeature = derived(
	access,
	($access) =>
		(name: string): boolean =>
			$access.features.includes(name)
);
