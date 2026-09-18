import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

/**
 * Runtime configuration.
 *
 * The API base URL is now a single value, where the monolith needed two
 * (API_URL and ORDER_URL for its two hosts). Both production and development
 * route by path to the right service — the load balancer does it in production,
 * the Vite proxy does it locally — so the application never needs to know which
 * service answers a given call.
 */

function getApiUrl(): string {
	// Set PUBLIC_API_URL in .env to point at a deployed environment. Unset, the
	// relative path is used, which the Vite dev proxy forwards to the services
	// running on localhost.
	//
	// Read dynamically rather than from $env/static/public: the static form
	// requires the variable to exist at build time, so an unset PUBLIC_API_URL
	// would fail the build rather than fall through to the local default.
	if (env.PUBLIC_API_URL) return env.PUBLIC_API_URL;

	if (!browser) return 'http://localhost:5173/api/v1';
	return '/api/v1';
}

export const ENV = {
	API_URL: getApiUrl(),
	STORAGE_URL: 'https://s3.ap-southeast-1.amazonaws.com/storagekarlo/'
};

/**
 * Basemap configuration.
 *
 * MapLibre GL over MAPID's own vector basemap. MAPID publishes a `karlo` style
 * built for this account — grey land, warm orange roads — which is the map the
 * console screenshots show, plus a satellite style for the Satelit toggle.
 *
 * The tiles are VECTOR (OpenMapTiles schema, pbf), which is why this is
 * MapLibre and not Leaflet: Leaflet renders raster tiles only and would need a
 * plugin to draw these at all.
 *
 * The key is PUBLIC by nature — the browser fetches the tiles, so it appears in
 * devtools whatever we do. That is normal for a basemap key; the protection is
 * a domain restriction applied at MAPID's end, not secrecy. It is deliberately
 * a different key from the business service's MAPID_KEY, which is for routing
 * and must never reach a browser.
 */
const MAPID_KEY = env.PUBLIC_MAPID_BASEMAP_KEY ?? '';

function mapidStyle(id: string): string {
	return `https://basemap.mapid.io/styles/${id}/style.json?key=${MAPID_KEY}`;
}

/**
 * The basemap.
 *
 * `karlo-2d` rather than `karlo`: the 3D-building variant tilts buildings into
 * the view, which competes with the truck markers for attention on a map whose
 * whole job is showing where trucks are.
 *
 * MAPID also publishes `satellite`, `light`, `dark` and nine others. Swapping
 * is a one-word change here — see basemap.mapid.io/styles.json for the list.
 */
export const BASEMAP_STYLE = mapidStyle('karlo-2d');

export const MAP = {
	BASEMAP_STYLE,
	/** Whether a basemap key is configured at all. Unset, the map says so. */
	CONFIGURED: MAPID_KEY !== '',
	/** Roughly Indonesia. */
	DEFAULT_CENTER: [118.0, -2.5] as [number, number],
	DEFAULT_ZOOM: 5
};

/**
 * Karlo customer service on WhatsApp, as a wa.me link. Digits only in the
 * variable (country code first, e.g. 62812…); empty hides every "Hubungi CS
 * Karlo" button rather than linking to nowhere.
 */
export const CS_WHATSAPP_URL: string = (() => {
	const digits = (env.PUBLIC_CS_WHATSAPP ?? '').replace(/\D/g, '');
	return digits ? `https://wa.me/${digits}` : '';
})();
