/**
 * One session across the Karlo apps.
 *
 * TMS (tms.karlo.id) and FMS (fms.karlo.id) are two front ends over one
 * authentication service and one JWT. Signing in to one means being signed
 * in to the other, and signing out of either ends both. The shared thing is
 * a pair of cookies the APIs set on the parent domain:
 *
 *   karlo_rt       the refresh token — HttpOnly, never readable here
 *   karlo_session  a marker ("1") beside it — the one thing a page may read
 *
 * This app keeps the access token in memory for the tab (sessionStorage),
 * never the refresh token: a refresh is `POST /auth/refresh` with an empty
 * body and the browser attaching the cookie. On boot with no token of its
 * own, that refresh IS the sign-in. Sign-out on the other app is noticed
 * because the marker disappears (watched every second) — and, belt and
 * braces, because the server revoked the session so the next request
 * fails and cannot refresh.
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

	/**
	 * Call `onGone` when the marker disappears — the other app signed out.
	 * Returns a stop function.
	 */
	watch(onGone: () => void): () => void {
		if (!browser) return () => {};
		let had = sharedSession.present();
		const timer = setInterval(() => {
			const has = sharedSession.present();
			if (had && !has) onGone();
			had = has;
		}, 1000);
		return () => clearInterval(timer);
	}
};
