/**
 * What the Finance pages (Jurnal, Laporan, Insight) derive the automatic
 * journal from: the company's Order Kontrak rows and agreements in the
 * prototype's shape, the Trip Allowance configuration, the chart of
 * accounts and the manual lines. One loader so the three pages agree.
 */
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';
import { kontrakStatus } from './kontrakStatus';
import { formatTimestampLabel } from './date.js';
import { ledger, type CoaAccount, type ManualEntry } from '$lib/stores/ledger';
import {
	loadTripAllowance,
	tripAllowanceDefaults,
	type TripAllowanceSettings
} from './tripAllowanceSettings';

/** An API order in the shape the prototype's utilities read. */
export function orderForFinance(raw: any) {
	const d = raw.detail || {};
	return {
		...d,
		id: raw.id,
		idOrder: raw.orderNumber || raw.id,
		shipperName: raw.shipperCompanyName || d.shipperName || '',
		status: kontrakStatus(raw),
		createdAt: raw.createdAt,
		tanggalPickup: d.tanggalPickup || (raw.pickupAt ? formatTimestampLabel(new Date(raw.pickupAt)) : ''),
		agreementId: d.agreementId || raw.agreementId || '',
		totalTonnage: d.totalTonnage ?? (raw.weightKg != null ? Number(raw.weightKg) : 0),
		detail: d
	};
}

/** An API agreement in the shape computeInvoiceTotal reads. */
export function agreementForFinance(raw: any) {
	const ad = raw.detail || {};
	return {
		idAgreement: raw.id,
		agreementNumber: raw.agreementNumber,
		tarif: Number(ad.tarif) || 0,
		pricingType: ad.pricingType || '',
		paymentType: ad.paymentType || raw.paymentTypeId || '',
		incomeTaxStatus: ad.incomeTaxStatus || '',
		tonaseMin: ad.tonaseMin ?? ''
	};
}

export interface FinanceData {
	orders: any[];
	agreements: any[];
	tripAllowance: TripAllowanceSettings;
	coa: CoaAccount[];
	manual: ManualEntry[];
	failed: string[];
}

export async function loadFinanceData(): Promise<FinanceData> {
	const [o, a, ta, coa, manual] = await Promise.allSettled([
		api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 500 }),
		api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 500 }),
		loadTripAllowance(),
		ledger.accounts(),
		ledger.entries()
	]);
	const failed: string[] = [];
	const out: FinanceData = {
		orders: [],
		agreements: [],
		tripAllowance: tripAllowanceDefaults(),
		coa: [],
		manual: [],
		failed
	};
	if (o.status === 'fulfilled') {
		out.orders = (o.value.data?.data ?? [])
			.filter((x: any) => x?.detail?.internalOrder === true)
			.map(orderForFinance);
	} else failed.push('order');
	if (a.status === 'fulfilled') out.agreements = (a.value.data?.data ?? []).map(agreementForFinance);
	else failed.push('agreement');
	if (ta.status === 'fulfilled') out.tripAllowance = ta.value.settings;
	if (coa.status === 'fulfilled') out.coa = coa.value;
	else failed.push('COA');
	if (manual.status === 'fulfilled') out.manual = manual.value;
	else failed.push('jurnal manual');
	return out;
}
