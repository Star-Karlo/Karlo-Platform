/**
 * Every backend path the application uses, in one place.
 *
 * This file exists because the frontend was originally written against the
 * monolith, whose API differed from the microservices in three ways that had to
 * be corrected everywhere at once:
 *
 *   - Base path       /api            ->  /api/v1
 *   - Resource names  /order          ->  /orders     (singular to plural)
 *   - Actions         /order/:id/cancel-order  ->  PUT /orders/:id/status
 *
 * Keeping the paths here rather than inline in the stores means the next such
 * change is one file, not twenty call sites.
 *
 * There is deliberately no service hostname anywhere. In production the load
 * balancer routes by path to the right service; in development the Vite proxy
 * in vite.config.ts does the same thing. The application only ever needs one
 * base URL.
 */

export const ENDPOINTS = {
	auth: {
		login: '/auth/login',
		logout: '/auth/logout',
		refresh: '/auth/refresh',
		me: '/auth/me',
		changePassword: '/auth/change-password'
	},

	/** Karlo staff only: every company on the platform, whether or not anybody
	 *  has an account with it. Derived listings from /users could only show
	 *  companies that had a member, so unclaimed placeholders were invisible. */
	adminCompanies: '/admin/companies',

	/** Karlo staff: what a company may be sold, and what it currently holds. */
	entitlements: {
		catalogue: '/admin/features',
		forCompany: (id: string) => `/admin/companies/${id}/entitlements`,
		history: (id: string) => `/admin/companies/${id}/entitlements/history`,
		revoke: (id: string, product: string, module: string) =>
			`/admin/companies/${id}/entitlements/${product}/${module}`
	},

	/**
	 * A company's own roles.
	 *
	 * Roles are the COMPANY's, not the platform's: each defines its own — Sales,
	 * Planner, Finance — and the keys it may grant are the catalogue narrowed to
	 * the features Karlo has sold it.
	 */
	roles: {
		list: '/roles',
		create: '/roles',
		one: (id: string) => `/roles/${id}`
	},

	users: {
		list: '/users',
		one: (id: string) => `/users/${id}`,
		updateMe: '/users/me',
		permission: (id: string) => `/users/${id}/permission`,
		/** Move a colleague to another role. Validated against their company. */
		role: (id: string) => `/users/${id}/role`,
		suspend: (id: string) => `/users/${id}/suspend`,
		registerMember: '/auth/register-member'
	},

	orders: {
		list: '/orders',
		one: (id: string) => `/orders/${id}`,
		create: '/orders',
		update: (id: string) => `/orders/${id}`,
		/** Every status change goes through one endpoint; the body names the target. */
		status: (id: string) => `/orders/${id}/status`,
		assign: (id: string) => `/orders/${id}/assign`,
		history: (id: string) => `/orders/${id}/history`,
		/** Which transitions this caller may make right now, for rendering buttons. */
		transitions: (id: string) => `/orders/${id}/transitions`,
		shipment: (id: string) => `/orders/${id}/shipment`,
		summary: '/orders/summary',

		/** Trucks the planner could assign, nearest to the loading point first. */
		candidates: (id: string) => `/orders/${id}/candidates`,
		/** The order's planned legs: the haul, and the assigned truck's approach. */
		routes: (id: string) => `/orders/${id}/routes`,
		/** Re-plan a leg. 402 when the company has not bought advanced routing. */
		reroute: (id: string) => `/orders/${id}/reroute`,

		/** Uang sangu. Separate permissions from the order itself. */
		allowance: (id: string) => `/orders/${id}/allowance`,
		allowanceFinalise: (id: string) => `/orders/${id}/allowance/finalise`,
		allowanceHistory: (id: string) => `/orders/${id}/allowance/history`
	},

	shipments: {
		status: (id: string) => `/shipments/${id}/status`,
		transitions: (id: string) => `/shipments/${id}/transitions`,
		documents: (id: string) => `/shipments/${id}/documents`,

		/**
		 * The unloading handover. The driver sends the receiving PIC's WhatsApp
		 * number, the PIC receives a code, the driver types it back.
		 *
		 * The issue response never carries the code. Returning it to the driver
		 * who asked would let them complete the handover with no PIC involved,
		 * which is the one thing the mechanism exists to prevent.
		 */
		handover: (id: string) => `/shipments/${id}/handover`,
		handoverVerify: (id: string) => `/shipments/${id}/handover/verify`
	},

	/**
	 * Per-company form configuration.
	 *
	 * The flow is the same for everyone; what each company's agreement and
	 * order forms demand is not. This endpoint returns the effective field list
	 * — the declared catalogue with the company's overrides folded in — and it
	 * is the SAME answer the create endpoints validate against, so a form built
	 * from it cannot produce a submission the server refuses.
	 */
	config: {
		fields: (entity: 'agreement' | 'order') => `/config/fields/${entity}`
	},

	agreements: {
		list: '/agreements',
		one: (id: string) => `/agreements/${id}`,
		create: '/agreements',
		/** Approve or reject, as { approve: boolean }. */
		decision: (id: string) => `/agreements/${id}/decision`,
		verify: (id: string) => `/agreements/${id}/verify`,

		/**
		 * Versioning and approval.
		 *
		 * An agreement is a priced contract, so an amendment creates a new
		 * VERSION rather than editing the row — otherwise a price change
		 * silently restates work already completed. A renewal takes effect at
		 * once; an update waits on a Sales Manager.
		 */
		revise: (id: string) => `/agreements/${id}/revisions`,
		reviseDecision: (id: string) => `/agreements/${id}/revisions/decision`,
		/** Every version of one contract. `id` is any version's id. */
		versions: (id: string) => `/agreements/${id}/versions`,
		priceHistory: (id: string) => `/agreements/${id}/price-history`,
		pendingApproval: '/agreements/pending-approval'
	},

	invoices: {
		list: '/invoices',
		one: (id: string) => `/invoices/${id}`,
		create: '/invoices',
		/** Replaces the monolith's /invoice-<action>/:id family. */
		status: (id: string) => `/invoices/${id}/status`
	},

	trucks: {
		list: '/trucks',
		one: (id: string) => `/trucks/${id}`,
		create: '/trucks',
		update: (id: string) => `/trucks/${id}`,
		remove: (id: string) => `/trucks/${id}`,
		drivers: (id: string) => `/trucks/${id}/drivers`
	},

	warehouses: {
		list: '/warehouses',
		one: (id: string) => `/warehouses/${id}`,
		create: '/warehouses',
		update: (id: string) => `/warehouses/${id}`,
		/** Soft: orders naming this site keep resolving, and the name frees up. */
		remove: (id: string) => `/warehouses/${id}`
	},

	/** Reference data. `kind` is one of the catalogue kinds, e.g. 'truckType'. */
	catalog: {
		kinds: '/catalog',
		list: (kind: string) => `/catalog/${kind}`,
		create: (kind: string) => `/catalog/${kind}`,
		/** PUT to edit, DELETE to retire. Deletion is soft: the name frees up
		 *  for reuse while documents already referencing it keep resolving. */
		one: (kind: string, id: string) => `/catalog/${kind}/${id}`
	},

	/**
	 * File uploads.
	 *
	 * The browser never holds AWS credentials. It asks the service to sign a
	 * short-lived PUT, uploads straight to S3, and stores only the returned key
	 * — a signed URL expires, so persisting one would rot.
	 *
	 * Uploaded objects live under a private prefix; reading one back needs a
	 * signed GET, unlike the public UI artwork under assets/.
	 */
	uploads: {
		presign: '/uploads/presign',
		downloadUrl: '/uploads/download-url'
	},

	/**
	 * A transporter's clients.
	 *
	 * These are COMPANIES in the authentication service, not master data rows.
	 * A client may hold no user account at all and still be a company — that is
	 * the placeholder a transporter creates so it can order on the client's
	 * behalf, and which the client later claims. Deduplication is on the
	 * NORMALISED NPWP and NIB, so the same business created twice by two
	 * transporters resolves to one company they both link to.
	 */
	shippers: {
		list: '/shippers',
		create: '/shippers',
		claimLink: (id: string) => `/shippers/${id}/claim-link`
	},

	/**
	 * A shipper's own end-recipients. Not platform users — they never sign in.
	 *
	 * Served by master data as an ordinary catalogue kind, NOT as a top-level
	 * /customers resource. These paths used to say `/customers`, which the
	 * service has never routed — every call 404'd, so the Klien column, the
	 * order form's customer picker and the Control Tower all silently showed
	 * nothing.
	 *
	 * PUT applies only the fields sent, so a form editing one value will not
	 * blank the rest, and DELETE is soft because orders reference customers
	 * by id.
	 */
	customers: {
		list: '/catalog/customer',
		one: (id: string) => `/catalog/customer/${id}`,
		create: '/catalog/customer',
		update: (id: string) => `/catalog/customer/${id}`,
		remove: (id: string) => `/catalog/customer/${id}`
	},

	/**
	 * Telematics device registry. Identity and the device-to-vehicle link only —
	 * there is no position on a tracker. Positions will come from the telemetry
	 * service, which is not built yet.
	 */
	trackers: {
		list: '/trackers',
		one: (id: string) => `/trackers/${id}`,
		/**
		 * Resolve which vehicle a device was fitted to.
		 *
		 * ALWAYS pass `at` (RFC3339) when resolving anything historical. Devices
		 * move between vehicles, so resolving an old trail against the current
		 * vehicle silently credits every kilometre an earlier truck drove to
		 * whichever truck holds the device today.
		 */
		vehicleByImei: (imei: string, at?: string) =>
			`/trackers/by-imei/${encodeURIComponent(imei)}/vehicle${at ? `?at=${encodeURIComponent(at)}` : ''}`
	},

	notifications: {
		list: '/notifications',
		unread: '/notifications/unread',
		read: '/notifications/read'
	}
} as const;

/**
 * Order status codes, mirroring the business service's state machine.
 *
 * The monolith accepted a free-text status; the business service accepts only a
 * transition its machine declares legal, and refuses anything else with 409.
 * Using these constants means a typo fails at compile time rather than as a
 * rejected request.
 */
export const ORDER_STATUS = {
	DRAFT: 'draft',
	SUBMITTED: 'submitted',
	APPROVED: 'approved',
	READY_TO_PLAN: 'readyToPlan',
	ASSIGNED: 'assigned',
	IN_TRANSIT: 'inTransit',
	DELIVERED: 'delivered',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled',
	CANCEL_REQUESTED: 'cancelRequested',
	REJECTED: 'rejected'
} as const;

export const AGREEMENT_STATUS = {
	DRAFT: 'draft',
	SUBMITTED: 'submitted',
	ACTIVE: 'active',
	REJECTED: 'rejected',
	EXPIRED: 'expired',
	CANCELLED: 'cancelled'
} as const;

export const TRUCK_STATUS = {
	ACTIVE: 'active',
	MAINTENANCE: 'maintenance',
	INACTIVE: 'inactive'
} as const;

export const INVOICE_STATUS = {
	DRAFT: 'draft',
	ISSUED: 'issued',
	SUBMITTED: 'submitted',
	VERIFIED: 'verified',
	PAID: 'paid',
	CANCELLED: 'cancelled'
} as const;

export const SHIPMENT_STATUS = {
	ASSIGNED: 'assigned',
	TO_LOADING: 'toLoading',
	AT_LOADING: 'atLoading',
	LOADING_APPROVED: 'loadingApproved',
	LOADING: 'loading',
	LOADED: 'loaded',
	TO_UNLOADING: 'toUnloading',
	AT_UNLOADING: 'atUnloading',
	UNLOADING_APPROVED: 'unloadingApproved',
	UNLOADING: 'unloading',
	UNLOADED: 'unloaded',
	FINISHED: 'finished',
	CANCELLED: 'cancelled'
} as const;
