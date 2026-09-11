import axios from 'axios';
import { browser } from '$app/environment';
import { ENV } from '$lib/constants/env';

const instance = axios.create({
	baseURL: ENV.API_URL,
	timeout: 30000,
	headers: { 'Content-Type': 'application/json' }
});

/** Storage keys. One place, because the sign-out path and the auth store share them. */
export const TOKEN_KEY = 'token';
export const USER_KEY = 'user';
export const REFRESH_KEY = 'refreshToken';

function signOut() {
	if (!browser) return;
	localStorage.removeItem(TOKEN_KEY);
	localStorage.removeItem(USER_KEY);
	localStorage.removeItem(REFRESH_KEY);
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
		const refreshToken = localStorage.getItem(REFRESH_KEY);
		if (!refreshToken) throw new Error('no refresh token');

		const res = await axios.post(`${ENV.API_URL}/auth/refresh`, { refreshToken });
		const data = res.data?.data ?? res.data;
		const access = data?.accessToken;
		if (!access) throw new Error('refresh returned no access token');

		localStorage.setItem(TOKEN_KEY, access);
		// The server rotates the refresh token too. Storing the new one is what
		// makes the 30-day window roll forward instead of expiring on a fixed
		// date from first login.
		if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
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

export const api = {
	/** Act for a client company, or pass '' to act as yourself again. */
	setActingFor(companyId: string) {
		if (companyId) {
			instance.defaults.headers.common[ACTING_FOR_HEADER] = companyId;
		} else {
			delete instance.defaults.headers.common[ACTING_FOR_HEADER];
		}
	},

	setToken(token: string) {
		if (token) {
			instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
		} else {
			delete instance.defaults.headers.common['Authorization'];
		}
	},
	get: (url: string, params?: any) => instance.get(url, { params }),
	post: (url: string, data?: any) => instance.post(url, data),
	put: (url: string, data?: any) => instance.put(url, data),
	delete: (url: string) => instance.delete(url),
	upload: (url: string, formData: FormData) =>
		instance.post(url, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
};
