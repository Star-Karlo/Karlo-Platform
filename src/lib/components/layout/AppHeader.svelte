<script lang="ts">
	/**
	 * The global navy bar, ported from the TMS Revamp shell.
	 *
	 * It sits above BOTH the sidebar and the content — the sidebar starts below
	 * it — which is what gives the app one continuous chrome instead of a
	 * header that stops at the sidebar's edge.
	 */
	import { onMount } from 'svelte';
	import { Bell, MessageCircleQuestion } from 'lucide-svelte';
	import { authStore, consoleKey, currentUser } from '$lib/stores/auth';
	import { notificationStore, notificationActions } from '$lib/stores/invoice_notification_dashboard';
	import { BRAND } from '$lib/constants/assets';

	let menuOpen = $state(false);

	/**
	 * Customer Help is a screen in this app now, one per console, so the header
	 * has to point at the caller's own. Signed out there is no console to send
	 * anyone to, so it falls back to the public site.
	 */
	const SUPPORT_PATH: Record<string, string> = {
		admin: '/a/support',
		shipper: '/s/support',
		transporter: '/t/support',
		manager: '/m/support'
	};
	let supportHref = $derived(SUPPORT_PATH[$consoleKey] ?? 'https://karlo.id');

	onMount(() => notificationActions.getUnread());
</script>

<svelte:window onclick={() => (menuOpen = false)} />

<header class="app-header">
	<div class="app-header-left">
		<a href="/" class="app-logo-chip" aria-label="Karlo home">
			<img src={BRAND.logoMark} alt="Karlo" class="app-logo-img" />
		</a>
	</div>

	<div class="app-header-right">
		<a href={supportHref} class="ah-link">
			<MessageCircleQuestion size={16} /> Customer Help
		</a>

		<span class="ah-lang">ID</span>

		<a href="/notifications" class="ah-icon-btn" aria-label="Notifications">
			<span style="position:relative; display:flex;">
				<Bell size={16} />
				{#if $notificationStore.unreadCount > 0}
					<span
						style="position:absolute; top:-5px; right:-7px; min-width:15px; height:15px;
						       border-radius:999px; background:var(--error); color:#fff; font-size:9px;
						       font-weight:700; display:flex; align-items:center; justify-content:center; padding:0 3px;"
					>
						{$notificationStore.unreadCount > 99 ? '99+' : $notificationStore.unreadCount}
					</span>
				{/if}
			</span>
			Notifikasi
		</a>

		<div style="position:relative;">
			<button
				class="ah-icon-btn"
				onclick={(e) => {
					e.stopPropagation();
					menuOpen = !menuOpen;
				}}
			>
				{$currentUser?.fullName ?? $currentUser?.username ?? 'Account'}
			</button>

			{#if menuOpen}
				<div
					class="card"
					style="position:absolute; right:0; top:34px; width:200px; padding:6px; z-index:200;"
				>
					<a href="/settings" class="sub-link" style="padding:9px 12px;">User Setting</a>
					<button
						class="sub-link"
						style="padding:9px 12px; border:none; background:transparent; width:100%; text-align:left;"
						onclick={() => authStore.logout()}
					>
						Sign out
					</button>
				</div>
			{/if}
		</div>
	</div>
</header>
