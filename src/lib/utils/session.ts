/**
 * One session across the Karlo apps.
 *
 * TMS (tms.karlo.id) and FMS (fms.karlo.id) are two front ends over one
 * authentication service and one JWT. Signing in to one means being signed
 * in to the other, and signing out of either ends both. The shared thing is
 * a pair of cookies the APIs set on the parent domain:
 *
 *   karlo_rt       the refresh token — HttpOnly, never readable here
 *   karlo_session  a marker beside it carrying the user id — the one thing a
 *                  page may read
 *
 * This app keeps the access token in memory for the tab (sessionStorage),
 * never the refresh token: a refresh is `POST /auth/refresh` with an empty
 * body and the browser attaching the cookie. On boot with no token of its
 * own, that refresh IS the sign-in. The marker is watched every second:
 * gone means the other app signed out (follow suit); a different user id
 * means someone else signed in there (become them, rather than keep an
 * identity the browser no longer holds). Belt and braces, the server also
 * revoked the old session, so its next request fails and cannot refresh.
 */
import { browser } from '$app/environment';

export const MARKER_COOKIE = 'karlo_session';

function readCookie(name: string): string {
	if (!browser) return '';
	const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
	return m ? decodeURIComponent(m[1]) : '';
}

export const sharedSession = {
	/** Whether some Karlo app has signed this browser in. */
	present(): boolean {
		return !!readCookie(MARKER_COOKIE);
	},

	/** The user id the shared session belongs to, '' when there is none. */
	who(): string {
		return readCookie(MARKER_COOKIE);
	},

	/**
	 * Watch the marker. `onGone` when it disappears (the other app signed
	 * out); `onChanged` when it names a different user (someone else signed
	 * in there). Returns a stop function.
	 */
	watch(onGone: () => void, onChanged: (userId: string) => void = () => {}): () => void {
		if (!browser) return () => {};
		let last = sharedSession.who();
		const timer = setInterval(() => {
			const now = sharedSession.who();
			if (last && !now) onGone();
			else if (now && last && now !== last) onChanged(now);
			last = now;
		}, 1000);
		return () => clearInterval(timer);
	}
};
