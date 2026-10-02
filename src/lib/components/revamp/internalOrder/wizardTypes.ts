/** The Internal Order wizard's state, exactly the prototype's shape (InternalOrderFormView.vue). */
/** Numeric inputs are bound with `bind:value` on type=number, which yields a number (or null when blank). */
export type NumInput = string | number | null;

export type WizardItem = {
	/** Which shipment of this order the item belongs to, 1-based. A shipment is
	 *  one pair of points — loadingPoints[k] with unloadingPoints[k] is
	 *  Shipment k+1 — and its items are what its plan, weight and volume are
	 *  totalled from. An order with one shipment has 1 on every item. */
	shipmentNo: number;
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
	/** The two lists are read in step: index k of each is Shipment k+1, so they
	 *  are always the same length and points are added and removed as a pair.
	 *  Kept as arrays of warehouse ids because everything downstream reads
	 *  them that way. */
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
	/** "single-shipment", "multi-shipment" or "multi-customer", from the
	 *  agreement. It decides whether this order may carry more than one
	 *  shipment at all. */
	agreementType: string;
	/** True for a card the contract brought with it — one of the other
	 *  customers a multi-customer contract covers. Its customer and agreement
	 *  are fixed, because the contract is what decided them, and it is
	 *  rebuilt rather than edited when the agreement changes. */
	fromAgreementCustomer?: boolean;
	expanded: boolean;
	items: WizardItem[];
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

export function newItem(shipmentNo = 1): WizardItem {
	return { shipmentNo, itemName: '', quantity: '', weightKg: '', dimP: '', dimL: '', dimT: '', loadingDescription: '' };
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
		agreementType: '',
		fromAgreementCustomer: false,
		expanded: true,
		items: [newItem(1)],
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

/** How many shipments this order carries: one per pair of points. */
export function shipmentCount(sp: WizardShipment): number {
	return Math.max(sp.loadingPoints.length, sp.unloadingPoints.length, 1);
}

/** Whether the chosen agreement allows more than one shipment on an order.
 *  Before an agreement is chosen the answer is no, which is why the button to
 *  add one is disabled rather than hidden at that point. */
export function allowsManyShipments(sp: WizardShipment): boolean {
	return sp.agreementType === 'multi-shipment';
}

/** The items belonging to one shipment, in the order they were entered.
 *  An item written before items carried a shipment number belongs to the
 *  first, which is what such an order always had. */
export function itemsOfShipment(sp: WizardShipment, shipmentNo: number): WizardItem[] {
	return sp.items.filter((it) => (it.shipmentNo || 1) === shipmentNo);
}

/** One shipment's own weight, shown under its table. */
export function shipmentWeightKg(sp: WizardShipment, shipmentNo: number): number {
	const total = itemsOfShipment(sp, shipmentNo).reduce((s, it) => s + (Number(it.weightKg) || 0), 0);
	return Math.round(total * 100) / 100;
}

/** The order's tonnage: every item of every shipment. Never typed by hand. */
export function totalTonnageKg(sp: WizardShipment): number {
	const total = sp.items.reduce((s, it) => s + (Number(it.weightKg) || 0), 0);
	return Math.round(total * 100) / 100;
}
