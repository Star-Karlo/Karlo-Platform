import { error, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Server-side proxy to the communication service.
 *
 * The service authenticates with a single shared `x-api-key`. A shared key that
 * reaches the browser is a published key — it is not scoped to a user, a
 * company or a ticket, so anyone who read it out of a bundle could list every
 * ticket on the platform. Holding it here means the browser sends its ordinary
 * session cookie to this app, and only this app knows the key.
 *
 * This is the same reason MAPID routing is proxied through the business service
 * rather than called from the map component.
 */
const BASE = env.COMMS_SERVICE_URL || 'http://localhost:4000';
const API_KEY = env.COMMS_API_KEY || '';

/** Methods that carry a body. Others must not forward one. */
const WITH_BODY = new Set(['POST', 'PUT', 'PATCH']);

async function forward(request: Request, path: string, url: URL): Promise<Response> {
	if (!API_KEY) {
		// Said plainly rather than forwarded: without a key the service answers
		// 401 for every call, and "unauthorized" would send whoever debugs it
		// looking at their own login rather than at a missing variable.
		throw error(503, 'Customer Help is not configured — COMMS_API_KEY is unset.');
	}

	const target = `${BASE}/api/${path}${url.search}`;
	const init: RequestInit = {
		method: request.method,
		headers: {
			'x-api-key': API_KEY,
			'Content-Type': 'application/json'
		}
	};
	if (WITH_BODY.has(request.method)) {
		init.body = await request.text();
	}

	let res: Response;
	try {
		res = await fetch(target, init);
	} catch {
		// A refused connection is the service being down, which is a 502 from
		// this app's point of view rather than a failure of the caller's request.
		throw error(502, 'Could not reach the communication service.');
	}

	const text = await res.text();
	return new Response(text, {
		status: res.status,
		headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' }
	});
}

export const GET: RequestHandler = ({ request, params, url }) => forward(request, params.path, url);
export const POST: RequestHandler = ({ request, params, url }) => forward(request, params.path, url);
export const PUT: RequestHandler = ({ request, params, url }) => forward(request, params.path, url);
export const DELETE: RequestHandler = ({ request, params, url }) => forward(request, params.path, url);
