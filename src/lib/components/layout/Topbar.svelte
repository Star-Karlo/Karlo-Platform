<script lang="ts">
	import { onMount } from 'svelte';
	import { Bell, Menu, Smartphone, ChevronDown } from 'lucide-svelte';
	import { authStore, currentUser } from '$lib/stores/auth';
	import { sidebarCollapsed } from '$lib/stores/ui';
	import { notificationStore, notificationActions } from '$lib/stores/invoice_notification_dashboard';
	import Avatar from '$lib/components/ui/Avatar.svelte';
	import { BRAND } from '$lib/constants/assets';

	let menuOpen = $state(false);

	const MENU = [
		{ label: 'User Setting', href: '/settings' },
		{ label: 'Edit Profile', href: '/settings' },
		{ label: 'User Guides', href: 'https://karlo.id', external: true },
		{ label: 'Contact Us', href: 'https://karlo.id', external: true },
		{ label: 'Back To Homepage', href: 'https://karlo.id', external: true }
	];

	onMount(() => {
		notificationActions.getUnread();
	});
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<header
	class="sticky top-0 z-topbar flex h-topbar items-center justify-between bg-navy px-4 py-2 shadow-topbar"
>
	<div class="flex items-center gap-4">
		<button
			class="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
			aria-label="Toggle navigation"
			onclick={() => sidebarCollapsed.toggle()}
		>
			<Menu size={20} />
		</button>
		<a href="/" aria-label="Karlo home">
			<img src={BRAND.logoMark} alt="Karlo" width="79" height="23" />
		</a>
	</div>

	<div class="flex items-center gap-4">
		<a
			href="https://karlo.id"
			class="hidden items-center gap-2 text-[12.8px] text-white/90 hover:text-white md:flex"
		>
			<Smartphone size={16} />
			Download Karlo's app
		</a>

		<span class="hidden text-base text-white sm:inline">ID</span>

		<a href="/notifications" class="relative rounded p-1.5 text-white/90 hover:bg-white/10" aria-label="Notifications">
			<Bell size={18} />
			{#if $notificationStore.unreadCount > 0}
				<span
					class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white"
				>
					{$notificationStore.unreadCount > 99 ? '99+' : $notificationStore.unreadCount}
				</span>
			{/if}
		</a>

		<span class="h-6 w-px bg-white/25"></span>

		<div class="relative">
			<button
				class="flex items-center gap-2 rounded-full text-white"
				onclick={(e) => {
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
				aria-haspopup="menu"
				aria-expanded={menuOpen}
			>
				<Avatar name={$currentUser?.fullName ?? $currentUser?.name ?? 'User'} size={32} />
				<ChevronDown size={14} class="opacity-70" />
			</button>

			{#if menuOpen}
				<div
					class="absolute right-0 top-11 w-56 overflow-hidden rounded-card bg-surface py-2 shadow-topbar"
					role="menu"
				>
					<div class="px-4 pb-2 pt-1">
						<p class="text-nav font-medium text-navy">{$currentUser?.fullName ?? 'User'}</p>
						<p class="text-xs capitalize text-muted">{$currentUser?.role ?? ''}</p>
					</div>
					{#each MENU as item}
						<a
							href={item.href}
							class="block px-4 py-2 text-sm text-ink hover:bg-canvas"
							role="menuitem"
							rel={item.external ? 'noreferrer' : undefined}
						>
							{item.label}
						</a>
					{/each}
					<div class="my-1 h-px bg-line-card"></div>
					<button
						class="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-canvas"
						role="menuitem"
						onclick={() => authStore.logout()}
					>
						Logout
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>
