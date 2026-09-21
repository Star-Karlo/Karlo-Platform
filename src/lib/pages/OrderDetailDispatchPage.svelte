<script lang="ts">
	/**
	 * /order/:id — one link for every order (Control Tower, Allocate, Insight,
	 * notifications) that opens the Revamp detail matching the order: Order
	 * Kontrak for internal orders, Spot Order for the rest.
	 */
	import { onMount } from 'svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import OrderKontrakDetailPage from './OrderKontrakDetailPage.svelte';
	import SpotOrderDetailPage from './SpotOrderDetailPage.svelte';

	let { id, basePath = '/t' }: { id: string; basePath?: string } = $props();
	let kind = $state<'kontrak' | 'spot' | null>(null);
	let missing = $state(false);
	onMount(async () => {
		try {
			const o = (await api.get(ENDPOINTS.orders.one(id))).data?.data;
			kind = o?.detail?.internalOrder ? 'kontrak' : 'spot';
		} catch {
			missing = true;
		}
	});
</script>

{#if kind === 'kontrak'}
	<OrderKontrakDetailPage {id} {basePath} />
{:else if kind === 'spot'}
	<SpotOrderDetailPage {id} {basePath} />
{:else if missing}
	<div class="card card-pad"><div class="empty"><div class="eic">📄</div>Order tidak ditemukan.</div></div>
{/if}
