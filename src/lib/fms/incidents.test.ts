import { describe, it, expect } from 'vitest';
import { incidentsOf, minutesInState, trucksWithIncidents } from './incidents';
import type { LiveVehicle } from './live';

const THRESHOLDS = { speedLimitKmh: 60, stopToleranceHours: 2, idleToleranceMinutes: 15 };
const NOW = Date.parse('2026-10-07T12:00:00Z');
const agoMinutes = (m: number) => new Date(NOW - m * 60000).toISOString();

function truck(over: Partial<LiveVehicle> = {}): LiveVehicle {
	return {
		vehicle_id: 1,
		license_plate: 'B-1234-XY',
		position: { source: 'tracker', lat: 0, lon: 0, speed: 0, bearing: 0, ignition: true, time: null },
		online: true,
		drive_state: 'parking',
		stale_minutes: 0,
		...over
	} as LiveVehicle;
}

describe('live incidents', () => {
	it('counts a moving truck above the limit', () => {
		const v = truck({ drive_state: 'moving', position: { ...truck().position!, speed: 75 } });
		expect(incidentsOf(v, THRESHOLDS, NOW)).toEqual(['overspeed']);
	});

	it('does not count a speed from a truck that is not moving', () => {
		// A stale fix reading 90 km/h from an hour ago is not an incident now.
		const v = truck({ drive_state: 'parking', position: { ...truck().position!, speed: 90 } });
		expect(incidentsOf(v, THRESHOLDS, NOW)).toEqual([]);
	});

	it('counts a stop only once it passes the tolerance', () => {
		const within = truck({ drive_state: 'parking', state_since: agoMinutes(119) });
		const beyond = truck({ drive_state: 'parking', state_since: agoMinutes(121) });
		expect(incidentsOf(within, THRESHOLDS, NOW)).toEqual([]);
		expect(incidentsOf(beyond, THRESHOLDS, NOW)).toEqual(['stopOver']);
	});

	it('counts an idle on its own, shorter tolerance', () => {
		const v = truck({ drive_state: 'idle', state_since: agoMinutes(20) });
		expect(incidentsOf(v, THRESHOLDS, NOW)).toEqual(['idleOver']);
	});

	it('says nothing about a truck whose state has no start time', () => {
		const v = truck({ drive_state: 'parking', state_since: undefined });
		expect(incidentsOf(v, THRESHOLDS, NOW)).toEqual([]);
		expect(minutesInState(v, NOW)).toBeNull();
	});

	it('reports more than one incident when more than one holds', () => {
		const v = truck({
			drive_state: 'moving',
			state_since: agoMinutes(300),
			position: { ...truck().position!, speed: 99 }
		});
		expect(incidentsOf(v, THRESHOLDS, NOW)).toEqual(['overspeed']);
	});

	it('follows the thresholds it is given, not fixed numbers', () => {
		const v = truck({ drive_state: 'moving', position: { ...truck().position!, speed: 75 } });
		expect(incidentsOf(v, { ...THRESHOLDS, speedLimitKmh: 80 }, NOW)).toEqual([]);
	});

	it('picks out only the misbehaving trucks', () => {
		const fleet = [
			truck({ vehicle_id: 1, drive_state: 'moving', position: { ...truck().position!, speed: 75 } }),
			truck({ vehicle_id: 2, drive_state: 'moving', position: { ...truck().position!, speed: 40 } }),
			truck({ vehicle_id: 3, drive_state: 'idle', state_since: agoMinutes(40) })
		];
		expect(trucksWithIncidents(fleet, THRESHOLDS, NOW).map((v) => v.vehicle_id)).toEqual([1, 3]);
	});
});
