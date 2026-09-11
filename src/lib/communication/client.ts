import { ENDPOINTS } from './endpoints';
import type { Message, Ticket } from './types';

/**
 * Calls into the communication service.
 *
 * Every request goes to `/api/comms/*`, a SvelteKit server route in this app,
 * NOT to the service directly. The service authenticates with a shared
 * `x-api-key`, and a shared key that reaches a browser is a key that has been
 * published — anyone with it could read every ticket on the platform. The
 * server route holds the key and forwards the call, so it never enters a
 * bundle. That is also why this file has no base URL to configure.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api/comms${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(body?.message || `Request failed (${res.status})`);
	}
	// The service wraps success in { message?, data? }. An action that changes
	// something answers with a message and no data, which is not an error.
	return (body?.data ?? null) as T;
}

export const comms = {
	listTickets: () => call<Ticket[]>(ENDPOINTS.tickets.list),
	getTicket: (id: string) => call<Ticket>(ENDPOINTS.tickets.one(id)),

	createTicket: (body: Partial<Ticket>) =>
		call<Ticket>(ENDPOINTS.tickets.list, { method: 'POST', body: JSON.stringify(body) }),

	/** Only the fields passed are applied; omitted fields keep their value. */
	updateTicket: (id: string, body: Record<string, unknown>) =>
		call<null>(ENDPOINTS.tickets.one(id), { method: 'PUT', body: JSON.stringify(body) }),

	assign: (id: string, agentId: string) =>
		call<null>(ENDPOINTS.tickets.assign(id), {
			method: 'PUT',
			body: JSON.stringify({ agentId })
		}),

	resolve: (id: string) => call<null>(ENDPOINTS.tickets.resolve(id), { method: 'PUT' }),

	/**
	 * Hand the ticket to another department. The service also clears the agent
	 * and returns the ticket to `open`, so a transfer un-assigns by design.
	 */
	transfer: (id: string, department: string) =>
		call<null>(ENDPOINTS.tickets.transfer(id), {
			method: 'PUT',
			body: JSON.stringify({ department })
		}),

	listMessages: (id: string) => call<Message[]>(ENDPOINTS.tickets.messages(id)),

	sendMessage: (id: string, body: { content: string; sender: string; senderType: string; contentType?: string }) =>
		call<Message>(ENDPOINTS.tickets.messages(id), {
			method: 'POST',
			body: JSON.stringify({ contentType: 'text', ...body })
		})
};
