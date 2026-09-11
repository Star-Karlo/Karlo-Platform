<script lang="ts">
	import { page } from '$app/stores';
	import { Building2, Check, LogOut, Menu } from 'lucide-svelte';
	import { role, can, consoleKey, currentUser, authStore } from '$lib/stores/auth';

	/** The company this person is acting as. */
	let companyName = $derived($currentUser?.companyName ?? 'Your company');
	let companyRole = $derived($currentUser?.companyRole ?? $role ?? '');
	let consoleLabel = $derived(
		({ admin: 'Admin', transporter: 'Transporter', shipper: 'Shipper', manager: 'Manager' } as Record<string, string>)[
			$consoleKey
		] ?? 'Karlo'
	);
	import { sidebarCollapsed } from '$lib/stores/ui';
	import { navItems, visibleNav, type NavItem } from '$lib/constants/nav';
	import { ROLES } from '$lib/constants/status';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import NavNode from './NavNode.svelte';

	/**
	 * The menu this caller may actually use.
	 *
	 * Filtered by permission, not just by console. Roles and permissions were
	 * being set and then ignored here: every signed-in user saw every screen
	 * for their console and only discovered the limit as a 403 after clicking.
	 * The server is still the boundary; this stops the menu from advertising
	 * doors that are locked.
	 */
	let items = $derived(visibleNav(navItems[$consoleKey] ?? [], $can));
	let collapsed = $derived($sidebarCollapsed);
	let pathname = $derived($page.url.pathname);

	/** Groups open themselves when the current route lives inside them. */
	let manualToggles: Record<string, boolean> = $state({});

	function isActive(url?: string): boolean {
		if (!url) return false;
		return pathname === url || pathname.startsWith(url + '/');
	}

	function groupHasActiveChild(item: NavItem): boolean {
		return (item.children ?? []).some((child) => isActive(child.url));
	}

	function isOpen(item: NavItem): boolean {
		return manualToggles[item.name] ?? groupHasActiveChild(item);
	}
</script>

<aside class="sidebar {collapsed ? 'collapsed' : ''}">
	<button
		class="sidebar-hamburger"
		aria-label="Toggle navigation"
		onclick={() => sidebarCollapsed.toggle()}
	>
		<Menu size={20} />
	</button>

	<!-- The COMPANY, not the person. Someone signing in is acting AS their
	     company — every order, agreement and price belongs to it — and the role
	     beneath says in what capacity. -->
	<div class="brand">
		<span class="profile-avatar">
			<Building2 size={20} />
			<span class="verified-dot"><Check size={9} /></span>
		</span>
		{#if !collapsed}
			<span class="brand-text">
				<b>{companyName}</b>
				<span style="text-transform:capitalize;">{companyRole}</span>
			</span>
		{/if}
	</div>

	<nav class="nav">
		{#each items as item (item.name)}
			<NavNode
				{item}
				{collapsed}
				{pathname}
				open={manualToggles}
				onToggle={(name, next) => (manualToggles[name] = next)}
			/>
		{/each}
	</nav>

	<button class="logout-btn" onclick={() => authStore.logout()}>
		<span class="nav-icon"><LogOut size={18} /></span>
		{#if !collapsed}<span class="nav-label">Logout</span>{/if}
	</button>

	<div class="sidebar-foot">{consoleLabel} Console v2.0</div>
</aside>
