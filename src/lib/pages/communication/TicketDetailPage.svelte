<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { ArrowLeft, Send, CheckCircle2, Share2 } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { threadStore, ticketActions } from '$lib/communication/store';
	import { DEPARTMENTS, ticketStatusBadge, ticketStatusLabel } from '$lib/communication/types';
	import { authStore } from '$lib/stores/auth';
	import { formatDate } from '$lib/utils/format';
	import { Button, Field, Select } from '$lib/components/ui';

	/**
	 * One Customer Help conversation, and the actions on it.
	 *
	 * The customer is on WhatsApp, so this is a two-sided thread rather than a
	 * comment list: what an agent types here is delivered to their phone, and
	 * what they reply arrives over the service's webhook. That is why the
	 * thread polls — there is no socket, and a reply that only appears on
	 * refresh is a reply the agent will miss.
	 */
	let { basePath }: { basePath: string } = $props();

	let id = $derived($page.params.id ?? '');

	let draft = $state('');
	let department = $state('');
	let acting = $state(false);
	let actionError = $state('');

	/** Polling handle, cleared on unmount so a closed page stops calling. */
	let poll: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		void ticketActions.open(id);
		// Ten seconds: fast enough that an agent does not sit in front of a
		// stale thread, slow enough that an idle tab is not hammering the
		// service. There is no push channel to use instead.
		poll = setInterval(() => void ticketActions.refreshMessages(id), 10_000);
	});

	onDestroy(() => {
		if (poll) clearInterval(poll);
	});

	let ticket = $derived($threadStore.ticket);
	let agentName = $derived($authStore.user?.fullName ?? $authStore.user?.email ?? 'Agent');

	async function send(e: Event) {
		e.preventDefault();
		const content = draft.trim();
		if (!content) return;
		// Cleared only on success, so a failed send does not also lose what was
		// typed.
		if (await ticketActions.send(id, content, agentName)) draft = '';
	}

	async function run(fn: () => Promise<void>, failure: string) {
		acting = true;
		actionError = '';
		try {
			await fn();
		} catch (e) {
			actionError = e instanceof Error && e.message ? e.message : failure;
		} finally {
			acting = false;
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>{ticket?.subject || 'Percakapan'}</h1>
		<p class="mono">{ticket?.phoneNumber ?? ''}</p>
	</div>
	<a class="btn btn-outline" href={basePath}><ArrowLeft size={15} /> Kembali ke Inbox</a>
</div>

{#if $threadStore.error}
	<div class="note-banner note-banner-error" role="alert">
		<span>⛔</span><div>{$threadStore.error}</div>
	</div>
{/if}
{#if actionError}
	<div class="note-banner note-banner-error" role="alert">
		<span>⛔</span><div>{actionError}</div>
	</div>
{/if}

{#if $threadStore.loading && !ticket}
	<div class="card card-pad"><div class="empty">Memuat…</div></div>
{:else if !ticket}
	<div class="card card-pad">
		<div class="empty"><div class="eic">💬</div>Tiket tidak ditemukan.</div>
	</div>
{:else}
	<div class="wizard-layout">
		<!-- Status and the actions on it sit beside the thread rather than above
		     it: the thread is the tall element, and an action bar that scrolls
		     away is an action bar nobody uses. -->
		<div class="card card-pad" style="position:sticky; top:126px;">
			<div class="wizard-sidebar-title">Status</div>
			<span class={ticketStatusBadge(ticket.status)}>{ticketStatusLabel(ticket.status)}</span>

			<div class="detail-row" style="margin-top:14px;">
				<div class="detail-row-label"><b>Departemen</b></div>
				<div class="detail-row-value">{ticket.department || '—'}</div>
			</div>
			<div class="detail-row">
				<div class="detail-row-label"><b>Prioritas</b></div>
				<div class="detail-row-value">{ticket.priority || '—'}</div>
			</div>
			<div class="detail-row">
				<div class="detail-row-label"><b>Dibuat</b></div>
				<div class="detail-row-value">{formatDate(ticket.createdAt, 'datetime')}</div>
			</div>
			{#if ticket.resolvedAt}
				<div class="detail-row">
					<div class="detail-row-label"><b>Selesai</b></div>
					<div class="detail-row-value">{formatDate(ticket.resolvedAt, 'datetime')}</div>
				</div>
			{/if}

			<div style="margin-top:18px;">
				<Field label="Alihkan ke Departemen" id="dept">
					<Select id="dept" bind:value={department} options={DEPARTMENTS} placeholder="Pilih departemen" />
				</Field>
				<button
					type="button"
					class="btn btn-outline btn-sm"
					disabled={!department || acting}
					onclick={() => run(() => ticketActions.transfer(id, department), 'Gagal mengalihkan tiket.')}
				>
					<Share2 size={14} /> Alihkan
				</button>
				<!-- Said before the click, because a transfer also un-assigns and
				     reopens: that surprises anyone who expects it to only change
				     the department. -->
				<p class="hint">Mengalihkan tiket akan melepas agen dan mengembalikan status ke Terbuka.</p>
			</div>

			{#if ticket.status !== 'resolved' && ticket.status !== 'closed'}
				<button
					type="button"
					class="btn btn-primary btn-sm"
					style="margin-top:10px; width:100%;"
					disabled={acting}
					onclick={() => run(() => ticketActions.resolve(id), 'Gagal menyelesaikan tiket.')}
				>
					<CheckCircle2 size={14} /> Tandai Selesai
				</button>
			{/if}
		</div>

		<div class="card card-pad">
			<div class="wa-thread">
				{#if $threadStore.messages.length === 0}
					<div class="empty">Belum ada pesan pada tiket ini.</div>
				{:else}
					{#each $threadStore.messages as m}
						{@const side =
							m.senderType === 'agent' ? 'wa-row-out' : m.senderType === 'bot' ? 'wa-row-note' : 'wa-row-in'}
						<div class="wa-row {side}">
							<div>
								<div class="wa-bubble">
									{#if m.senderType !== 'bot'}<span class="wa-sender">{m.sender}</span>{/if}
									{#if m.contentType === 'image' && m.mediaUrl}
										<img src={m.mediaUrl} alt="Lampiran dari {m.sender}" style="border-radius:6px;" />
									{:else if m.contentType === 'document' && m.mediaUrl}
										<a href={m.mediaUrl} target="_blank" rel="noopener">📎 {m.content || 'Dokumen'}</a>
									{:else}
										{m.content}
									{/if}
									<span class="wa-meta">{formatDate(m.createdAt, 'datetime')}</span>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			{#if ticket.status === 'closed'}
				<p class="hint" style="margin-top:14px;">Tiket ini sudah ditutup dan tidak menerima pesan baru.</p>
			{:else}
				<form class="wa-composer" onsubmit={send}>
					<textarea
						bind:value={draft}
						rows="2"
						placeholder="Tulis balasan… (dikirim ke WhatsApp pelanggan)"
						aria-label="Balasan"
					></textarea>
					<Button type="submit" variant="primary" loading={$threadStore.sending} disabled={!draft.trim()}>
						<Send size={14} /> Kirim
					</Button>
				</form>
			{/if}
		</div>
	</div>
{/if}
