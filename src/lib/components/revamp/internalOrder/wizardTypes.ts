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
	/** The PIC responsible at each point, one per entry of the arrays above (null = not chosen yet). */
	loadingPics: (PointPic | null)[];
	unloadingPics: (PointPic | null)[];
	fleetDescription: string;
	/** "Body|Size" keys, at most MAX_TRUCK_OPTIONS — the truck types a planner may assign. */
	truckOptions: string[];
	/** The picked agreement's truck-type matrix — what truckOptions may be chosen from. */
	agreementTruckTypes: string[];
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

export type WarehousePic = { id?: string; name: string; phone?: string; isDefault?: boolean };

export type Warehouse = {
	id: string;
	name: string;
	city?: string | null;
	address?: string | null;
	picName?: string | null;
	picPhone?: string | null;
	pics?: WarehousePic[];
};

/** A PIC as recorded on the order: who answers for this point. */
export type PointPic = { id?: string; name: string; phone: string };

/** The warehouse's default PIC (or its first), or null when it has none. */
export function defaultPicOf(w: Warehouse | undefined | null): PointPic | null {
	if (!w) return null;
	const d = w.pics?.find((p) => p.isDefault) ?? w.pics?.[0];
	if (d?.name) return { id: d.id, name: d.name, phone: d.phone ?? '' };
	if (w.picName) return { name: w.picName, phone: w.picPhone ?? '' };
	return null;
}

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
		loadingPics: [null],
		unloadingPics: [null],
		fleetDescription: '',
		truckOptions: [],
		agreementTruckTypes: [],
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
