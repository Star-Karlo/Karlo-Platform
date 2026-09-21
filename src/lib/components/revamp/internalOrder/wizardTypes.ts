/** The Internal Order wizard's state, exactly the prototype's shape (InternalOrderFormView.vue). */
/** Numeric inputs are bound with `bind:value` on type=number, which yields a number (or null when blank). */
export type NumInput = string | number | null;

export type WizardItem = {
	itemName: string;
	quantity: NumInput;
	weightKg: NumInput;
	dimP: NumInput;
	dimL: NumInput;
	dimT: NumInput;
	loadingDescription: string;
};

export type WizardShipment = {
	customerNama: string;
	/** The agreement's uuid (the prototype stored the AGR number). */
	agreementId: string;
	agreementLabel: string;
	loadingPoints: string[];
	unloadingPoints: string[];
	fleetDescription: string;
	/** "Body|Size" keys, at most MAX_TRUCK_OPTIONS — the truck types a planner may assign. */
	truckOptions: string[];
	expanded: boolean;
	items: WizardItem[];
	totalTonnage: NumInput;
	additionalNeeds: string[];
	description: string;
	warehouseLabel: string;
	externalId: string;
	orderSafety: string;
};

export type Wizard = {
	estimatedLoadDate: string;
	estimatedLoadTime: string;
	orderExpirationDate: string;
	shipments: WizardShipment[];
};

export type Customer = { id: string; name: string };

export type Warehouse = {
	id: string;
	name: string;
	city?: string | null;
	address?: string | null;
};

export function newItem(): WizardItem {
	return { itemName: '', quantity: '', weightKg: '', dimP: '', dimL: '', dimT: '', loadingDescription: '' };
}

export function newShipment(): WizardShipment {
	return {
		customerNama: '',
		agreementId: '',
		agreementLabel: '',
		loadingPoints: [''],
		unloadingPoints: [''],
		fleetDescription: '',
		truckOptions: [],
		expanded: true,
		items: [newItem()],
		totalTonnage: '',
		additionalNeeds: [],
		description: '',
		warehouseLabel: '',
		externalId: '',
		orderSafety: ''
	};
}

export function agreementFor(agreements: any[], sp: WizardShipment): any | null {
	return agreements.find((a) => a.id === sp.agreementId) || null;
}

export function totalVolume(sp: WizardShipment): number {
	const v = sp.items.reduce(
		(sum, it) => sum + (Number(it.dimP) || 0) * (Number(it.dimL) || 0) * (Number(it.dimT) || 0),
		0
	);
	return Math.round(v * 100) / 100;
}
export function itemsShipped(sp: WizardShipment): number {
	return sp.items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
}
export function lengthShipment(sp: WizardShipment): number {
	const v = sp.items.reduce((sum, it) => sum + (Number(it.dimP) || 0), 0);
	return Math.round(v * 100) / 100;
}
