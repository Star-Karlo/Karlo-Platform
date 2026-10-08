import { describe, expect, it } from 'vitest';

import {
	STATE_COLOUR,
	addressLine,
	curatedSensors,
	hasFix,
	plateKey,
	summariseIncidentAggregate,
	summariseIncidents
} from './live';

describe('FMS live-fleet adapter', () => {
	it('treats a 0,0 fix as no fix — a device with no lock reports null island', () => {
		expect(hasFix({ source: 'tracker', lat: 0, lon: 0 } as any)).toBe(false);
		expect(hasFix({ source: 'tracker', lat: -6.2, lon: 106.8 } as any)).toBe(true);
		expect(hasFix({ source: 'tracker', lat: null, lon: 106.8 } as any)).toBe(false);
		expect(hasFix(null)).toBe(false);
	});

	it('compares plates the way both products do', () => {
		expect(plateKey('B-1234-XYZ')).toBe('B1234XYZ');
		expect(plateKey(' b 1234 xyz ')).toBe('B1234XYZ');
		expect(plateKey(undefined)).toBe('');
	});

	it('joins the Indonesian admin fields into one line, skipping blanks', () => {
		expect(
			addressLine({
				jalan: '',
				kecamatan: 'Genuk',
				kabupaten: '',
				kota: 'Semarang',
				provinsi: 'Jawa Tengah'
			} as any)
		).toBe('Genuk, Semarang, Jawa Tengah');
	});

	it("prefers FMS's composed address when present", () => {
		expect(addressLine({ address: 'Genuk, Semarang, Jawa Tengah', jalan: 'Jl. X' } as any)).toBe(
			'Genuk, Semarang, Jawa Tengah'
		);
		expect(addressLine({ address: '', jalan: '', kecamatan: '', kota: '', provinsi: '' } as any)).toBe('');
	});

	it('curates only the sensors present, converting units', () => {
		const rows = curatedSensors({
			'External Voltage': 24500,
			'LLS Fuel Level': 61,
			junk: 'x'
		});
		expect(rows).toEqual(
			expect.arrayContaining([
				{ label: 'Tegangan Eksternal', value: '24.5 V' },
				{ label: 'Bahan bakar (LLS Fuel Level)', value: '61' }
			])
		);
		expect(rows.some((r) => r.label.includes('junk'))).toBe(false);
		expect(curatedSensors(null)).toEqual([]);
	});

	// Lifetime counters are not live readings. They are read straight from the
	// metadata by the Specification widget, which is where a reader looks for
	// what a truck IS rather than what it is doing — listing them beside
	// voltage and satellites invited them to be read as changing while you
	// watch. Asserted so moving them back is a decision, not an accident.
	it('leaves the lifetime counters to Specification', () => {
		const rows = curatedSensors({
			'Total Odometer': 123456789,
			'Engine Total Hours': 14249,
			'External Voltage': 24500
		});
		const labels = rows.map((r) => r.label);
		expect(labels).toContain('Tegangan Eksternal');
		expect(labels).not.toContain('Odometer');
		expect(labels).not.toContain('Jam Mesin');
	});

	it('uses FMS’s state colours so both consoles read the same', () => {
		expect(STATE_COLOUR.moving).toBe('#22c55e');
		expect(STATE_COLOUR.offline).toBe('#94a3b8');
	});
});

describe('incident summary', () => {
	// Rows as /alerts returns them: flat, one per event, alert_code not code.
	const alerts = [
		{ id: 1, vehicle_id: 1, alert_code: 'OVERSPEED' },
		{ id: 2, vehicle_id: 1, alert_code: 'SOP_OVERSPEED' },
		{ id: 3, vehicle_id: 1, alert_code: 'HARSH_BRAKING' },
		{ id: 4, vehicle_id: 1, alert_code: 'BATTERY_LOW' },
		{ id: 5, vehicle_id: 3, alert_code: 'SOP_LONG_STOP' },
		{ id: 6, vehicle_id: 3, alert_code: 'EXCEEDED_IDLE' }
	];

	it('counts each FMS code under the kind the chip shows', () => {
		const s = summariseIncidents(alerts, true);
		expect(s.byVehicle.get(1)?.counts).toEqual({ overspeed: 2, stopOver: 0, idleOver: 0, harsh: 1 });
		expect(s.byVehicle.get(1)?.total).toBe(3);
		expect(s.byVehicle.get(3)?.counts).toEqual({ overspeed: 0, stopOver: 1, idleOver: 1, harsh: 0 });
		expect(s.affected).toBe(2);
	});

	it('ignores alert codes that are not incidents', () => {
		// BATTERY_LOW is a real alert but not one of the four kinds.
		expect(summariseIncidents(alerts, true).byVehicle.get(1)?.total).toBe(3);
	});

	it('is case-insensitive about codes', () => {
		const s = summariseIncidents([{ id: 9, vehicle_id: 9, alert_code: 'harsh_accel' }], true);
		expect(s.byVehicle.get(9)?.counts.harsh).toBe(1);
	});

	// control-tower prepends a live "speeding right now" line with a negative
	// id. It is not a stored event and reappears every refresh, so counting it
	// would inflate the day a little more each time the page polled.
	it('refuses a synthetic live entry if one ever reaches it', () => {
		const s = summariseIncidents(
			[
				{ id: -42, vehicle_id: 42, alert_code: 'OVERSPEED' },
				{ id: 7, vehicle_id: 42, alert_code: 'OVERSPEED' }
			],
			true
		);
		expect(s.byVehicle.get(42)?.counts.overspeed).toBe(1);
	});

	it('skips rows with no usable vehicle or code', () => {
		const s = summariseIncidents(
			[
				// null, not just undefined: Number(null) is 0, which is finite,
				// so a naive check counts these against a vehicle 0.
				{ id: 0, vehicle_id: null as any, alert_code: 'OVERSPEED' },
				{ id: 1, vehicle_id: undefined as any, alert_code: 'OVERSPEED' },
				{ id: 2, vehicle_id: 5, alert_code: null as any },
				{ id: 3, vehicle_id: 5, alert_code: 'OVERSPEED' }
			],
			true
		);
		expect(s.byVehicle.get(5)?.total).toBe(1);
		expect(s.affected).toBe(1);
	});

	// A company that never configured SOP raises no SOP_* alerts, so zero
	// means "nobody set it up", not "nothing happened".
	it('carries whether SOP is configured at all', () => {
		expect(summariseIncidents(alerts, false).sopConfigured).toBe(false);
		expect(summariseIncidents(alerts, true).sopConfigured).toBe(true);
	});

	// 500 is the server's real ceiling whatever we ask for, and it says so
	// nowhere. A count taken from a truncated read is a floor, and the chip
	// has to be able to say so rather than print it as a total.
	it('carries whether the read was truncated', () => {
		expect(summariseIncidents(alerts, true).truncated).toBe(false);
		expect(summariseIncidents(alerts, true, true).truncated).toBe(true);
	});

	it('survives an empty or missing list', () => {
		for (const a of [null, undefined, []]) {
			expect(summariseIncidents(a as any, true).affected).toBe(0);
		}
	});
});

describe('incident summary from the FMS aggregate', () => {
	const payload = {
		by_code: { OVERSPEED: 6, HARSH_BRAKING: 2, BATTERY_DROP: 9 },
		items: [
			{ vehicle_id: 1, counts: { OVERSPEED: 4, HARSH_BRAKING: 2, BATTERY_DROP: 9 }, total: 15 },
			{ vehicle_id: 3, counts: { SOP_LONG_STOP: 1, EXCEEDED_IDLE: 2 }, total: 3 }
		],
		total: 18
	};

	it('folds alert codes into the four kinds the chip shows', () => {
		const s = summariseIncidentAggregate(payload, true);
		expect(s.byVehicle.get(1)?.counts).toEqual({ overspeed: 4, stopOver: 0, idleOver: 0, harsh: 2 });
		// BATTERY_DROP is counted by FMS but is not an incident kind here, so
		// the vehicle's total is the six that are, not the fifteen it reports.
		expect(s.byVehicle.get(1)?.total).toBe(6);
		expect(s.byVehicle.get(3)?.counts).toEqual({ overspeed: 0, stopOver: 1, idleOver: 2, harsh: 0 });
		expect(s.affected).toBe(2);
	});

	it('is never truncated and says which route answered', () => {
		const s = summariseIncidentAggregate(payload, true);
		expect(s.truncated).toBe(false);
		expect(s.source).toBe('aggregate');
		expect(summariseIncidents([], true).source).toBe('paged');
	});

	// A vehicle whose only alerts are outside the four kinds has nothing
	// against it, and must not appear as an affected truck with a zero.
	it('leaves out a vehicle whose alerts are all of other kinds', () => {
		const s = summariseIncidentAggregate(
			{ items: [{ vehicle_id: 8, counts: { BATTERY_DROP: 3 }, total: 3 }] },
			true
		);
		expect(s.byVehicle.has(8)).toBe(false);
		expect(s.affected).toBe(0);
	});

	it('ignores rows with no usable vehicle, and zero or negative counts', () => {
		const s = summariseIncidentAggregate(
			{
				items: [
					{ vehicle_id: null, counts: { OVERSPEED: 5 } },
					{ vehicle_id: 2, counts: { OVERSPEED: 0, HARSH_BUMP: -1 } },
					{ vehicle_id: 4, counts: { OVERSPEED: 1 } }
				]
			},
			true
		);
		expect(s.affected).toBe(1);
		expect(s.byVehicle.get(4)?.total).toBe(1);
	});

	it('survives an empty or malformed payload', () => {
		for (const p of [null, {}, { items: [] }, { items: null }]) {
			expect(summariseIncidentAggregate(p, true).affected).toBe(0);
		}
	});

	// The two routes must agree on the same day, which is the check that lets
	// the paged fallback be removed later rather than trusted away.
	it('agrees with the paged route over the same events', () => {
		const paged = summariseIncidents(
			[
				{ id: 1, vehicle_id: 1, alert_code: 'OVERSPEED' },
				{ id: 2, vehicle_id: 1, alert_code: 'OVERSPEED' },
				{ id: 3, vehicle_id: 1, alert_code: 'HARSH_BRAKING' },
				{ id: 4, vehicle_id: 2, alert_code: 'EXCEEDED_IDLE' }
			],
			true
		);
		const aggregate = summariseIncidentAggregate(
			{
				items: [
					{ vehicle_id: 1, counts: { OVERSPEED: 2, HARSH_BRAKING: 1 } },
					{ vehicle_id: 2, counts: { EXCEEDED_IDLE: 1 } }
				]
			},
			true
		);
		expect(aggregate.affected).toBe(paged.affected);
		for (const [id, row] of paged.byVehicle) {
			expect(aggregate.byVehicle.get(id)?.counts).toEqual(row.counts);
		}
	});
});
