// @ts-nocheck
export const COA_TYPE_OPTIONS = [
	{ value: 'aset', label: 'Aset' },
	{ value: 'kewajiban', label: 'Kewajiban' },
	{ value: 'modal', label: 'Modal' },
	{ value: 'pendapatan', label: 'Pendapatan' },
	{ value: 'beban', label: 'Beban' }
];

export function coaTypeLabel(value) {
	return COA_TYPE_OPTIONS.find((o) => o.value === value)?.label || '-';
}
