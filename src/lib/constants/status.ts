export const STATUS = {
	order: {
		draft: { code: 'draft', label: 'Draft', color: 'gray' },
		create: { code: 'create', label: 'Order Created', color: 'blue' },
		assignDriver: { code: 'assignDriver', label: 'Driver Selected', color: 'blue' },
		startToLoadingPoint: { code: 'startToLoadingPoint', label: 'Driver Accepts', color: 'indigo' },
		startLoading: { code: 'startLoading', label: 'Loading', color: 'indigo' },
		finishLoading: { code: 'finishLoading', label: 'Loaded', color: 'purple' },
		startToUnloadingPoint: { code: 'startToUnloadingPoint', label: 'In Transit', color: 'purple' },
		startUnloading: { code: 'startUnloading', label: 'Unloading', color: 'orange' },
		finishUnloading: { code: 'finishUnloading', label: 'Unloaded', color: 'orange' },
		done: { code: 'done', label: 'Completed', color: 'green' },
		cancel: { code: 'cancel', label: 'Cancelled', color: 'red' },
		expired: { code: 'expired', label: 'Expired', color: 'red' },
	},
	agreement: {
		SAGCREATE: { code: 'SAGCREATE', label: 'Created', color: 'blue' },
		SAGDONE: { code: 'SAGDONE', label: 'Active', color: 'green' },
		SAGEXPIRED: { code: 'SAGEXPIRED', label: 'Expired', color: 'red' },
		SAGCANCEL: { code: 'SAGCANCEL', label: 'Cancelled', color: 'red' },
	},
	invoice: {
		draft: { code: 'draft', label: 'Draft', color: 'gray' },
		final: { code: 'final', label: 'Final', color: 'blue' },
		paid: { code: 'paid', label: 'Paid', color: 'green' },
		cancel: { code: 'cancel', label: 'Cancelled', color: 'red' },
	},
	truck: {
		onDuty: { code: 'onDuty', label: 'On Duty', color: 'truck-blue' },
		idle: { code: 'idle', label: 'Available', color: 'truck-green' },
		waitingDepartureOrder: { code: 'waitingDepartureOrder', label: 'Planned', color: 'truck-yellow' },
		empty: { code: 'empty', label: 'Empty Order', color: 'truck-purple' },
		notAvailable: { code: 'notAvailable', label: 'Not Available', color: 'truck-red' },
		unpaired: { code: 'unpaired', label: 'Unpaired', color: 'gray' },
	}
};

export const ROLES = {
	superadmin: 'Super Admin',
	admin: 'Admin',
	shipper: 'Shipper',
	transporter: 'Transporter',
	driver: 'Driver',
	merchant: 'Merchant',
	warehousepic: 'Warehouse PIC',
	manager: 'Manager',
	investor: 'Investor'
};
