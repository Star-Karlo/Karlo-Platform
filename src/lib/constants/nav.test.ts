import { describe, expect, it } from 'vitest';

import { visibleNav, permissionForUrl, type NavItem } from './nav';

describe('nav visibility', () => {
	const items: NavItem[] = [
		{ name: 'Dashboards', url: '/a/insight' },
		{
			name: 'Operations',
			children: [
				{ name: 'Orders', url: '/a/order' },
				{ name: 'Agreements', url: '/a/agreement' }
			]
		},
		{ name: 'Karlo Clients', url: '/a/clients', permission: 'collaboration.inviteMember' }
	] as NavItem[];

	it('hides a group when none of its children are allowed', () => {
		const out = visibleNav(items, (p) => p === permissionForUrl('/a/insight'));
		expect(out.map((i) => i.name)).toEqual(['Dashboards']);
	});

	it('keeps a group with only the allowed children', () => {
		const allowed = new Set([permissionForUrl('/a/order'), 'collaboration.inviteMember'].filter(Boolean));
		const out = visibleNav(items, (p) => allowed.has(p));
		const ops = out.find((i) => i.name === 'Operations');
		expect(ops?.children?.map((c) => c.name)).toEqual(['Orders']);
		expect(out.some((i) => i.name === 'Karlo Clients')).toBe(true);
	});

	it('shows everything to an administrator', () => {
		expect(visibleNav(items, () => true)).toHaveLength(3);
	});
});

import { homeForIdentity } from './nav';

describe('homeForIdentity', () => {
	it('lands a transporter on the first internal page, never the external FMS link', () => {
		const home = homeForIdentity({ companyRole: 'transporter' });
		expect(home.startsWith('/t/')).toBe(true);
		expect(home.startsWith('http')).toBe(false);
	});
	it('lands platform staff on an internal admin page', () => {
		const home = homeForIdentity({ isPlatformStaff: true, role: 'admin' });
		expect(home.startsWith('/')).toBe(true);
		expect(home.startsWith('http')).toBe(false);
	});
});
