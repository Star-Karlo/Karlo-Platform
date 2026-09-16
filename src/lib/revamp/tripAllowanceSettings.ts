/**
 * Trip Allowance > Configuration — the prototype's settings/tripAllowance
 * document, held on the company (GET/PUT /companies/me,
 * settings.tripAllowance). The console owns the formula (uangSangu.js);
 * the services only carry the numbers.
 */
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

export interface TripAllowanceSettings {
	fuel: {
		method: 'ratio' | 'perKm';
		pricePerLiter: number;
		ratioByTruckType: Record<string, number | ''>;
		costPerKm: number;
	};
	meal: { nominalPerDay: number; method: 'eta' | 'km'; kmPerDay: number };
	lodging: { nominalPerNight: number };
}

export function tripAllowanceDefaults(): TripAllowanceSettings {
	return {
		fuel: { method: 'ratio', pricePerLiter: 0, ratioByTruckType: {}, costPerKm: 0 },
		meal: { nominalPerDay: 0, method: 'eta', kmPerDay: 0 },
		lodging: { nominalPerNight: 0 }
	};
}

function merge(saved: any): TripAllowanceSettings {
	const base = tripAllowanceDefaults();
	return {
		fuel: {
			...base.fuel,
			...(saved?.fuel ?? {}),
			ratioByTruckType: { ...(saved?.fuel?.ratioByTruckType ?? {}) }
		},
		meal: { ...base.meal, ...(saved?.meal ?? {}) },
		lodging: { ...base.lodging, ...(saved?.lodging ?? {}) }
	};
}

/** The saved configuration, and whether one has ever been saved. */
export async function loadTripAllowance(): Promise<{ settings: TripAllowanceSettings; exists: boolean }> {
	const res = await api.get(ENDPOINTS.companyMe);
	const saved = res.data?.data?.settings?.tripAllowance;
	return { settings: merge(saved), exists: !!saved };
}

export async function saveTripAllowance(settings: TripAllowanceSettings): Promise<void> {
	await api.put(ENDPOINTS.companyMe, { settings: { tripAllowance: settings } });
}
