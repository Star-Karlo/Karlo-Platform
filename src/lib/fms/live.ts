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
	/** Tank size from FMS's own vehicle record; master data does not hold it.
	 *  Null where nobody has set it, which is much of the migrated fleet. */
	tank_litres?: number | null;
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

// Odometer and Engine Total Hours are NOT here: they are lifetime counters,
// not live readings, and they belong in Specification beside the brand and the
// fuel ratio. Listing them among voltage and satellites invited them to be
// read as something that changes while you watch.
const CURATED: { key: string; label: string; format: (v: number) => string }[] = [
	{ key: 'External Voltage', label: 'Tegangan Eksternal', format: (v) => `${(v / 1000).toFixed(1)} V` },
	{ key: 'Battery Voltage', label: 'Tegangan Baterai', format: (v) => `${(v / 1000).toFixed(2)} V` },
	{ key: 'GSM Signal', label: 'Sinyal GSM', format: (v) => `${v}/5` },
	{ key: 'satellites', label: 'Satelit', format: (v) => `${v}` },
	{ key: 'altitude', label: 'Ketinggian', format: (v) => `${Math.round(v)} m` },
	{ key: 'Engine Speed (CAN)', label: 'Putaran Mesin', format: (v) => `${Math.round(v)} rpm` },
	{ key: 'Engine Oil Pressure (CAN)', label: 'Tekanan Oli', format: (v) => `${v} kPa` },
	{ key: 'Engine Torque', label: 'Torsi Mesin', format: (v) => `${v} %` }
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

// ---------------------------------------------------------------------------

/**
 * Incidents over a window, for the whole fleet, in one request.
 *
 * Read from /alerts, NOT from /control-tower. That endpoint answers a
 * different question — "what needs attention now" — and three of its
 * behaviours are right for that and wrong for counting a window: it truncates
 * alerts to three per vehicle (so every busy truck, which is the point of the
 * chip, undercounts), it drops an alert once an operator marks it checked (so
 * the count falls as people work), and it prepends a synthetic live OVERSPEED
 * line that is not a stored event.
 *
 * /alerts carries the same events untruncated, checked and unchecked, and
 * takes vehicle_id as a FILTER rather than requiring it — so one call still
 * answers for the whole fleet.
 *
 * Harsh driving is real here, from the tracker's own green-driving events.
 */
export type IncidentKind = 'overspeed' | 'stopOver' | 'idleOver' | 'harsh';

/** FMS alert codes, grouped as the chip counts them. */
const INCIDENT_CODES: Record<IncidentKind, string[]> = {
	overspeed: ['OVERSPEED', 'SOP_OVERSPEED'],
	stopOver: ['SOP_LONG_STOP'],
	idleOver: ['EXCEEDED_IDLE'],
	harsh: ['HARSH_BRAKING', 'HARSH_ACCEL', 'HARSH_CORNERING', 'HARSH_BUMP']
};

const KIND_OF_CODE: Record<string, IncidentKind> = Object.fromEntries(
	Object.entries(INCIDENT_CODES).flatMap(([kind, codes]) => codes.map((c) => [c, kind as IncidentKind]))
);

/** A usable FMS vehicle id, or null.
 *
 *  Number(null) is 0 and Number.isFinite(0) is true, so a row with no vehicle
 *  attached — FMS has them, a device alert raised before its tracker is bound
 *  to a truck — would otherwise be counted against a vehicle 0 that does not
 *  exist. Ids are positive, so that is the test. */
function vehicleIdOf(v: unknown): number | null {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : null;
}

export interface VehicleIncidents {
	vehicle_id: number;
	counts: Record<IncidentKind, number>;
	total: number;
}

export interface IncidentSummary {
	byVehicle: Map<number, VehicleIncidents>;
	/** Trucks with at least one incident in the window. */
	affected: number;
	/**
	 * True when more alerts matched the window than we read, so the counts are
	 * a floor rather than a total. The UI must say so: undercounting is most
	 * likely on a busy day, which is the day somebody is looking at the chip
	 * because something went wrong. Always false from the aggregate, which
	 * has no row limit.
	 */
	truncated: boolean;
	/** Which route answered. Kept so one day's numbers can be compared across
	 *  both before the paging fallback is removed. */
	source: 'aggregate' | 'paged';
	/**
	 * True when the company has SOP settings, so a zero means "nothing
	 * happened". Without them FMS raises no SOP_* alerts at all, and a zero
	 * would mean "nobody configured it" — a different thing, and not one to
	 * report as a confident nought.
	 */
	sopConfigured: boolean;
}

const EMPTY_COUNTS = (): Record<IncidentKind, number> => ({
	overspeed: 0,
	stopOver: 0,
	idleOver: 0,
	harsh: 0
});

/** Fold a window's alerts into per-vehicle incident counts. */
export function summariseIncidents(
	alerts: Partial<Alert>[] | null | undefined,
	sopConfigured: boolean,
	truncated = false
): IncidentSummary {
	const byVehicle = new Map<number, VehicleIncidents>();
	for (const a of alerts ?? []) {
		const id = vehicleIdOf(a?.vehicle_id);
		if (id === null) continue;
		// A negative id marks control-tower's synthetic "speeding right now"
		// line. It should not reach here, and must not be counted as a stored
		// event if it ever does — it reappears on every refresh.
		if (Number(a?.id) < 0) continue;
		const kind = KIND_OF_CODE[String(a?.alert_code ?? '').toUpperCase()];
		if (!kind) continue;
		const row = byVehicle.get(id) ?? { vehicle_id: id, counts: EMPTY_COUNTS(), total: 0 };
		row.counts[kind] += 1;
		row.total += 1;
		byVehicle.set(id, row);
	}
	return { byVehicle, affected: byVehicle.size, sopConfigured, truncated, source: 'paged' };
}

/**
 * The same counts from FMS's own aggregate: one call, no row limit, no paging.
 *
 * Keyed by alert_code rather than by the four kinds the chip shows, so the
 * grouping stays here with its tests and FMS does not inherit our vocabulary.
 *
 * Only vehicles WITH alerts appear — a quiet truck is absent, not zero — which
 * suits a map keyed on the ones that have something against them. Two further
 * limits worth knowing rather than discovering: alerts with no vehicle bound
 * are excluded, so this total can sit slightly under /alerts' own; and alerts
 * aged into cold storage are not counted, which is nothing for today's window
 * and wrong for a quarter.
 */
export function summariseIncidentAggregate(payload: any, sopConfigured: boolean): IncidentSummary {
	const byVehicle = new Map<number, VehicleIncidents>();
	for (const row of payload?.items ?? []) {
		const id = vehicleIdOf(row?.vehicle_id);
		if (id === null) continue;
		const counts = EMPTY_COUNTS();
		let total = 0;
		for (const [code, n] of Object.entries(row?.counts ?? {})) {
			const kind = KIND_OF_CODE[String(code).toUpperCase()];
			const count = Number(n) || 0;
			if (!kind || count <= 0) continue;
			counts[kind] += count;
			total += count;
		}
		if (total > 0) byVehicle.set(id, { vehicle_id: id, counts, total });
	}
	return { byVehicle, affected: byVehicle.size, sopConfigured, truncated: false, source: 'aggregate' };
}

/* Every list endpoint in fms-api clamps to 500 and says nothing about it — no
   error, no header — so asking for more is answered with 500 and silence. The
   count that is NOT clamped is `total` on the response, which is a count over
   the same filter rather than the length of what came back. That is how we
   know whether we have the day or a slice of it. */
const ALERTS_PAGE = 500;
/** At most this many pages per refresh. Four covers a very busy day; beyond
 *  it the chip says "+" rather than spending a fleet's patience on counting. */
const ALERTS_MAX_PAGES = 4;

export async function fetchIncidentSummary(from: Date, to: Date): Promise<IncidentSummary> {
	const window = `from=${encodeURIComponent(rfc(from))}&to=${encodeURIComponent(rfc(to))}`;
	const sopPromise = fmsGet<any>('/sop/settings').catch(() => null);

	// The aggregate where it exists, the paged read where it does not. Asking
	// first and falling back means no flag day when it deploys, and keeps a
	// second route to compare one day's numbers against before this fallback
	// is removed.
	try {
		const agg = await fmsGet<any>(`/alerts/summary?${window}`);
		if (agg && Array.isArray(agg.items)) {
			const sop = await sopPromise;
			return summariseIncidentAggregate(agg, !!sop && Object.keys(sop).length > 0);
		}
	} catch {
		/* not deployed yet, or unreachable: fall through and page */
	}

	const rows: Alert[] = [];
	let total = 0;
	let truncated = false;
	for (let page = 0; page < ALERTS_MAX_PAGES; page++) {
		const res = await fmsGet<{ items?: Alert[]; total?: number }>(
			`/alerts?${window}&limit=${ALERTS_PAGE}&offset=${page * ALERTS_PAGE}`
		);
		const items = res.items ?? [];
		rows.push(...items);
		total = Number(res.total ?? rows.length);
		// Short page means the end, whatever `total` claims.
		if (items.length < ALERTS_PAGE || rows.length >= total) break;
		if (page === ALERTS_MAX_PAGES - 1) truncated = rows.length < total;
	}

	const sop = await sopPromise;
	return summariseIncidents(rows, !!sop && Object.keys(sop).length > 0, truncated);
}

export const INCIDENT_LABEL: Record<IncidentKind, string> = {
	overspeed: 'Overspeed',
	stopOver: 'Stop melebihi toleransi',
	idleOver: 'Idle melebihi toleransi',
	harsh: 'Harsh driving'
};

// ---------------------------------------------------------------------------

/**
 * Fuel for the WHOLE fleet, one row per vehicle, in one request.
 *
 * `vehicle_id` omitted means the fleet — the same endpoint the per-vehicle
 * panel uses, unscoped. Estimated rather than metered: distance ÷ the
 * vehicle's configured km/L, plus idle burn. `litres` and `cost` are null
 * wherever nobody has set km/L on the vehicle record, which is much of the
 * migrated fleet, so a total is a total of what IS configured.
 *
 * FMS caps the window at 35 days. Anything longer has to be asked of them
 * rather than stitched together here.
 */
export const FUEL_MAX_DAYS = 35;

export interface FleetFuelRow {
	vehicle_id: number;
	license_plate: string;
	vehicle_type?: string | null;
	fleet_group?: string | null;
	distance_km: number;
	idle_hours: number;
	kmpl?: number | null;
	tank_litres?: number | null;
	litres?: number | null;
	cost?: number | null;
	idle_litres: number;
	idle_cost: number;
	range_km?: number | null;
	refuels?: number | null;
}

export interface FleetFuel {
	days: number;
	price_per_litre: number;
	rows: FleetFuelRow[];
	totals: {
		vehicles: number;
		distance_km: number;
		litres: number;
		cost: number;
		idle_litres: number;
		idle_cost: number;
	};
}

export async function fetchFleetFuel(days: number): Promise<FleetFuel> {
	const capped = Math.max(1, Math.min(Math.round(days), FUEL_MAX_DAYS));
	const res = await fmsGet<any>(`/fuel/analysis?days=${capped}`);
	return {
		days: Number(res?.days ?? capped),
		price_per_litre: Number(res?.price_per_litre ?? 0),
		rows: Array.isArray(res?.rows) ? res.rows : [],
		totals: {
			vehicles: Number(res?.totals?.vehicles ?? 0),
			distance_km: Number(res?.totals?.distance_km ?? 0),
			litres: Number(res?.totals?.litres ?? 0),
			cost: Number(res?.totals?.cost ?? 0),
			idle_litres: Number(res?.totals?.idle_litres ?? 0),
			idle_cost: Number(res?.totals?.idle_cost ?? 0)
		}
	};
}

/** Ways a planner may want the fuel list ordered. */
export type FuelSort = 'litres' | 'cost' | 'distance' | 'efficiency' | 'idle' | 'plate';

export const FUEL_SORTS: { value: FuelSort; label: string }[] = [
	{ value: 'litres', label: 'Pemakaian tertinggi' },
	{ value: 'cost', label: 'Biaya tertinggi' },
	{ value: 'distance', label: 'Jarak terjauh' },
	{ value: 'efficiency', label: 'Rasio terboros' },
	{ value: 'idle', label: 'Idle terlama' },
	{ value: 'plate', label: 'Nomor polisi' }
];

/**
 * Sorted for reading, which means the interesting end first.
 *
 * A vehicle with no configured km/L has no litres and no cost — it sorts last
 * on those rather than first, because an unknown is not a zero and a truck
 * nobody has configured is not the most economical in the fleet.
 */
export function sortFleetFuel(rows: FleetFuelRow[], by: FuelSort): FleetFuelRow[] {
	const out = [...rows];
	const desc = (v: number | null | undefined) => (v == null ? -Infinity : v);
	switch (by) {
		case 'plate':
			return out.sort((a, b) => (a.license_plate ?? '').localeCompare(b.license_plate ?? ''));
		case 'cost':
			return out.sort((a, b) => desc(b.cost) - desc(a.cost));
		case 'distance':
			return out.sort((a, b) => (b.distance_km ?? 0) - (a.distance_km ?? 0));
		case 'idle':
			return out.sort((a, b) => (b.idle_hours ?? 0) - (a.idle_hours ?? 0));
		case 'efficiency':
			// Worst first: the lowest km/L burns the most per kilometre. An
			// unconfigured vehicle has no ratio to judge, so it goes last.
			return out.sort((a, b) => (a.kmpl ?? Infinity) - (b.kmpl ?? Infinity));
		default:
			return out.sort((a, b) => desc(b.litres) - desc(a.litres));
	}
}
