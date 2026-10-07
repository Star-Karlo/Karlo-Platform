import { describe, it, expect } from 'vitest';
import {
	contractCustomerCards,
	extraCustomersOf,
	isMultiCustomerWithoutCustomers
} from './multiCustomerOrder';

/** A contract covering two customers, each with its own lane. */
const contract = {
	customerNama: 'Uji MAST ya',
	cargoTypeSpecific: 'General Cargo',
	namaBarang: 'Beras',
	loadingPoints: ['wh-umy-load'],
	unloadingPoints: ['wh-umy-drop'],
	multiCustomers: [
		{
			customerId: 'durio-id',
			customerName: 'PT Test Durio',
			cargoTypeId: 'General Cargo',
			cargoItemId: 'Baja',
			loadingPoints: ['wh-durio-load'],
			unloadingPoints: ['wh-durio-drop']
		}
	]
};

describe('contractCustomerCards', () => {
	it('gives the other customer a card when the order starts from the first', () => {
		const cards = contractCustomerCards(contract, 'Uji MAST ya');
		expect(cards.map((c) => c.customerName)).toEqual(['PT Test Durio']);
		expect(cards[0].loadingPoints).toEqual(['wh-durio-load']);
	});

	// The case the wizard got wrong: starting from the second customer added a
	// card for them (a duplicate) and none for the customer the contract names.
	it('gives the contract its own customer when the order starts from the other', () => {
		const cards = contractCustomerCards(contract, 'PT Test Durio');
		expect(cards.map((c) => c.customerName)).toEqual(['Uji MAST ya']);
		expect(cards[0].loadingPoints).toEqual(['wh-umy-load']);
	});

	it('never repeats the customer already on the card', () => {
		for (const start of ['Uji MAST ya', 'PT Test Durio']) {
			const names = contractCustomerCards(contract, start).map((c) => c.customerName);
			expect(names).not.toContain(start);
		}
	});

	it('is unmoved by casing and stray spaces in the name', () => {
		const cards = contractCustomerCards(contract, '  pt test durio ');
		expect(cards.map((c) => c.customerName)).toEqual(['Uji MAST ya']);
	});

	it('produces nothing for a contract that names no other customer', () => {
		expect(contractCustomerCards({ customerNama: 'Solo', multiCustomers: [] }, 'Solo')).toEqual([]);
		expect(contractCustomerCards({}, 'Solo')).toEqual([]);
	});

	it('drops nameless and duplicated entries rather than building blank cards', () => {
		const messy = {
			customerNama: 'A',
			multiCustomers: [{ customerName: '' }, { customerName: 'B' }, { customerName: 'B' }]
		};
		expect(extraCustomersOf(messy, 'A').map((c) => c.customerName)).toEqual(['B']);
	});
});

describe('isMultiCustomerWithoutCustomers', () => {
	it('spots a contract that claims several customers but names none', () => {
		expect(isMultiCustomerWithoutCustomers('multi-customer', { multiCustomers: [] })).toBe(true);
		expect(isMultiCustomerWithoutCustomers('multi-customer', {})).toBe(true);
	});

	it('says nothing about contracts that are not multi-customer', () => {
		expect(isMultiCustomerWithoutCustomers('single-shipment', {})).toBe(false);
		expect(isMultiCustomerWithoutCustomers('multi-customer', contract)).toBe(false);
	});
});
