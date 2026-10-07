/**
 * Live incidents, read off the fleet feed the Control Tower already holds.
 *
 * What this is NOT: the prototype's Status Insiden, which seeds its events
 * off the plate with a pseudo-random generator because that view has no real
 * device feed. Those numbers are invented — speeds never recorded, stops that
 * never happened — and an operator would act on them.
 *
 * What it IS: what the trucks are doing RIGHT NOW, from the one fleet request
 * already being made. Overspeed and over-tolerance stops and idles are all
 * decidable from a position and the state it has been in.
 *
 * The limit is honest and worth stating: this is a snapshot, not a day's
 * history, and harsh driving is absent because nothing in the live payload
 * reports it. A count of today's events per truck needs an aggregate endpoint
 * FMS does not expose — asking for it sixty times a refresh is not a
 * substitute, and inventing it is worse.
 */
import type { LiveVehicle } from './live';

export type IncidentKind = 'overspeed' | 'stopOver' | 'idleOver';

export interface IncidentThresholds {
	speedLimitKmh: number;
	stopToleranceHours: number;
	idleToleranceMinutes: number;
}

/** How long the truck has been in its current state, in minutes; null if unknown. */
export function minutesInState(v: LiveVehicle, now = Date.now()): number | null {
	if (!v.state_since) return null;
	const since = new Date(v.state_since).getTime();
	if (Number.isNaN(since)) return null;
	return Math.max(0, Math.round((now - since) / 60000));
}

/** Which incidents this truck is in right now. Empty when it is behaving. */
export function incidentsOf(v: LiveVehicle, t: IncidentThresholds, now = Date.now()): IncidentKind[] {
	const out: IncidentKind[] = [];
	const speed = v.position?.speed ?? null;
	// Only a moving truck can be speeding. A stale fix showing 90 km/h from an
	// hour ago is not an incident now, and drive_state is what says so.
	if (v.drive_state === 'moving' && speed != null && speed > t.speedLimitKmh) out.push('overspeed');

	const mins = minutesInState(v, now);
	if (mins != null) {
		if (v.drive_state === 'parking' && mins >= t.stopToleranceHours * 60) out.push('stopOver');
		if (v.drive_state === 'idle' && mins >= t.idleToleranceMinutes) out.push('idleOver');
	}
	return out;
}

/** The trucks currently in at least one incident. */
export function trucksWithIncidents(
	fleet: LiveVehicle[],
	t: IncidentThresholds,
	now = Date.now()
): LiveVehicle[] {
	return fleet.filter((v) => incidentsOf(v, t, now).length > 0);
}

export const INCIDENT_LABEL: Record<IncidentKind, string> = {
	overspeed: 'Overspeed',
	stopOver: 'Stop melebihi toleransi',
	idleOver: 'Idle melebihi toleransi'
};
