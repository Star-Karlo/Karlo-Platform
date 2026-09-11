<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Search, RefreshCw, MessageSquare } from 'lucide-svelte';
	import { ticketStore, ticketActions } from '$lib/communication/store';
	import { TICKET_STATUSES, ticketStatusBadge, ticketStatusLabel } from '$lib/communication/types';
	import { formatDate, getInitials } from '$lib/utils/format';

	/**
	 * Customer Help inbox — WhatsApp conversations that reached a human.
	 *
	 * Backed by the communication service rather than by the TMS services, so
	 * nothing here is company-scoped: the service stores a phone number and a
	 * department on a ticket, not a company id. Every agent who can open this
	 * page sees every ticket, which is the service's own model and worth knowing
	 * before this is opened to client users.
	 */
	let { basePath }: { basePath: string } = $props();

	let activeTab = $state('all');

	onMount(() => {
		void ticketActions.load();
	});

	let tickets = $derived($ticketStore.tickets ?? []);

	let counts = $derived.by(() => {
		const next: Record<string, number> = { all: tickets.length };
		for (const s of TICKET_STATUSES) {
			next[s.code] = tickets.filter((t) => t.status === s.code).length;
		}
		return next;
	});

	/**
	 * Newest activity first, by last message rather than by creation — an old
	 * ticket somebody just replied to is the one that needs attention.
	 */
	let rows = $derived(
		[...(activeTab === 'all' ? tickets : tickets.filter((t) => t.status === activeTab))].sort(
			(a, b) =>
				new Date(b.lastMsgAt ?? b.updatedAt).getTime() -
				new Date(a.lastMsgAt ?? a.updatedAt).getTime()
		)
	);
</script>

<div class="page-head">
	<div>
		<h1>Customer Help</h1>
		<p>Percakapan WhatsApp yang sudah diteruskan ke agen.</p>
	</div>
	<button type="button" class="btn btn-outline" onclick={() => ticketActions.load()}>
		<RefreshCw size={15} /> Muat Ulang
	</button>
</div>

{#if $ticketStore.error}
	<div class="note-banner note-banner-error" role="alert">
		<span>⛔</span><div>{$ticketStore.error}</div>
	</div>
{/if}

<div class="order-toolbar">
	<div class="order-tabs-row">
		<button
			type="button"
			class="order-tab {activeTab === 'all' ? 'active' : ''}"
			onclick={() => (activeTab = 'all')}
		>
			Total ({counts.all})
		</button>
		{#each TICKET_STATUSES as s}
			<button
				type="button"
				class="order-tab {activeTab === s.code ? 'active' : ''}"
				onclick={() => (activeTab = s.code)}
			>
				{s.label} ({counts[s.code]})
			</button>
		{/each}
	</div>
</div>

{#if $ticketStore.loading}
	<div class="card card-pad"><div class="empty">Memuat…</div></div>
{:else if rows.length === 0}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">💬</div>
			{activeTab === 'all' ? 'Belum ada tiket.' : 'Tidak ada tiket pada tab ini.'}
		</div>
	</div>
{:else}
	<div class="spot-order-wrap">
		<div class="spot-order-scroll">
			<table class="spot-order-table" style="min-width:1000px;">
				<colgroup>
					<col style="width:5%" />
					<col style="width:17%" />
					<col style="width:22%" />
					<col style="width:26%" />
					<col style="width:15%" />
					<col style="width:15%" />
				</colgroup>
				<thead>
					<tr>
						<th>No</th>
						<th>Kontak</th>
						<th>Subjek</th>
						<th>Pesan Terakhir</th>
						<th>Departemen</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as t, i}
						<tr>
							<td>{i + 1}</td>
							<td>
								<div class="shipper-cell">
									<div class="shipper-avatar">{getInitials(t.phoneNumber)}</div>
									<span class="shipper-name mono">{t.phoneNumber}</span>
								</div>
							</td>
							<td title={t.subject ?? ''}>{t.subject || '(tanpa subjek)'}</td>
							<td title={t.lastMessage ?? ''}>
								{t.lastMessage || '—'}
								{#if t.lastMsgAt}
									<span class="hint" style="display:block;">{formatDate(t.lastMsgAt, 'datetime')}</span>
								{/if}
							</td>
							<td>{t.department || '—'}</td>
							<td><span class={ticketStatusBadge(t.status)}>{ticketStatusLabel(t.status)}</span></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<table class="spot-order-table spot-order-table-frozen" style="width:96px;">
			<colgroup><col style="width:96px" /></colgroup>
			<thead><tr><th>Kontrol</th></tr></thead>
			<tbody>
				{#each rows as t}
					<tr>
						<td>
							<div class="action-cell">
								<button
									type="button"
									class="frozen-icon-btn"
									title="Buka percakapan"
									aria-label="Buka percakapan {t.phoneNumber}"
									onclick={() => goto(`${basePath}/${t._id}`)}
								>
									<Search size={14} />
								</button>
								<button
									type="button"
									class="frozen-icon-btn"
									title="Balas"
									aria-label="Balas {t.phoneNumber}"
									onclick={() => goto(`${basePath}/${t._id}`)}
								>
									<MessageSquare size={14} />
								</button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="table-footer-bar">
		Menampilkan {rows.length} tiket. Layanan mengembalikan maksimal 100 tiket terbaru.
	</div>
{/if}
