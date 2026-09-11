export interface ProductAccess {
	role: string;
	/**
	 * Flat keys such as "order.read". Empty on a company root account, which
	 * means unrestricted within `features` — not "no access".
	 */
	permissions: string[];
	/** What the company bought. The real ceiling on what to render. */
	features: string[];
}

export interface User {
	id: string;
	email?: string;
	username?: string;
	fullName?: string;
	phone?: string;
	companyId?: string;
	language?: string;
	/** Karlo staff. Bypasses entitlement, and has no company. */
	isPlatformStaff?: boolean;
	/** Convenience copy of access.tms.role. */
	role: string;
	permissions?: string[];
	products?: string[];
	access?: Record<string, ProductAccess>;
	createdAt?: string;
	updatedAt?: string;
}

export interface UserSetting {
	isCancelWithValidate?: boolean;
	isFinishWithGeofencing?: boolean;
	activeAgreementVerifiedOnly?: boolean;
	orderUnloadingVerifyPic?: boolean;
	ppnPercentage?: number;
	pph23Percentage?: number;
}

export interface Order {
	id: string;
	orderNumber?: string;
	orderKind?: string;
	agreementId?: string;
	/**
	 * The agreement LINEAGE. agreementId pins the exact VERSION this order was
	 * priced against; this survives amendments, so "every order under this
	 * contract" stays answerable after a renewal.
	 */
	agreementRootId?: string;
	shipperCompanyId?: string;
	transporterCompanyId?: string;
	createdByUserId?: string;
	/** Set once a planner has assigned the work. */
	driverUserId?: string;
	/**
	 * When the order must be actioned by. Distinct from pickupAt: pickup is
	 * when the truck is due, expiry is when the planner has run out of time to
	 * find one.
	 */
	expiresAt?: string;
	truckId?: string;
	statusCode?: string;
	/** Localised status. Use statusAlias for display; this one is Indonesian. */
	status?: string;
	statusAlias?: string;
	originWarehouseId?: string;
	destinationWarehouseId?: string;
	/** Resolved from master data by the business service, so a list needs no second call. */
	originWarehouseName?: string;
	destinationWarehouseName?: string;
	/** Set once a truck is assigned; empty before that. */
	truckPoliceNumber?: string;
	/** Numeric fields arrive as strings — they are DECIMAL columns. Wrap in Number(). */
	quantity?: string | number;
	weightKg?: string | number;
	price?: string | number;
	pickupAt?: string;
	deliveryAt?: string;
	detail?: Record<string, any>;
	createdAt?: string;
	updatedAt?: string;
}

/** One row of /orders/:id/history. The order record carries no history field. */
export interface OrderStatusChange {
	id: number;
	orderId: string;
	toStatusCode: string;
	changedByUserId?: string;
	source?: string;
	createdAt?: string;
}

export interface Shipment {
	_id?: string;
	warehouseFrom?: string | Warehouse;
	warehouseTo?: string | Warehouse;
	warehousepicSender?: string;
	warehousepicReceiver?: string;
	items?: ShipmentItem[];
	weight?: number;
	volume?: number;
	amount?: number;
	fotoPodLoading?: string[];
	fotoPodUnloading?: string[];
	fotoCargo?: string[];
}

export interface ShipmentItem {
	shipmentId?: string;
	itemDetail?: any;
	productCode?: string;
	checkLoading?: boolean;
	checkUnloading?: boolean;
}

export interface StatusHistory {
	statusCode: string;
	status: string;
	statusAlias?: string;
	message?: string;
	user?: string;
	createdAt?: string;
}

export interface OrderInvoice {
	transportPrice?: number;
	handlingFee?: number;
	additionalPrice?: { name: string; price: number }[];
	totalPrice?: number;
	invoiceNumber?: string;
	statusCode?: string;
}

export interface OrderSales {
	transportPrice?: number;
	handlingFee?: number;
	additionalPrice?: { name: string; price: number }[];
	totalPrice?: number;
}

export interface Agreement {
	id: string;
	agreementNumber?: string;
	shipperCompanyId?: string;
	transporterCompanyId?: string;
	/**
	 * Resolved by the business service, once per distinct id per page. Empty
	 * means master data was unreachable — render it blank, do not join per row.
	 */
	shipperCompanyName?: string;
	transporterCompanyName?: string;
	createdByUserId?: string;
	/** Set once a planner has assigned the work. */
	driverUserId?: string;
	/**
	 * When the order must be actioned by. Distinct from pickupAt: pickup is
	 * when the truck is due, expiry is when the planner has run out of time to
	 * find one.
	 */
	expiresAt?: string;
	truckId?: string;
	statusCode?: string;
	status?: string;
	statusAlias?: string;
	validFrom?: string;
	validUntil?: string;
	/** The shipper's explicit sign-off, separate from approval. */
	verified?: boolean;
	verifiedByUserId?: string;
	verifiedAt?: string;
	detail?: Record<string, any>;
	createdAt?: string;
	updatedAt?: string;
}

export interface Truck {
	id: string;
	companyId?: string;
	policeNumber?: string;
	year?: number;
	/** Catalogue ids. Join against /catalog to render names. */
	truckTypeId?: string;
	truckBodyId?: string;
	brandId?: string;
	/** Authentication-service user ids. Master data does not resolve them to names. */
	driverIds?: string[];
	status?: 'active' | 'maintenance' | 'inactive';
	isAvailable?: boolean;
	/** Reverse of Tracker.vehicleId. */
	trackerId?: string;
	deleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface TruckType {
	id: string;
	/** The monolith's id field. Present only on records not yet migrated. */
	_id?: string;
	name?: string;
	weightMin?: number;
	weightMax?: number;
}

export interface TruckLocation {
	latitude?: number;
	longitude?: number;
	speed?: number;
	updatedAt?: string;
}

export interface Warehouse {
	id: string;
	companyId?: string;
	name?: string;
	address?: string;
	/**
	 * Geography as NAMES, which is what master data now stores — there is no
	 * region table, so an id here would reference nothing. `cityId` remains for
	 * records imported before that change.
	 */
	city?: string;
	district?: string;
	province?: string;
	cityId?: string;
	/** GeoJSON Point — coordinates are [longitude, latitude]. */
	location?: { type: 'Point'; coordinates: [number, number] };
	/** Metres. Used to decide when a truck counts as arrived. */
	geofenceRadius?: number;
	picName?: string;
	picPhone?: string;
	deleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface Invoice {
	id: string;
	invoiceNumber?: string;
	shipperCompanyId?: string;
	transporterCompanyId?: string;
	/** Resolved server-side, as on Agreement. */
	shipperCompanyName?: string;
	transporterCompanyName?: string;
	statusCode?: string;
	status?: string;
	statusAlias?: string;
	/** DECIMAL columns, delivered as strings. */
	subtotal?: string | number;
	ppnPercentage?: string | number;
	ppnAmount?: string | number;
	pph23Percentage?: string | number;
	pph23Amount?: string | number;
	adjustment?: string | number;
	/** Lower than subtotal: PPh23 is withheld at source rather than added. */
	total?: string | number;
	issuedAt?: string;
	dueAt?: string;
	notes?: string;
	detail?: Record<string, any>;
	createdAt?: string;
	updatedAt?: string;
}

/**
 * A telematics device.
 *
 * Identity and the vehicle link only — no position. `vehicleId` points at a
 * Truck.id, and a device can be moved between vehicles over time, so any
 * historical lookup must be resolved as-at a timestamp.
 */
export interface Tracker {
	id: string;
	imei: string;
	companyId?: string;
	vehicleId?: string;
	provider?: string;
	simNumber?: string;
	status?: string;
	lastSeenAt?: string;
	deleted?: boolean;
}

/**
 * A shipper's end-recipient. Not a platform user — customers never sign in.
 */
export interface Customer {
	id: string;
	companyId?: string;
	name?: string;
	code?: string;
	npwp?: string;
	address?: string;
	contactName?: string;
	contactPhone?: string;
	contactEmail?: string;
	deleted?: boolean;
	createdAt?: string;
	updatedAt?: string;
}

export interface Notification {
	id: string;
	/** The monolith's id field. Present only on records not yet migrated. */
	_id?: string;
	title: string;
	description: string;
	type: string;
	typeId?: string;
	read: boolean;
	createdAt?: string;
}

export interface Kota {
	id: number;
	name: string;
	provinsi?: number;
	location?: number[];
}

export interface PaginatedResponse<T> {
	data: T[];
	meta: {
		page: number;
		limit: number;
		totalRows: number;
		totalPages: number;
	};
}

export interface ApiResponse<T> {
	data: T;
	message?: string;
}
