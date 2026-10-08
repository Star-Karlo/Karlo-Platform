import { describe, expect, it } from 'vitest';

import { STATE_COLOUR, addressLine, curatedSensors, hasFix, plateKey, summariseIncidents } from './live';

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
