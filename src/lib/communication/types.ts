/**
 * The communication service's own shapes.
 *
 * Kept apart from `$lib/types` because this service is a separate backend with
 * its own conventions: Mongo `_id` rather than `id`, its own status vocabulary,
 * and an envelope of `{ data }` rather than the paginated `{ data, meta }` the
 * TMS services return. Mapping it into the platform's shapes here would hide a
 * difference that callers need to know about.
 */

/** open → assigned → resolved → closed. `open` is also where a transfer lands. */
export type TicketStatus = 'open' | 'assigned' | 'resolved' | 'closed';

export interface Ticket {
	_id: string;
	contact?: string;
	agent?: string;
	department?: string;
	status: TicketStatus;
	priority?: string;
	subject?: string;
	phoneNumber: string;
	lastMessage?: string;
	lastMsgAt?: string;
	resolvedAt?: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Who said it. `customer` arrives over the WhatsApp webhook, `agent` is typed
 * in this console, and `bot` is the self-service chatbot answering on its own.
 */
export type SenderType = 'agent' | 'customer' | 'bot';

export interface Message {
	_id: string;
	ticket?: string;
	sender: string;
	senderType: SenderType;
	content: string;
	contentType: 'text' | 'image' | 'document' | 'template';
	mediaUrl?: string;
	whatsappId?: string;
	isRead: boolean;
	createdAt: string;
	updatedAt: string;
}

export const TICKET_STATUSES: { code: TicketStatus; label: string; badge: string }[] = [
	{ code: 'open', label: 'Terbuka', badge: 'badge badge-wait' },
	{ code: 'assigned', label: 'Ditangani', badge: 'badge badge-planner' },
	{ code: 'resolved', label: 'Selesai', badge: 'badge badge-active' },
	{ code: 'closed', label: 'Ditutup', badge: 'badge badge-self' }
];

export function ticketStatusLabel(status: string): string {
	return TICKET_STATUSES.find((s) => s.code === status)?.label ?? status;
}

export function ticketStatusBadge(status: string): string {
	return TICKET_STATUSES.find((s) => s.code === status)?.badge ?? 'badge badge-wait';
}

/**
 * The departments a ticket can be transferred to.
 *
 * The service stores `department` as a free string and validates nothing, so
 * this list is the console's own convention. Keep it in step with whatever the
 * chatbot offers in its AWAITING_DEPT prompt — a transfer to a department the
 * bot never routes to is a ticket nobody is watching.
 */
export const DEPARTMENTS = [
	{ value: 'operations', label: 'Operasional' },
	{ value: 'finance', label: 'Keuangan' },
	{ value: 'sales', label: 'Sales' },
	{ value: 'technical', label: 'Teknis' }
];
