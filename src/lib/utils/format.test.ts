import { describe, expect, it } from 'vitest';
import { formatNumber, formatCurrency, formatDate, statusTone, getInitials, truncate } from './format';

describe('format', () => {
	it('formats numbers the Indonesian way and tolerates nothing', () => {
		expect(formatNumber(1234567)).toBe('1.234.567');
		expect(formatNumber('42' as any)).toBe('42');
		expect(formatNumber(undefined)).toBe('-');
		expect(formatNumber(Number.NaN)).toBe('-');
	});

	it('formats rupiah without fractions', () => {
		expect(formatCurrency(4500000)).toMatch(/^Rp\s?4\.500\.000$/);
		expect(formatCurrency(null)).toBe('-');
	});

	it('formats dates and rejects garbage', () => {
		expect(formatDate('2026-09-13T00:00:00Z')).toMatch(/13\/09\/2026/);
		expect(formatDate('not a date')).toBe('-');
		expect(formatDate(undefined)).toBe('-');
	});

	it('maps a status code to a badge tone by keyword, case-insensitively', () => {
		expect(statusTone('completed')).toBe('badge badge-active');
		expect(statusTone('Cancelled')).toBe('badge badge-fail');
		expect(statusTone('draft')).toBe('badge badge-wait');
		expect(statusTone('inTransit')).toBe('badge badge-planner');
		expect(statusTone('')).toBe('badge');
	});

	it('takes initials from up to two words', () => {
		expect(getInitials('PT Siba Surya')).toBe('PS');
		expect(getInitials('')).toBe('?');
	});

	it('truncates with an ellipsis', () => {
		expect(truncate('abcdef', 3)).toBe('abc…');
		expect(truncate('abc', 3)).toBe('abc');
	});
});
