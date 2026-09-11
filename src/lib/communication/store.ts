import { writable } from 'svelte/store';
import { comms } from './client';
import type { Message, Ticket } from './types';

interface TicketState {
	tickets: Ticket[];
	loading: boolean;
	/** Set when a request fails, so a page can say so instead of showing "none". */
	error: string;
}

export const ticketStore = writable<TicketState>({ tickets: [], loading: false, error: '' });

interface ThreadState {
	ticket: Ticket | null;
	messages: Message[];
	loading: boolean;
	sending: boolean;
	error: string;
}

export const threadStore = writable<ThreadState>({
	ticket: null,
	messages: [],
	loading: false,
	sending: false,
	error: ''
});

function message(e: unknown, fallback: string): string {
	return e instanceof Error && e.message ? e.message : fallback;
}

export const ticketActions = {
	async load() {
		ticketStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const tickets = (await comms.listTickets()) ?? [];
			ticketStore.set({ tickets, loading: false, error: '' });
		} catch (e) {
			ticketStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load tickets.')
			}));
		}
	},

	/**
	 * Load one ticket and its conversation together.
	 *
	 * Two requests rather than one because the service has no endpoint that
	 * returns both, and issuing them in parallel costs the latency of the slower
	 * rather than the sum.
	 */
	async open(id: string) {
		threadStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const [ticket, messages] = await Promise.all([comms.getTicket(id), comms.listMessages(id)]);
			threadStore.set({
				ticket,
				messages: messages ?? [],
				loading: false,
				sending: false,
				error: ''
			});
		} catch (e) {
			threadStore.update((s) => ({
				...s,
				loading: false,
				error: message(e, 'Could not load this ticket.')
			}));
		}
	},

	/** Refresh just the conversation, after sending or while polling. */
	async refreshMessages(id: string) {
		try {
			const messages = (await comms.listMessages(id)) ?? [];
			threadStore.update((s) => ({ ...s, messages }));
		} catch {
			// A failed refresh leaves what is already on screen, which is more
			// useful than replacing a readable thread with an error.
		}
	},

	async send(id: string, content: string, sender: string) {
		threadStore.update((s) => ({ ...s, sending: true, error: '' }));
		try {
			await comms.sendMessage(id, { content, sender, senderType: 'agent' });
			await ticketActions.refreshMessages(id);
			threadStore.update((s) => ({ ...s, sending: false }));
			return true;
		} catch (e) {
			threadStore.update((s) => ({
				...s,
				sending: false,
				error: message(e, 'Could not send the message.')
			}));
			return false;
		}
	},

	async assign(id: string, agentId: string) {
		await comms.assign(id, agentId);
		await ticketActions.open(id);
	},

	async resolve(id: string) {
		await comms.resolve(id);
		await ticketActions.open(id);
	},

	async transfer(id: string, department: string) {
		await comms.transfer(id, department);
		await ticketActions.open(id);
	}
};
