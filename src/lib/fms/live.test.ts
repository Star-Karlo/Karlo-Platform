import { describe, expect, it } from 'vitest';

import { hasFix, plateKey, addressLine, curatedSensors, STATE_COLOUR } from './live';

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
