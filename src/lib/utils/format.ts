export function formatNumber(value: number | undefined | null): string {
	if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
	return new Intl.NumberFormat('id-ID').format(Number(value));
}

export function formatCurrency(value: number | undefined | null, currency = 'IDR'): string {
	if (value === undefined || value === null || Number.isNaN(Number(value))) return '-';
	return new Intl.NumberFormat('id-ID', {
		style: 'currency',
		currency,
		maximumFractionDigits: 0
	}).format(Number(value));
}

export function formatDate(
	date: string | Date | undefined,
	format: 'short' | 'long' | 'datetime' = 'short'
): string {
	if (!date) return '-';
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return '-';
	const opts: Intl.DateTimeFormatOptions =
		format === 'long'
			? { day: 'numeric', month: 'long', year: 'numeric' }
			: format === 'datetime'
				? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
				: { day: '2-digit', month: '2-digit', year: 'numeric' };
	return d.toLocaleDateString('id-ID', opts);
}

export function formatDateRange(from?: string | Date, to?: string | Date): string {
	if (!from && !to) return '-';
	return `${formatDate(from)} – ${formatDate(to)}`;
}

export function formatDistance(km: number | undefined): string {
	if (!km && km !== 0) return '-';
	return `${km.toFixed(1)} km`;
}

export function truncate(str: string, length = 50): string {
	if (!str) return '';
	return str.length > length ? str.slice(0, length) + '…' : str;
}

/**
 * The badge class for a status, in the ported design system's vocabulary.
 *
 * Outlined pills rather than tinted blocks — badge-active, badge-wait,
 * badge-fail — which is what the console uses and what keeps a status legible
 * against the striped table rows behind it.
 */
export function statusTone(statusCode: string): string {
	const code = (statusCode ?? '').toLowerCase();

	if (!code) return 'badge';
	if (['done', 'completed', 'paid', 'delivered', 'active', 'verified', 'finished'].some((s) => code.includes(s)))
		return 'badge badge-active';
	if (['cancel', 'expired', 'reject', 'failed', 'suspend'].some((s) => code.includes(s)))
		return 'badge badge-fail';
	if (['draft', 'pending', 'submitted', 'negosiasi', 'menunggu'].some((s) => code.includes(s)))
		return 'badge badge-wait';
	if (['loading', 'unloading', 'transit', 'assigned', 'planned', 'penugasan'].some((s) => code.includes(s)))
		return 'badge badge-planner';
	return 'badge badge-self';
}

/** Hex colour for a truck marker on the planner map, from the token palette. */
export function truckMarkerColor(statusCode: string): string {
	const map: Record<string, string> = {
		onDuty: '#0B57D0',
		active: '#146C2E',
		idle: '#146C2E',
		waitingDepartureOrder: '#FFC107',
		maintenance: '#FFC107',
		empty: '#6F42C1',
		notAvailable: '#E75040',
		inactive: '#E75040',
		unpaired: '#CCCCCC'
	};
	return map[statusCode] ?? '#CCCCCC';
}

export function getInitials(name: string): string {
	if (!name) return '?';
	return name
		.split(' ')
		.filter(Boolean)
		.map((n) => n[0])
		.join('')
		.toUpperCase()
		.slice(0, 2);
}
