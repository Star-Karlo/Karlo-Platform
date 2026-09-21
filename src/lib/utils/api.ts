import axios from 'axios';
import { browser } from '$app/environment';
import { ENV } from '$lib/constants/env';

const instance = axios.create({
	baseURL: ENV.API_URL,
	timeout: 30000,
	headers: { 'Content-Type': 'application/json' },
	// The refresh token is an HttpOnly cookie the browser attaches; see
	// $lib/utils/session.
	withCredentials: true
});

/**
 * Storage keys. One place, because the sign-out path and the auth store share
 * them. Per tab (sessionStorage): the access token is short-lived and a new
 * tab signs itself in from the shared cookie. REFRESH_KEY is only ever
 * removed — a leftover from when the refresh token lived in localStorage.
 */
export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';
export const REFRESH_KEY = 'refreshToken';

/** The tab's own copy of the session. */
export const tabStore = {
	get(key: string): string | null {
		if (!browser) return null;
		try {
			return sessionStorage.getItem(key);
		} catch {
			return null;
		}
	},
	set(key: string, value: string) {
		if (!browser) return;
		try {
			sessionStorage.setItem(key, value);
		} catch {
			/* private mode — the tab just re-signs in from the cookie */
		}
	},
	clear() {
		if (!browser) return;
		try {
			sessionStorage.removeItem(TOKEN_KEY);
			sessionStorage.removeItem(USER_KEY);
			localStorage.removeItem(TOKEN_KEY);
			localStorage.removeItem(USER_KEY);
			localStorage.removeItem(REFRESH_KEY);
		} catch {
			/* nothing to clear */
		}
	}
};

function signOut() {
	if (!browser) return;
	tabStore.clear();
	window.location.href = '/auth';
}

/**
 * Session handling.
 *
 * The access token lasts 2 hours, the refresh token 30 days. A 401 therefore
 * usually means "the access token aged out", not "the session is over" — so
 * the first 401 buys one attempt at /auth/refresh and a replay of the original
 * request. Only if that fails is the session actually finished.
 *
 * Without this the refresh token was issued on every login and never used, and
 * anyone with a tab open longer than two hours was thrown back to the login
 * screen mid-task.
 */
let refreshing: Promise<string> | null = null;

/**
 * Exchange the refresh token for a new pair.
 *
 * Uses a BARE axios call, not `instance`: going through the instance would hit
 * this same interceptor on failure and recurse. The in-flight promise is shared
 * so ten concurrent 401s produce one refresh, not ten — otherwise each rotation
 * invalidates the last and they knock each other out.
 */
async function refreshSession(): Promise<string> {
	if (refreshing) return refreshing;

	refreshing = (async () => {
		// An empty body: the browser attaches the HttpOnly refresh cookie, and
		// the service rotates it in the same response. A tab that predates the
		// cookie may still hold a token in localStorage; it is spent once and
		// forgotten.
		const legacy = browser ? localStorage.getItem(REFRESH_KEY) : null;
		const res = await axios.post(`${ENV.API_URL}/auth/refresh`, legacy ? { refreshToken: legacy } : {}, {
			withCredentials: true
		});
		if (legacy) localStorage.removeItem(REFRESH_KEY);
		const data = res.data?.data ?? res.data;
		const access = data?.accessToken;
		if (!access) throw new Error('refresh returned no access token');

		tabStore.set(TOKEN_KEY, access);
		instance.defaults.headers.common['Authorization'] = `Bearer ${access}`;
		return access;
	})().finally(() => {
		refreshing = null;
	});

	return refreshing;
}

instance.interceptors.response.use(
	(response) => response,
	async (error) => {
		const original = error.config;
		const isAuthCall = typeof original?.url === 'string' && original.url.includes('/auth/');

		// `_retried` stops a loop: if the replayed request 401s again, the new
		// token is not the problem and the session really is over.
		if (error.response?.status === 401 && browser && original && !original._retried && !isAuthCall) {
			original._retried = true;
			try {
				const token = await refreshSession();
				original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
				return instance(original);
			} catch {
				signOut();
				return Promise.reject(error);
			}
		}

		if (error.response?.status === 401 && browser) signOut();
		return Promise.reject(error);
	}
);

/**
 * The company a Karlo staff member is acting for.
 *
 * Sent as a header on every request rather than added to each payload, because
 * "who am I acting as" is the same question on a create, an edit and a read —
 * putting it in bodies would mean adding it to a dozen request shapes and
 * forgetting it on the reads.
 *
 * The server refuses it from anyone who is not staff, so a stale value cannot
 * become a way for a company to read another's data.
 */
const ACTING_FOR_HEADER = 'X-Acting-For';

/**
 * TEMPORARY — Mode Uji. While the order page's test switch is on, every
 * request carries X-Status-Bypass so the business service lets a company
 * Administrator (or Karlo staff) walk an order through the driver's and
 * warehouse's status steps. The server ignores the header for other roles.
 * Remove together with the strip on OrderDetailPage.
 */
const STATUS_BYPASS_HEADER = 'X-Status-Bypass';
export const TEST_MODE_KEY = 'karlo-test-mode';

export const api = {
	/** Mode Uji on/off — persisted per browser; see STATUS_BYPASS_HEADER. */
	setTestMode(on: boolean) {
		if (on) instance.defaults.headers.common[STATUS_BYPASS_HEADER] = '1';
		else delete instance.defaults.headers.common[STATUS_BYPASS_HEADER];
		try {
			if (typeof localStorage !== 'undefined') localStorage.setItem(TEST_MODE_KEY, on ? '1' : '0');
		} catch {
			/* private mode */
		}
	},
	testMode(): boolean {
		try {
			return typeof localStorage !== 'undefined' && localStorage.getItem(TEST_MODE_KEY) === '1';
		} catch {
			return false;
		}
	},

	/** Act for a client company, or pass '' to act as yourself again. */
	setActingFor(companyId: string) {
		if (companyId) {
			instance.defaults.headers.common[ACTING_FOR_HEADER] = companyId;
		} else {
			delete instance.defaults.headers.common[ACTING_FOR_HEADER];
		}
	},

	/** Exchange the shared refresh cookie for a new access token. */
	refresh: () => refreshSession(),

	setToken(token: string) {
		if (token) {
			instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
		} else {
			delete instance.defaults.headers.common['Authorization'];
		}
	},
	get: (url: string, params?: any, config?: { headers?: Record<string, string> }) =>
		instance.get(url, { params, ...(config ?? {}) }),
	post: (url: string, data?: any) => instance.post(url, data),
	put: (url: string, data?: any) => instance.put(url, data),
	patch: (url: string, data?: any) => instance.patch(url, data),
	delete: (url: string) => instance.delete(url),
	upload: (url: string, formData: FormData) =>
		instance.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
};

// Mode Uji survives a reload: re-arm the header from what the browser kept.
if (api.testMode()) api.setTestMode(true);
