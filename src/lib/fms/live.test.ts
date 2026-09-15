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
		expect(addressLine({ jalan: '', kecamatan: 'Genuk', kabupaten: '', kota: 'Semarang', provinsi: 'Jawa Tengah' } as any)).toBe(
			'Genuk, Semarang, Jawa Tengah'
		);
	});

	it('curates only the sensors present, converting units', () => {
		const rows = curatedSensors({ 'External Voltage': 24500, 'Total Odometer': 123456789, 'LLS Fuel Level': 61, junk: 'x' });
		expect(rows).toEqual(
			expect.arrayContaining([
				{ label: 'Tegangan Eksternal', value: '24.5 V' },
				{ label: 'Odometer', value: '123.457 km' },
				{ label: 'Bahan bakar (LLS Fuel Level)', value: '61' }
			])
		);
		expect(rows.some((r) => r.label.includes('junk'))).toBe(false);
		expect(curatedSensors(null)).toEqual([]);
	});

	it('uses FMS’s state colours so both consoles read the same', () => {
		expect(STATE_COLOUR.moving).toBe('#22c55e');
		expect(STATE_COLOUR.offline).toBe('#94a3b8');
	});
});
