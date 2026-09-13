import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

/**
 * Server-side proxy to the FMS API, for the live fleet on Control Tower.
 *
 * FMS accepts the platform's own tokens — one login, both products — so
 * unlike the comms proxy there is no shared key to hide. It is proxied all
 * the same: FMS's CORS allows only its own console, and a platform token
 * held by a TMS page and sent straight to a second product's API is a wider
 * blast radius than either product chose. The caller's bearer and the
 * acting-for header are forwarded as-is; FMS scopes the answer by them,
 * exactly as it does for its own console.
 *
 * Read-only by design: Control Tower observes the fleet, it does not
 * operate it. Anything that changes a vehicle happens in FMS.
 */
const BASE = (env.FMS_API_URL || 'https://fms-api.karlo.id').replace(/\/$/, '');

async function forward(request: Request, path: string, url: URL): Promise<Response> {
	const auth = request.headers.get('authorization');
	if (!auth) throw error(401, 'Not signed in.');

	const headers: Record<string, string> = { Authorization: auth, Accept: 'application/json' };
	const acting = request.headers.get('x-acting-for');
	if (acting) headers['X-Acting-For'] = acting;

	let res: Response;
	try {
		res = await fetch(`${BASE}/v1/${path}${url.search}`, { method: 'GET', headers });
	} catch {
		throw error(502, 'Could not reach the fleet service.');
	}
	return new Response(await res.text(), {
		status: res.status,
		headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' }
	});
}

export const GET: RequestHandler = ({ request, params, url }) => forward(request, params.path, url);
