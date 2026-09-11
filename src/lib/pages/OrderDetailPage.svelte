<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { ArrowLeft, ClipboardList } from 'lucide-svelte';
	import { orderStore, orderActions } from '$lib/stores/orders';
	import { formatCurrency, formatDate, formatNumber } from '$lib/utils/format';
	import {
		AllowancePanel,
		Button,
		Card,
		DispatchPanel,
		EmptyState,
		PageHeader,
		Spinner,
		StatusBadge
	} from '$lib/components/ui';
	import { can } from '$lib/stores/auth';

	let { basePath }: { basePath: string } = $props();

	let id = $derived($page.params.id ?? '');
	/** Named separately because both panels take it as `orderId`. */
	let orderId = $derived(id);
	let order = $derived($orderStore.currentOrder);

	/**
	 * What this user may do to this order right now.
	 *
	 * Asked of the service rather than derived from the status here: the answer
	 * depends on the caller's role and which side of the order their company is
	 * on, which the frontend cannot know.
	 *
	 * Each entry carries `alias` (English) and `label` (Indonesian). The rest of
	 * this UI is English, so buttons read from `alias`.
	 */
	let transitions = $state<{ status: string; label: string; alias: string }[]>([]);
	/** From /orders/:id/history — the order record itself has no history field. */
	let history = $state<{ id: number; toStatusCode: string; source: string; createdAt: string }[]>([]);
	let working = $state('');

	/**
	 * Statuses that end or reject the order get the destructive treatment.
	 *
	 * The transitions endpoint filters by the caller's permissions, so whatever
	 * arrives here is something the server will accept — but a one-way move
	 * should still not look like the happy path.
	 */
	const DESTRUCTIVE = new Set(['cancelled', 'cancelRequested', 'rejected']);

	/**
	 * Which of the two operational panels to show.
	 *
	 * Both are gated on a permission the company assigns, so a colleague who may
	 * see an order does not necessarily see what its driver is being paid. The
	 * server enforces this independently — the check here only avoids rendering
	 * a panel that would answer 403.
	 */
	let mayDispatch = $derived($can('dispatch.read'));
	let maySeeAllowance = $derived($can('order.allowance.read'));
	/** Once a driver is on the order there is nothing left to pick. */
	let isAssigned = $derived(!!order?.driverUserId);

	onMount(() => refresh(true));

	async function refresh(withOrder = false) {
		if (withOrder) await orderActions.getOne(id);
		const [nextTransitions, nextHistory] = await Promise.all([
			orderActions.transitions(id).catch(() => null),
			orderActions.history(id).catch(() => null)
		]);
		transitions = nextTransitions?.transitions ?? [];
		history = nextHistory ?? [];
	}

	async function move(status: string) {
		working = status;
		try {
			await orderActions.setStatus(id, status);
			await refresh(true);
		} finally {
			working = '';
		}
	}
</script>

<div class="space-y-gutter">
	{#if $orderStore.loading && !order}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else if order}
		<PageHeader
			title={order.orderNumber ?? 'Order'}
			icon={ClipboardList}
			subtitle="Created {formatDate(order.createdAt, 'datetime')}"
		>
			{#snippet actions()}
				<Button variant="ghost" href={basePath}>
					<ArrowLeft size={14} /> Back to list
				</Button>
				{#each transitions as transition}
					<Button
						variant={DESTRUCTIVE.has(transition.status) ? 'danger' : 'primary'}
						loading={working === transition.status}
						onclick={() => move(transition.status)}
					>
						{transition.alias ?? transition.label}
					</Button>
				{/each}
			{/snippet}
		</PageHeader>

		<StatusBadge statusCode={order.statusCode ?? ''} label={order.statusAlias ?? order.status ?? ''} />

		<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
			<Card title="Order Info">
				<dl class="grid grid-cols-2 gap-y-3 text-xs">
					<dt class="text-muted">Route</dt>
					<dd class="text-ink">
						{order.originWarehouseName ?? '-'} → {order.destinationWarehouseName ?? '-'}
					</dd>
					<dt class="text-muted">Pickup</dt>
					<dd class="text-ink">{formatDate(order.pickupAt, 'datetime')}</dd>
					<dt class="text-muted">Delivery</dt>
					<dd class="text-ink">{formatDate(order.deliveryAt, 'datetime')}</dd>
					<dt class="text-muted">Kind</dt>
					<dd class="text-ink">{order.orderKind ?? '-'}</dd>
					<dt class="text-muted">Quantity</dt>
					<dd class="text-ink">{formatNumber(Number(order.quantity ?? 0))}</dd>
					<dt class="text-muted">Weight</dt>
					<dd class="text-ink">{formatNumber(Number(order.weightKg ?? 0))} kg</dd>
					{#if order.truckPoliceNumber}
						<dt class="text-muted">Truck</dt>
						<dd class="text-ink">{order.truckPoliceNumber}</dd>
					{/if}
				</dl>
			</Card>

			<Card title="Pricing">
				<dl class="grid grid-cols-2 gap-y-3 text-xs">
					<dt class="text-muted">Order Price</dt>
					<dd class="font-semibold text-navy">{formatCurrency(Number(order.price ?? 0))}</dd>
				</dl>
				<!-- The order carries a single agreed price. The tax breakdown lives
				     on the invoice, not here. -->
				{#if order.detail?.note}
					<p class="mt-4 border-t border-line-card pt-4 text-xs text-muted">{order.detail.note}</p>
				{/if}
			</Card>
		</div>

		{#if mayDispatch || maySeeAllowance}
			<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
				{#if mayDispatch}
					<DispatchPanel {orderId} assigned={isAssigned} onassigned={() => refresh(true)} />
				{/if}
				{#if maySeeAllowance}
					<AllowancePanel {orderId} />
				{/if}
			</div>
		{/if}

		<Card title="Status History">
			{#if history.length === 0}
				<EmptyState message="No status changes recorded" />
			{:else}
				<ol class="space-y-3">
					{#each history as entry}
						<li class="flex items-center gap-3 text-xs">
							<span class="h-2 w-2 shrink-0 rounded-full bg-cyan"></span>
							<span class="w-40 shrink-0 text-muted">{formatDate(entry.createdAt, 'datetime')}</span>
							<StatusBadge statusCode={entry.toStatusCode} label={entry.toStatusCode} />
							<span class="text-muted">via {entry.source}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</Card>
	{:else}
		<Card><EmptyState message="Order not found" /></Card>
	{/if}
</div>
