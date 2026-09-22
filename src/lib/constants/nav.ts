import {
	Lightbulb,
	MessageCircleQuestion,
	ClipboardList,
	FileText,
	Handshake,
	Users,
	Warehouse,
	BarChart3,
	Receipt,
	CheckCheck,
	Settings,
	SlidersHorizontal,
	Plug,
	Map,
	Truck,
	MonitorDot,
	FileCheck2,
	Database,
	Building2,
	Boxes,
	Camera,
	UserCog,
	PackagePlus,
	Network
} from 'lucide-svelte';

export interface NavItem {
	name: string;
	url?: string;
	icon?: any;
	children?: NavItem[];
	/** Draw the group separator above this item, per the sidebar spec. */
	dividerBefore?: boolean;
	/**
	 * Leaves the application — the FMS console, for instance. Opened in its own
	 * tab so it does not replace the console the person is working in.
	 */
	external?: boolean;
	/**
	 * The permission this screen needs. Absent means everyone signed in may
	 * see it.
	 *
	 * The sidebar hides what the caller cannot use. The server refuses it
	 * regardless — this is not the security boundary — but a menu that lists
	 * every screen and then 403s on half of them teaches people that errors
	 * are normal, which is how a real one gets ignored.
	 */
	permission?: string;
}

/**
 * Which permission each screen needs, matched by the tail of its URL.
 *
 * Kept as one table rather than a field repeated on 115 entries across four
 * consoles: the same screen appears in each, and annotating them separately is
 * how three of them end up agreeing and the fourth does not.
 */
const PERMISSION_BY_PATH: { match: RegExp; permission: string }[] = [
	{
		match: /\/(insight|dashboard|investor-dashboard|report-order|monitoring)$/,
		permission: 'dashboard.read'
	},
	{ match: /\/control-tower$/, permission: 'dispatch.read' },
	{ match: /\/planner|\/allocate$/, permission: 'dispatch.read' },
	{ match: /\/agreement/, permission: 'agreement.read' },
	{ match: /\/(order|spot-order|empty-order|order-kontrak|internal-order)/, permission: 'order.read' },
	{ match: /\/invoice|\/finance|\/jurnal|\/laporan|\/coa$/, permission: 'invoice.read' },
	// Fleet groups are the transporter's own fleet data, so they go with trucks.
	{ match: /\/(truck-list|fleet|vehicle-group)/, permission: 'truck.read' },
	{ match: /\/warehouse/, permission: 'warehouse.read' },
	{ match: /\/(customer-list|my-shipper|shipper-list|transporter-list|client)/, permission: 'customer.read' },
	{ match: /\/(users|roles|user-management|api-keys)$/, permission: 'collaboration.read' },
	{ match: /\/support$/, permission: 'notification.read' },
	// Everything else under Master Data: the catalogues.
	{
		match:
			/\/(cargo-type|item|item-category|item-sub-category|truck-head|truck-body|truck-class|brand|tracker|sensor-type|my-cargo|form-config)/,
		permission: 'masterData.read'
	}
];

/** The permission a URL implies, or undefined when the screen is ungated. */
export function permissionForUrl(url: string | undefined): string | undefined {
	if (!url || url.startsWith('http')) return undefined;
	return PERMISSION_BY_PATH.find((r) => r.match.test(url))?.permission;
}

/**
 * A nav tree with only the items this caller may use.
 *
 * A group whose children are all hidden is dropped too — an expandable
 * heading that opens onto nothing is worse than no heading.
 */
export function visibleNav(items: NavItem[], allowed: (permission: string) => boolean): NavItem[] {
	const out: NavItem[] = [];
	for (const item of items) {
		if (item.children?.length) {
			const children = visibleNav(item.children, allowed);
			if (children.length > 0) out.push({ ...item, children });
			continue;
		}
		const needed = item.permission ?? permissionForUrl(item.url);
		if (!needed || allowed(needed)) out.push(item);
	}
	return out;
}

/** A tile in the sticky action bar. */
export interface QuickAction {
	label: string;
	url: string;
	icon: any;
}

export const navItems: Record<string, NavItem[]> = {
	// The sidebar of the Karlo-TMS-Revamp prototype (src/components/layout/
	// Sidebar.vue), group for group, wired to the pages this console has.
	// Profile is the prototype's profile menu (Company, Child Account) plus
	// the settings a company needs to administer itself.
	admin: [
		{
			name: 'Insight',
			icon: Lightbulb,
			children: [{ name: 'Overview', url: '/a/dashboard' }]
		},
		{
			name: 'Planner',
			icon: MonitorDot,
			children: [
				{ name: 'Allocate', url: '/a/planner' },
				{ name: 'Control Tower', url: '/a/control-tower' }
			]
		},
		{
			name: 'Orders',
			icon: ClipboardList,
			children: [
				{ name: 'Spot Order', url: '/a/order/spot' },
				{ name: 'Order Kontrak', url: '/a/order/kontrak' },
				{ name: 'Empty Order', url: '/a/empty-order' }
			]
		},
		{
			name: 'Finance',
			icon: Receipt,
			children: [
				{ name: 'Invoice', url: '/a/finance/invoice' },
				{ name: 'Jurnal', url: '/a/finance/jurnal' },
				{ name: 'Laporan', url: '/a/finance/laporan' },
				{ name: 'COA', url: '/a/finance/coa' }
			]
		},
		{
			name: 'Master Data',
			icon: Database,
			children: [
				{ name: 'Customer List', url: '/a/customer-list' },
				{ name: 'MyWarehouse', url: '/a/my-shipper' },
				{ name: 'MyCargo', url: '/a/my-cargo' },
				{ name: 'MyAgreement', url: '/a/agreement' },
				{ name: 'MyTransporter', url: '/a/transporter-list' },
				// Karlo-maintained reference lists (review A.1): companies select
				// from them, only platform staff edit them, so only the admin
				// menu shows them.
				{ name: 'Truck Head', url: '/a/truck-head' },
				{ name: 'Truck Body', url: '/a/truck-body' },
				{ name: 'Truck Class', url: '/a/truck-class' },
				{ name: 'Brand', url: '/a/brand' },
				{ name: 'Trackers', url: '/a/trackers' },
				{ name: 'Tracker Model', url: '/a/tracker-model' },
				{ name: 'Sensor Type', url: '/a/sensor-type' }
			]
		},
		{
			name: 'My Fleet',
			icon: Truck,
			children: [
				{ name: 'Insight Truk', url: '/a/fleet/insight' },
				{ name: 'Data Armada', url: '/a/fleet/truck-list' },
				{ name: 'Grup Armada', url: '/a/vehicle-group' }
			]
		},
		{
			name: 'Trip Allowance',
			icon: Handshake,
			children: [
				{ name: 'Configuration', url: '/a/trip-allowance/configuration' },
				{ name: 'Driver Allowance', url: '/a/trip-allowance/driver-allowance' },
				{ name: 'Reconciliation', url: '/a/trip-allowance/reconciliation' }
			]
		},
		{
			name: 'Profile',
			icon: Settings,
			dividerBefore: true,
			children: [
				{ name: 'Company', url: '/a/profile/company' },
				{ name: 'Settings', url: '/a/settings' },
				{ name: 'Child Account', url: '/a/users' },
				{ name: 'Roles', url: '/a/roles' },
				{ name: 'API Keys', url: '/a/api-keys' },
				{ name: 'Form Configuration', url: '/a/form-config' }
			]
		},
		// Platform-staff only: the tenants and what each has bought (TMS and
		// FMS features). A company's own administrator hands out permissions
		// from inside those features on Roles.
		{
			name: 'Karlo',
			icon: Building2,
			dividerBefore: true,
			children: [
				{ name: 'Karlo Clients', url: '/a/clients', permission: 'collaboration.inviteMember' },
				{ name: 'Company Access', url: '/a/company-management', permission: 'collaboration.inviteMember' }
			]
		},
		{ name: 'FMS', url: 'https://fms.karlo.id', icon: Truck, external: true, dividerBefore: true }
	],
	shipper: [
		{ name: 'Dashboards', url: '/s/insight', icon: Lightbulb },
		{ name: 'Control Tower', url: '/s/control-tower', icon: MonitorDot },
		{
			name: 'Operations',
			icon: ClipboardList,
			children: [
				{ name: 'Agreements', url: '/s/agreement' },
				{ name: 'Orders', url: '/s/order' },
				{ name: 'Empty Orders', url: '/s/empty-order' },
				{ name: 'Share My Orders', url: '/s/share-orders' },
				{ name: 'Uang Sangu', url: '/s/uang-sangu' },
				{ name: 'Invoices', url: '/s/invoice' }
			]
		},
		{
			name: 'Master Data',
			icon: Database,
			children: [
				{
					name: 'Vehicles',
					children: [{ name: 'Truck List', url: '/s/fleet/truck-list' }]
				},
				// Cargo types and their items on one page; the category and
				// sub-category screens still exist at their old URLs but are no
				// longer part of the menu — three lists became one taxonomy.
				{ name: 'My Cargo', url: '/s/my-cargo' },
				{
					name: 'Trackers',
					children: [
						{ name: 'Trackers', url: '/s/trackers' },
						{ name: 'Tracker Model', url: '/s/tracker-model' },
						{ name: 'Sensor Type', url: '/s/sensor-type' }
					]
				},
				{ name: 'Warehouses', url: '/s/my-shipper' },
				// Own customers (consignees) and the 3PL vendors that carry for us.
				{ name: 'Customer List', url: '/s/customer-list' },
				{ name: 'Transporter List', url: '/s/transporter-list' }
			]
		},
		// The fleet console is a separate product on its own domain, so this
		// leaves the app rather than routing inside it.
		{ name: 'FMS', url: 'https://fms.karlo.id', icon: Truck, external: true, dividerBefore: true },
		{ name: 'Customer Help', url: '/s/support', icon: MessageCircleQuestion },
		{
			name: 'Settings',
			icon: Settings,
			children: [
				{ name: 'User Management', url: '/s/users' },
				{ name: 'API Key Management', url: '/s/api-keys' },
				{ name: 'Customers', url: '/s/customer-list' },
				{ name: 'Form Configuration', url: '/s/form-config' },
				{ name: 'General', url: '/s/settings' }
			]
		}
	],
	// The sidebar of the Karlo-TMS-Revamp prototype (src/components/layout/
	// Sidebar.vue), group for group, wired to the pages this console has.
	// Profile is the prototype's profile menu (Company, Child Account) plus
	// the settings a company needs to administer itself.
	transporter: [
		{
			name: 'Insight',
			icon: Lightbulb,
			children: [{ name: 'Overview', url: '/t/dashboard' }]
		},
		{
			name: 'Planner',
			icon: MonitorDot,
			children: [
				{ name: 'Allocate', url: '/t/planner' },
				{ name: 'Control Tower', url: '/t/control-tower' }
			]
		},
		{
			name: 'Orders',
			icon: ClipboardList,
			children: [
				{ name: 'Spot Order', url: '/t/order/spot' },
				{ name: 'Order Kontrak', url: '/t/order/kontrak' },
				{ name: 'Empty Order', url: '/t/empty-order' }
			]
		},
		{
			name: 'Finance',
			icon: Receipt,
			children: [
				{ name: 'Invoice', url: '/t/finance/invoice' },
				{ name: 'Jurnal', url: '/t/finance/jurnal' },
				{ name: 'Laporan', url: '/t/finance/laporan' },
				{ name: 'COA', url: '/t/finance/coa' }
			]
		},
		{
			name: 'Master Data',
			icon: Database,
			children: [
				{ name: 'Customer List', url: '/t/customer-list' },
				{ name: 'MyWarehouse', url: '/t/my-shipper' },
				{ name: 'MyCargo', url: '/t/my-cargo' },
				{ name: 'MyAgreement', url: '/t/agreement' },
				{ name: 'MyTransporter', url: '/t/transporter-list' }
			]
		},
		{
			name: 'My Fleet',
			icon: Truck,
			children: [
				{ name: 'Insight Truk', url: '/t/fleet/insight' },
				{ name: 'Data Armada', url: '/t/fleet/truck-list' },
				{ name: 'Grup Armada', url: '/t/vehicle-group' },
				{ name: 'Trackers', url: '/t/trackers' }
			]
		},
		{
			name: 'Trip Allowance',
			icon: Handshake,
			children: [
				{ name: 'Configuration', url: '/t/trip-allowance/configuration' },
				{ name: 'Driver Allowance', url: '/t/trip-allowance/driver-allowance' },
				{ name: 'Reconciliation', url: '/t/trip-allowance/reconciliation' }
			]
		},
		{
			name: 'Profile',
			icon: Settings,
			dividerBefore: true,
			children: [
				{ name: 'Company', url: '/t/profile/company' },
				{ name: 'Settings', url: '/t/settings' },
				{ name: 'Child Account', url: '/t/users' },
				{ name: 'Roles', url: '/t/roles' },
				{ name: 'API Keys', url: '/t/api-keys' },
				{ name: 'Form Configuration', url: '/t/form-config' }
			]
		},
		{ name: 'FMS', url: 'https://fms.karlo.id', icon: Truck, external: true, dividerBefore: true }
	],
	// The sidebar of the Karlo-TMS-Revamp prototype (src/components/layout/
	// Sidebar.vue), group for group, wired to the pages this console has.
	// Profile is the prototype's profile menu (Company, Child Account) plus
	// the settings a company needs to administer itself.
	manager: [
		{
			name: 'Insight',
			icon: Lightbulb,
			children: [{ name: 'Overview', url: '/m/dashboard' }]
		},
		{
			name: 'Planner',
			icon: MonitorDot,
			children: [
				{ name: 'Allocate', url: '/m/planner' },
				{ name: 'Control Tower', url: '/m/control-tower' }
			]
		},
		{
			name: 'Orders',
			icon: ClipboardList,
			children: [
				{ name: 'Spot Order', url: '/m/order/spot' },
				{ name: 'Order Kontrak', url: '/m/order/kontrak' },
				{ name: 'Empty Order', url: '/m/empty-order' }
			]
		},
		{
			name: 'Finance',
			icon: Receipt,
			children: [
				{ name: 'Invoice', url: '/m/finance/invoice' },
				{ name: 'Jurnal', url: '/m/finance/jurnal' },
				{ name: 'Laporan', url: '/m/finance/laporan' },
				{ name: 'COA', url: '/m/finance/coa' }
			]
		},
		{
			name: 'Master Data',
			icon: Database,
			children: [
				{ name: 'Customer List', url: '/m/customer-list' },
				{ name: 'MyWarehouse', url: '/m/my-shipper' },
				{ name: 'MyCargo', url: '/m/my-cargo' },
				{ name: 'MyAgreement', url: '/m/agreement' },
				{ name: 'MyTransporter', url: '/m/transporter-list' }
			]
		},
		{
			name: 'My Fleet',
			icon: Truck,
			children: [
				{ name: 'Insight Truk', url: '/m/fleet/insight' },
				{ name: 'Data Armada', url: '/m/fleet/truck-list' }
			]
		},
		{
			name: 'Trip Allowance',
			icon: Handshake,
			children: [
				{ name: 'Configuration', url: '/m/trip-allowance/configuration' },
				{ name: 'Driver Allowance', url: '/m/trip-allowance/driver-allowance' },
				{ name: 'Reconciliation', url: '/m/trip-allowance/reconciliation' }
			]
		},
		{
			name: 'Profile',
			icon: Settings,
			dividerBefore: true,
			children: [
				{ name: 'Company', url: '/m/profile/company' },
				{ name: 'Settings', url: '/m/settings' },
				{ name: 'Child Account', url: '/m/users' },
				{ name: 'Roles', url: '/m/roles' },
				{ name: 'API Keys', url: '/m/api-keys' },
				{ name: 'Form Configuration', url: '/m/form-config' }
			]
		},
		{ name: 'FMS', url: 'https://fms.karlo.id', icon: Truck, external: true, dividerBefore: true }
	],
	warehousepic: [{ name: 'Order', url: '/w/order', icon: ClipboardList }],
	investor: [{ name: 'Dashboard', url: '/i/dashboard', icon: BarChart3 }]
};

/**
 * The sticky action bar's tiles, per role.
 *
 * The spec puts Create Order and Create Agreement on every shipper page; the
 * other roles get the equivalent thing they are expected to start.
 */
export const quickActions: Record<string, QuickAction[]> = {
	// Karlo staff maintain the shared reference lists; cargo type is the one
	// they add to most. It pointed at /a/item-type, a route that no longer
	// exists — a dead tile at the top of every admin page.
	// Staff act FOR clients: the two things they most often record on a
	// client's behalf, plus the reference list they maintain.
	admin: [
		{ label: 'Internal Order', url: '/a/internal-order', icon: PackagePlus },
		{ label: 'Create Agreement', url: '/a/agreement/create', icon: Handshake },
		{ label: 'Cargo Type', url: '/a/cargo-type', icon: Database }
	],
	shipper: [
		{ label: 'Create Order', url: '/s/order/create', icon: PackagePlus },
		{ label: 'Create Agreement', url: '/s/agreement/create', icon: Handshake }
	],
	transporter: [
		{ label: 'Internal Order', url: '/t/internal-order', icon: PackagePlus },
		{ label: 'Create Agreement', url: '/t/agreement/create', icon: Handshake }
	],
	manager: [
		{ label: 'Internal Order', url: '/m/internal-order', icon: PackagePlus },
		{ label: 'Create Agreement', url: '/m/agreement/create', icon: Handshake }
	],
	warehousepic: [],
	investor: []
};

/**
 * Roles the identity service issues, mapped onto the six navigation sets.
 *
 * The service spells the warehouse role `warehousePic` and calls the read-only
 * account `merchant`; both spellings appear in existing data, so normalise here
 * rather than at each call site.
 */
const ROLE_ALIASES: Record<string, string> = {
	superadmin: 'admin',
	admin: 'admin',
	shipper: 'shipper',
	transporter: 'transporter',
	manager: 'manager',
	driver: 'warehousepic',
	warehousepic: 'warehousepic',
	merchant: 'investor',
	investor: 'investor'
};

export function navKey(role: string): string {
	return ROLE_ALIASES[(role ?? '').toLowerCase()] ?? '';
}

/**
 * Which console a signed-in user gets.
 *
 * Prefers the COMPANY's role over the user's, and the distinction matters more
 * than it looks. Since roles became dynamic, `user.role` is the company's own
 * NAME for it — "Administrator", "Sales", anything they typed — while
 * `companyRole` stays a fixed platform vocabulary: shipper or transporter.
 *
 * Keying navigation off the name is what broke the app: every account created
 * under the new IAM resolved to no navigation, so the landing redirect fell
 * through to /auth and the shell sat on its loading spinner forever.
 *
 * The user role is still consulted as a fallback, because legacy accounts
 * imported from the monolith carry the old fixed codes there and nothing else.
 * Platform staff get the admin console regardless: they administer across
 * tenants, so their own company's side of the market says nothing useful.
 */
export function consoleKeyFor(
	identity: {
		role?: string;
		companyRole?: string;
		isPlatformStaff?: boolean;
	},
	/**
	 * The side of the market a Karlo staff member is currently acting for.
	 *
	 * A shipper and a transporter are not the same console — a shipper places
	 * orders and a transporter carries them — so staff working on a client's
	 * behalf must see the client's console, not their own. Without this, an
	 * admin acting for a shipper would be looking at a planner and a fleet the
	 * client does not have.
	 */
	actingForRole?: string
): string {
	if (actingForRole) {
		const key = navKey(actingForRole);
		if (key) return key;
	}
	if (identity?.isPlatformStaff) return 'admin';
	return navKey(identity?.companyRole ?? '') || navKey(identity?.role ?? '');
}

export function navFor(role: string): NavItem[] {
	return navItems[navKey(role)] ?? [];
}

export function quickActionsFor(role: string): QuickAction[] {
	return quickActions[navKey(role)] ?? [];
}

/** Where each role lands after signing in — the first item of its navigation. */
export function homeFor(role: string): string {
	return firstInternalUrl(navItems[navKey(role)] ?? []) ?? '/auth';
}

/**
 * The first place the navigation can take someone, in menu order: a top-level
 * link, or the first child of the first group. External links (FMS) never
 * count — landing a fresh login on another product's domain is not a home,
 * and `goto` refuses the URL anyway, which left the sign-in stuck on
 * "Memuat…" when the sidebar's only top-level link was the FMS one.
 */
function firstInternalUrl(items: NavItem[]): string | undefined {
	for (const item of items) {
		if (item.url && !item.external) return item.url;
		const child = item.children?.find((c) => c.url && !c.external);
		if (child?.url) return child.url;
	}
	return undefined;
}

/**
 * Where an identity lands after signing in.
 *
 * Falls back to the shipper console rather than to /auth when nothing matches.
 * Returning /auth from here is what produced the redirect loop: the user is
 * authenticated, so the auth page sends them back, and the shell shows its
 * loading state in between — forever. A console that is wrong is visible and
 * reportable; a loop is neither.
 */
export function homeForIdentity(identity: {
	role?: string;
	companyRole?: string;
	isPlatformStaff?: boolean;
}): string {
	const key = consoleKeyFor(identity) || 'shipper';
	return firstInternalUrl(navItems[key] ?? []) ?? '/s/insight';
}

/** URL prefix owned by a role, used to build links inside shared page components. */
export const ROLE_PREFIX: Record<string, string> = {
	admin: '/a',
	shipper: '/s',
	transporter: '/t',
	manager: '/m',
	warehousepic: '/w',
	investor: '/i'
};
