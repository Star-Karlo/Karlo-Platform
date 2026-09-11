import { env } from '$env/dynamic/public';

/**
 * Remote asset host.
 *
 * Images live in S3 (`karlo-platform-v2`, ap-southeast-3) rather than in this
 * repository, so the frontend bundle stays small and an artwork change does not
 * need a redeploy. Nothing here is imported by the build — these are runtime
 * URLs.
 *
 * Override with PUBLIC_ASSET_BASE_URL to point at CloudFront, a staging bucket,
 * or a local mirror. No trailing slash.
 */
const DEFAULT_BASE = 'https://karlo-platform-v2.s3.ap-southeast-3.amazonaws.com';

export const ASSET_BASE = (env.PUBLIC_ASSET_BASE_URL || DEFAULT_BASE).replace(/\/$/, '');

/**
 * URL for one asset key, e.g. asset('img/LogoSidebar.png').
 *
 * Keys mirror the folder layout of the old app's src/assets, so a path from
 * that codebase translates directly.
 */
export function asset(key: string): string {
	return `${ASSET_BASE}/assets/${key.replace(/^\/+/, '')}`;
}

/**
 * The handful of assets the shell itself needs.
 *
 * Everything else is addressed by key through asset(). Only things referenced
 * by name in more than one place earn a constant here.
 */
export const BRAND = {
	/**
	 * The split-card login artwork.
	 *
	 * The isometric illustration in the old design lives in the landing app, not
	 * this repository, so the key below has nothing behind it yet. The login page
	 * checks `LOGIN_ILLUSTRATION_READY` and renders a branded panel instead of a
	 * broken image until the file is uploaded to that key.
	 */
	loginIllustration: asset('img/login-illustration.png'),
	logoSidebar: asset('img/LogoSidebar.png'),
	logoWhiteWithText: asset('img/logo-white-with-text.png'),
	logoMark: asset('img/LogoKarlo.png'),
	loading: asset('img/logoLoading.gif')
};

/** Planner map markers, keyed by the truck status they represent. */
export const TRUCK_MARKER: Record<string, string> = {
	onDuty: asset('icon/truckOnduty.png'),
	active: asset('icon/truckIdle.png'),
	idle: asset('icon/truckIdle.png'),
	waitingDepartureOrder: asset('icon/truckPlanned.png'),
	maintenance: asset('icon/truckPlanned.png'),
	empty: asset('icon/truckEmpty.png'),
	notAvailable: asset('icon/truckUnavailable.png'),
	inactive: asset('icon/truckUnavailable.png'),
	unpaired: asset('icon/truckOther.png')
};

/**
 * Flip to true once `assets/img/login-illustration.png` exists in the bucket.
 * Kept explicit rather than probing at runtime: a HEAD request on every page
 * load to decide whether to show a picture is not worth it.
 */
export const LOGIN_ILLUSTRATION_READY = false;
