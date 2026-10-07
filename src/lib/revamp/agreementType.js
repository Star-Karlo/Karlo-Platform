// @ts-nocheck — ported verbatim from Karlo-TMS-Revamp/src/utils; the console's own code types the call sites.
export const AGREEMENT_TYPE_OPTIONS = [
	{ value: 'single-shipment', label: 'Single Shipment' },
	{ value: 'multi-shipment', label: 'Multi Shipment' }
];

// A contract covering several customers at once, each with its own lanes and
// its own cargo. Offered only to a company that has turned the additional
// customers field on, because for everyone else an order belongs to exactly
// one customer and the choice would be a dead end.
export const MULTI_CUSTOMER_OPTION = { value: 'multi-customer', label: 'Multi Customer' };

export function agreementTypeOptions(multiCustomerEnabled) {
	return multiCustomerEnabled ? [...AGREEMENT_TYPE_OPTIONS, MULTI_CUSTOMER_OPTION] : AGREEMENT_TYPE_OPTIONS;
}

export function agreementTypeLabel(value) {
	return [...AGREEMENT_TYPE_OPTIONS, MULTI_CUSTOMER_OPTION].find((o) => o.value === value)?.label || '-';
}

// How one agreed price is divided between the customers a contract covers.
// Shared so the form that sets it and the document that states it cannot drift
// into describing the same contract differently.
export const BILLING_SPLIT_OPTIONS = [
	{ value: 'proportional', label: 'Proporsional (berdasarkan tonase)' },
	{ value: 'equal', label: 'Rata (dibagi sama rata)' }
];

export function billingSplitLabel(value) {
	return BILLING_SPLIT_OPTIONS.find((o) => o.value === value)?.label || '-';
}
