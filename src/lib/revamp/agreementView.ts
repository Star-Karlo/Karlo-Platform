/**
 * Maps a business-service agreement row onto the shape the Vue prototype's
 * Agreement screens read (`agreements/{idAgreement}` docs): the prototype's
 * term fields live in `detail`, the AGR number is `agreementNumber`, and one
 * row per version replaces the prototype's `versionLog[v].snapshot`.
 */
export interface AgreementRouteEntry {
	kota: string;
	level: 'kota' | 'kecamatan';
	kecamatan: string;
}

export interface AgreementRow {
	id: string;
	idAgreement: string;
	rootAgreementId: string;
	supersedesAgreementId?: string;
	version: number;
	statusCode: string;
	/** A superseded version — the prototype's archived `versionLog` snapshot row. */
	isArchived: boolean;
	shipperCompanyId: string;
	shipperCompanyName: string;
	validFrom: string;
	validUntil: string;
	createdAt: string;
	createdByUserId: string;
	createdByEmail?: string;
	// Prototype term fields (from `detail`).
	customerNama: string;
	agreementType: string;
	initialRoutes: AgreementRouteEntry[];
	destinationRoutes: AgreementRouteEntry[];
	kotaAsal: string;
	kotaTujuan: string;
	tanggalMulai: string;
	tanggalBerakhir: string;
	durationType: string;
	durationValue: number | string;
	deskripsi: string;
	cargoTypeSpecific: string;
	namaBarang: string;
	truckTypeMatrix: string[];
	pricingType: string;
	tarif: number;
	tonaseMin: string;
	tonaseMax: string;
	paymentType: string;
	incomeTaxStatus: string;
	truckTypeOptional: string[];
	termsAndCondition: string;
	documentData: string;
	documentName: string;
	documentType: string;
	[key: string]: unknown;
}

function isoDate(v: unknown): string {
	return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : '';
}

export function toAgreementRow(a: any): AgreementRow {
	const d = (a?.detail && typeof a.detail === 'object' ? a.detail : {}) as Record<string, unknown>;
	const truckTypeOptional = Array.isArray(d.truckTypeOptional)
		? (d.truckTypeOptional as string[])
		: d.truckTypeOptional
			? [String(d.truckTypeOptional)]
			: [];
	return {
		...d,
		id: a.id,
		idAgreement: a.agreementNumber || '',
		rootAgreementId: a.rootAgreementId || a.id,
		supersedesAgreementId: a.supersedesAgreementId,
		version: Number(a.version) || 1,
		statusCode: a.statusCode || '',
		isArchived: a.statusCode === 'superseded',
		shipperCompanyId: a.shipperCompanyId || '',
		shipperCompanyName: a.shipperCompanyName || '',
		validFrom: a.validFrom || '',
		validUntil: a.validUntil || '',
		createdAt: a.createdAt || '',
		createdByUserId: a.createdByUserId || '',
		createdByEmail: a.createdByEmail,
		customerNama: String(d.customerNama || a.shipperCompanyName || ''),
		agreementType: String(d.agreementType || ''),
		initialRoutes: Array.isArray(d.initialRoutes) ? (d.initialRoutes as AgreementRouteEntry[]) : [],
		destinationRoutes: Array.isArray(d.destinationRoutes)
			? (d.destinationRoutes as AgreementRouteEntry[])
			: [],
		kotaAsal: String(d.kotaAsal || ''),
		kotaTujuan: String(d.kotaTujuan || ''),
		tanggalMulai: String(d.tanggalMulai || isoDate(a.validFrom)),
		tanggalBerakhir: String(d.tanggalBerakhir || isoDate(a.validUntil)),
		durationType: String(d.durationType || 'monthly'),
		durationValue: (d.durationValue as number | string) ?? '',
		deskripsi: String(d.deskripsi || ''),
		cargoTypeSpecific: String(d.cargoTypeSpecific || ''),
		namaBarang: String(d.namaBarang || ''),
		truckTypeMatrix: Array.isArray(d.truckTypeMatrix) ? (d.truckTypeMatrix as string[]) : [],
		pricingType: String(d.pricingType || ''),
		tarif: Number(d.tarif) || 0,
		tonaseMin: d.tonaseMin == null ? '' : String(d.tonaseMin),
		tonaseMax: d.tonaseMax == null ? '' : String(d.tonaseMax),
		paymentType: String(d.paymentType || a.paymentTypeId || ''),
		incomeTaxStatus: String(d.incomeTaxStatus || ''),
		truckTypeOptional,
		termsAndCondition: String(d.termsAndCondition || ''),
		documentData: String(d.documentData || ''),
		documentName: String(d.documentName || ''),
		documentType: String(d.documentType || '')
	};
}

/** Prototype `isExpired(a)`: `tanggalBerakhir < today` (string compare), plus the server's own `expired` status. */
export function isAgreementExpired(a: AgreementRow): boolean {
	if (a.statusCode === 'expired') return true;
	if (!a.tanggalBerakhir) return false;
	const today = new Date().toISOString().slice(0, 10);
	return a.tanggalBerakhir < today;
}
