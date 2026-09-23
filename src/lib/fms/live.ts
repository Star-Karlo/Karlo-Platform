/**
 * The live fleet, as FMS reports it.
 *
 * FMS owns telemetry; TMS observes it. Everything here goes through the
 * console's /api/fms proxy with the caller's own token, so what a user sees
 * on Control Tower is exactly what FMS would show them — same company scope,
 * same acting-for.
 *
 * Field names follow FMS's wire shape (lon, bearing) rather than ours; a
 * translation layer is one more place for the two to disagree.
 */
import { get } from 'svelte/store';
import { TOKEN_KEY, tabStore } from '$lib/utils/api';
import { actingFor } from '$lib/stores/actingFor';

export type DriveState = 'moving' | 'idle' | 'parking' | 'offline';

export interface LivePosition {
	source: 'tracker' | 'camera';
	lat: number | null;
	lon: number | null;
	speed: number | null;
	bearing: number | null;
	ignition: boolean | null;
	time: string | null;
	/**
	 * FMS's own one-line label: street when there is one, else district, then
	 * kota (or kabupaten), then province. Added because a third of positions
	 * have no named street — yards, ports, plantation roads — and only the
	 * district and city say where the truck is.
	 */
	address?: string | null;
	jalan?: string | null;
	kecamatan?: string | null;
	kabupaten?: string | null;
	kota?: string | null;
	provinsi?: string | null;
	/** Only on the per-vehicle call; the raw per-device sensor blob. */
	metadata?: Record<string, unknown> | null;
}

export interface LiveVehicle {
	/** FMS's own integer id — the key for /live-view/{id}. */
	vehicle_id: number;
	/** The master-data vehicle id, once FMS publishes it. */
	master_data_id?: string | null;
	license_plate: string;
	vehicle_type?: string | null;
	registry_status?: string | null;
	fleet_group_name?: string | null;
	driver?: { id: number; name: string; phone?: string | null } | null;
	tracker?: { id: number; imei: string } | null;
	position: LivePosition | null;
	online: boolean;
	drive_state: DriveState;
	stale_minutes: number;
	/** When the current drive_state began. Optional until FMS publishes it. */
	state_since?: string | null;
	battery_v?: number | null;
	gsm_signal?: number | null;
}

/** FMS's live map colours, per drive state. Kept identical so the two consoles read the same. */
export const STATE_COLOUR: Record<DriveState, string> = {
	moving: '#22c55e',
	idle: '#eab308',
	parking: '#3b82f6',
	offline: '#94a3b8'
};

export const STATE_LABEL: Record<DriveState, string> = {
	moving: 'Bergerak',
	idle: 'Idle (mesin hidup)',
	parking: 'Parkir',
	offline: 'Offline'
};

/** How often FMS's own map asks; the route is uncached and hits telemetry per call. */
export const LIVE_POLL_MS = 60_000;

/**
 * Straight to this app's proxy with the caller's own credentials — the same
 * bearer and acting-for the platform APIs get, so FMS answers for the same
 * company the rest of the console is showing.
 */
async function fmsGet<T>(path: string): Promise<T> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	const token = tabStore.get(TOKEN_KEY);
	if (token) headers['Authorization'] = `Bearer ${token}`;
	const acting = get(actingFor).companyId;
	if (acting) headers['X-Acting-For'] = acting;
	const res = await fetch(`/api/fms${path}`, { headers });
	if (!res.ok) throw new Error(`FMS ${res.status}`);
	return (await res.json()) as T;
}

export async function fetchLiveFleet(): Promise<LiveVehicle[]> {
	const res = await fmsGet<{ items?: LiveVehicle[] }>('/live-view');
	return res.items ?? [];
}

export async function fetchLiveVehicle(vehicleId: number): Promise<LiveVehicle | null> {
	return fmsGet<LiveVehicle>(`/live-view/${vehicleId}`);
}

/**
 * Whether a position is worth drawing. A device with no satellite lock
 * reports 0,0 — off the coast of Africa — and one such truck on the map
 * makes fit-to-markers zoom out to half the planet.
 */
export function hasFix(p: LivePosition | null | undefined): p is LivePosition & { lat: number; lon: number } {
	return !!p && p.lat != null && p.lon != null && !(Math.abs(p.lat) < 0.5 && Math.abs(p.lon) < 0.5);
}

/** A plate the way both products compare them: letters and digits only, upper case. */
export function plateKey(plate: string | undefined | null): string {
	return (plate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * The reverse-geocoded address as one line. FMS's composed `address` when it
 * sends one; the same precedence over the five admin fields otherwise, for
 * an FMS that predates the field. Empty only when nothing is known.
 */
export function addressLine(p: LivePosition | null | undefined): string {
	if (!p) return '';
	if (p.address) return p.address;
	return [p.jalan, p.kecamatan, p.kota || p.kabupaten, p.provinsi].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// Sensors
// ---------------------------------------------------------------------------

/**
 * The curated sensor readings, matching FMS's own panel. The raw metadata is
 * device-dependent — keys vary by tracker model — so only what is present is
 * shown, and fuel is matched by pattern because LLS probes report under
 * varying names.
 */
export interface SensorReading {
	label: string;
	value: string;
}

const CURATED: { key: string; label: string; format: (v: number) => string }[] = [
	{ key: 'External Voltage', label: 'Tegangan Eksternal', format: (v) => `${(v / 1000).toFixed(1)} V` },
	{ key: 'Battery Voltage', label: 'Tegangan Baterai', format: (v) => `${(v / 1000).toFixed(2)} V` },
	{
		key: 'Total Odometer',
		label: 'Odometer',
		format: (v) => `${Math.round(v / 1000).toLocaleString('id-ID')} km`
	},
	{ key: 'GSM Signal', label: 'Sinyal GSM', format: (v) => `${v}/5` },
	{ key: 'satellites', label: 'Satelit', format: (v) => `${v}` },
	{ key: 'altitude', label: 'Ketinggian', format: (v) => `${Math.round(v)} m` },
	{ key: 'Engine Speed (CAN)', label: 'Putaran Mesin', format: (v) => `${Math.round(v)} rpm` },
	{ key: 'Engine Oil Pressure (CAN)', label: 'Tekanan Oli', format: (v) => `${v} kPa` },
	{ key: 'Engine Torque', label: 'Torsi Mesin', format: (v) => `${v} %` },
	{ key: 'Engine Total Hours', label: 'Jam Mesin', format: (v) => `${v.toLocaleString('id-ID')} h` }
];

const FUEL = /fuel|(^|[^a-z])lls([^a-z]|$)/i;

export function curatedSensors(metadata: Record<string, unknown> | null | undefined): SensorReading[] {
	if (!metadata) return [];
	const out: SensorReading[] = [];
	for (const spec of CURATED) {
		const raw = metadata[spec.key];
		if (typeof raw === 'number') out.push({ label: spec.label, value: spec.format(raw) });
		else if (typeof raw === 'string' && raw !== '') out.push({ label: spec.label, value: raw });
	}
	for (const [k, v] of Object.entries(metadata)) {
		if (FUEL.test(k) && (typeof v === 'number' || typeof v === 'string')) {
			out.push({ label: `Bahan bakar (${k})`, value: String(v) });
		}
	}
	if (typeof metadata['Movement'] === 'number' || typeof metadata['Movement'] === 'boolean') {
		out.push({ label: 'Gerakan', value: metadata['Movement'] ? 'Ya' : 'Tidak' });
	}
	if (
		typeof metadata['Active GSM Operator'] === 'number' ||
		typeof metadata['Active GSM Operator'] === 'string'
	) {
		out.push({ label: 'Operator GSM', value: String(metadata['Active GSM Operator']) });
	}
	return out;
}

// ---------------------------------------------------------------------------
// The truck marker — FMS's top-down truck, drawn on a canvas
// ---------------------------------------------------------------------------

function shade(hex: string, f: number): string {
	const n = parseInt(hex.slice(1), 16);
	const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
	return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

/**
 * FMS's makeTruckTopImage, verbatim in shape: a long box truck seen from
 * above, pointing north, so it rotates by bearing to face its travel. Returns
 * a data URL for the marker layer rather than ImageData, which is what our
 * MapView takes. Cached per colour/state so 1,900 markers share four images.
 */
const iconCache = new Map<string, string>();

export function truckIcon(state: DriveState): string {
	const key = state;
	const hit = iconCache.get(key);
	if (hit) return hit;
	const color = STATE_COLOUR[state];
	const off = state === 'offline';

	const W = 64;
	const H = 128;
	const c = document.createElement('canvas');
	c.width = W;
	c.height = H;
	const ctx = c.getContext('2d')!;
	ctx.clearRect(0, 0, W, H);
	const rr = (x: number, y: number, w: number, h: number, r: number) => {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.arcTo(x + w, y, x + w, y + h, r);
		ctx.arcTo(x + w, y + h, x, y + h, r);
		ctx.arcTo(x, y + h, x, y, r);
		ctx.arcTo(x, y, x + w, y, r);
		ctx.closePath();
	};
	ctx.lineJoin = 'round';
	ctx.fillStyle = 'rgba(15,23,42,0.2)';
	rr(14, 10, 39, 116, 10);
	ctx.fill();
	ctx.fillStyle = '#111418';
	rr(10, 18, 8, 14, 3);
	ctx.fill();
	rr(46, 18, 8, 14, 3);
	ctx.fill();
	ctx.fillStyle = shade(color, 0.52);
	rr(16, 6, 32, 32, 7);
	ctx.fill();
	ctx.fillStyle = '#15181d';
	rr(18, 9, 28, 11, 4);
	ctx.fill();
	ctx.fillStyle = '#15181d';
	rr(22, 36, 20, 12, 2);
	ctx.fill();
	rr(12, 38, 7, 12, 3);
	ctx.fill();
	rr(45, 38, 7, 12, 3);
	ctx.fill();
	const grad = ctx.createLinearGradient(12, 0, 52, 0);
	grad.addColorStop(0, shade(color, 0.92));
	grad.addColorStop(0.35, shade(color, 1.12));
	grad.addColorStop(0.75, shade(color, 1.0));
	grad.addColorStop(1, shade(color, 0.72));
	ctx.fillStyle = grad;
	rr(12, 46, 40, 78, 9);
	ctx.fill();
	ctx.fillStyle = shade(color, 0.7);
	rr(14, 118, 36, 4, 2);
	ctx.fill();
	if (off) {
		ctx.fillStyle = '#111827';
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		rr(17, 88, 30, 17, 5);
		ctx.fill();
		ctx.stroke();
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 10px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('OFF', 32, 97);
	}
	const url = c.toDataURL('image/png');
	iconCache.set(key, url);
	return url;
}

// ---------------------------------------------------------------------------
// Fuel, trips and alerts — the rest of what the vehicle panel shows
// ---------------------------------------------------------------------------

/**
 * FMS's fuel ESTIMATE: distance ÷ the vehicle's configured km/L plus idle
 * hours × idle L/h, over `days`. Not metered — it is null wherever nobody has
 * set km/L or tank size on the vehicle record, which is most of the migrated
 * fleet — and the panel says so. Rp/km is derived here, as FMS does.
 */
export interface FuelEstimate {
	days: number;
	price_per_litre: number | null;
	distance_km: number | null;
	idle_hours: number | null;
	kmpl: number | null;
	litres: number | null;
	cost: number | null;
	idle_litres: number | null;
	idle_cost: number | null;
	refuels?: number | null;
	rp_per_km: number | null;
}

export async function fetchFuelEstimate(vehicleId: number, days = 30): Promise<FuelEstimate | null> {
	const res = await fmsGet<{ days: number; price_per_litre: number | null; rows?: any[] }>(
		`/fuel/analysis?vehicle_id=${vehicleId}&days=${days}`
	);
	const r = res.rows?.[0];
	if (!r) return null;
	return {
		days: res.days,
		price_per_litre: res.price_per_litre,
		distance_km: r.distance_km ?? null,
		idle_hours: r.idle_hours ?? null,
		kmpl: r.kmpl ?? null,
		litres: r.litres ?? null,
		cost: r.cost ?? null,
		idle_litres: r.idle_litres ?? null,
		idle_cost: r.idle_cost ?? null,
		refuels: r.refuels ?? null,
		rp_per_km: r.cost != null && r.distance_km ? r.cost / r.distance_km : null
	};
}

/** One fix of a trip. idle_min is dwell at a stop, 0 while moving. */
export interface TripPoint {
	lat: number;
	lon: number;
	speed: number | null;
	bearing: number | null;
	ignition: boolean | null;
	time: string;
	address?: string | null;
	over_limit?: boolean;
	idle_min?: number;
}

/**
 * The road-snapped trace and its distance ALONG ROADS — the number that
 * compares with a planned route. Windows are kept to days, not weeks: FMS
 * caps nothing server-side and the telemetry store pays for every point.
 */
export interface SnappedTrip {
	points: [number, number][]; // [lon, lat], GeoJSON order for the map
	distance_km: number | null;
	chunks_matched?: number;
	chunks_total?: number;
	/** How many raw fixes the matcher was given, to judge partial coverage. */
	points_in?: number;
	provider?: string;
}

const rfc = (d: Date) => d.toISOString();

export async function fetchSnappedTrip(vehicleId: number, from: Date, to: Date): Promise<SnappedTrip> {
	const res = await fmsGet<any>(
		`/vehicles/${vehicleId}/history/snapped?from=${encodeURIComponent(rfc(from))}&to=${encodeURIComponent(rfc(to))}`
	);
	// The tracking service answers with `geometry`: [[lon, lat], …] along the
	// roads it matched. The other names are older shapes of the same thing —
	// reading only those left the map on raw GPS dots.
	const raw: any[] = res.geometry ?? res.items ?? res.points ?? res.coordinates ?? [];
	const points: [number, number][] = raw
		.map((p: any) =>
			Array.isArray(p) ? [Number(p[0]), Number(p[1])] : [Number(p.lon ?? p.lng), Number(p.lat)]
		)
		.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1])) as [number, number][];
	return {
		points,
		distance_km: res.distance_km ?? null,
		chunks_matched: res.chunks_matched,
		chunks_total: res.chunks_total,
		points_in: res.points_in,
		provider: res.provider
	};
}

export async function fetchTrip(
	vehicleId: number,
	from: Date,
	to: Date,
	maxPoints = 2000
): Promise<TripPoint[]> {
	const res = await fmsGet<{ items?: TripPoint[] }>(
		`/vehicles/${vehicleId}/history?from=${encodeURIComponent(rfc(from))}&to=${encodeURIComponent(rfc(to))}&max_points=${maxPoints}`
	);
	return res.items ?? [];
}

export interface Alert {
	id: number | string;
	vehicle_id: number;
	license_plate?: string;
	driver_name?: string | null;
	alert_code: string;
	alert_name: string;
	severity: 'urgent' | 'important' | 'info';
	occurred_at: string;
	actual_value?: number | string | null;
	limit_value?: number | string | null;
	lat?: number | null;
	lon?: number | null;
	address?: string | null;
	media_url?: string | null;
	check_status?: 'unchecked' | 'checked' | 'false_alert';
	note?: string | null;
}

export async function fetchAlerts(vehicleId: number, from: Date, to: Date): Promise<Alert[]> {
	const res = await fmsGet<{ items?: Alert[] }>(
		`/alerts?vehicle_id=${vehicleId}&from=${encodeURIComponent(rfc(from))}&to=${encodeURIComponent(rfc(to))}`
	);
	return res.items ?? [];
}

export const SEVERITY_COLOUR: Record<Alert['severity'], string> = {
	urgent: '#dc2626',
	important: '#f59e0b',
	info: '#3b82f6'
};
