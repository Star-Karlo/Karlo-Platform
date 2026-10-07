/**
 * The customer cards an order gets from a multi-customer contract.
 *
 * A contract covering several clients carries one set of lanes per client.
 * An order made under it needs a card each: the first for the customer the
 * planner started from, and one for every other customer the contract names.
 *
 * This lives outside the wizard component so it can be tested. The bug it was
 * extracted for — a contract that produced no second card — could not be
 * reproduced by reading, because the only way to run the logic was to click
 * through the form against production data.
 */

export type ContractCustomer = {
	customerId?: string;
	customerName?: string;
	cargoTypeId?: string;
	cargoItemId?: string;
	loadingPoints?: string[];
	unloadingPoints?: string[];
};

/** The extra customers a contract names, ignoring the one already on the card. */
export function extraCustomersOf(detail: any, alreadyOnCard: string): ContractCustomer[] {
	const raw = Array.isArray(detail?.multiCustomers) ? (detail.multiCustomers as ContractCustomer[]) : [];
	const mine = (alreadyOnCard ?? '').trim().toLowerCase();
	const seen = new Set<string>();
	return raw.filter((c) => {
		const name = (c?.customerName ?? '').trim().toLowerCase();
		// A contract names its customers once each. The planner may have
		// started the order from any of them, so whichever is already on the
		// card is not repeated — without this, starting from the second
		// customer produced two cards for them and none for the first.
		if (!name || name === mine || seen.has(name)) return false;
		seen.add(name);
		return true;
	});
}

/**
 * The customer the contract itself names, when the planner started the order
 * from one of the OTHER customers it covers. Returns null when the card
 * already holds them, or when the contract does not name one.
 */
export function primaryCustomerOf(detail: any, alreadyOnCard: string): ContractCustomer | null {
	const name = (detail?.customerNama ?? '').trim();
	if (!name) return null;
	if (name.toLowerCase() === (alreadyOnCard ?? '').trim().toLowerCase()) return null;
	return {
		customerName: name,
		cargoTypeId: detail?.cargoTypeSpecific ?? '',
		cargoItemId: detail?.namaBarang ?? '',
		loadingPoints: Array.isArray(detail?.loadingPoints) ? detail.loadingPoints : [],
		unloadingPoints: Array.isArray(detail?.unloadingPoints) ? detail.unloadingPoints : []
	};
}

/**
 * Every customer card a contract should produce besides the one the planner
 * started from, in contract order: the contract's own customer first, then the
 * others it names.
 */
export function contractCustomerCards(detail: any, alreadyOnCard: string): ContractCustomer[] {
	const primary = primaryCustomerOf(detail, alreadyOnCard);
	return [...(primary ? [primary] : []), ...extraCustomersOf(detail, alreadyOnCard)];
}

/** True when a contract claims to cover several customers but names none. */
export function isMultiCustomerWithoutCustomers(agreementType: string, detail: any): boolean {
	if (agreementType !== 'multi-customer') return false;
	return !Array.isArray(detail?.multiCustomers) || detail.multiCustomers.length === 0;
}
