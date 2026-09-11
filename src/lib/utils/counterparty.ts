import { navKey } from '$lib/constants/nav';

/**
 * Which company name to show in a list's "Company" column.
 *
 * A record names both sides. A shipper cares who is carrying the load, a
 * transporter cares who is sending it, and Karlo staff need both — so the
 * column is chosen from the viewer's role rather than fixed.
 *
 * The business service resolves these names once per page. Do not join
 * /users per row to get them.
 */
export type Sided = {
	shipperCompanyName?: string;
	transporterCompanyName?: string;
};

export function counterpartyLabel(role: string): string {
	switch (navKey(role)) {
		case 'shipper':
			return 'Transporter';
		case 'transporter':
		case 'manager':
			return 'Shipper';
		default:
			return 'Company';
	}
}

export function counterpartyName(row: Sided, role: string): string {
	switch (navKey(role)) {
		case 'shipper':
			return row.transporterCompanyName ?? '';
		case 'transporter':
		case 'manager':
			return row.shipperCompanyName ?? '';
		default:
			// Staff see both sides of the deal.
			return [row.shipperCompanyName, row.transporterCompanyName].filter(Boolean).join(' → ');
	}
}

/** True when a viewer should see both sides as separate columns. */
export function seesBothSides(role: string): boolean {
	return navKey(role) === 'admin';
}
