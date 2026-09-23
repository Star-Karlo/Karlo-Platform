/**
 * The old token-only field page.
 *
 * Web-Field replaced it: the PIC's audit now needs the code the driver holds,
 * so a token on its own no longer records anything. Links already in the wild
 * land on the new page with the token carried over, where the PIC is asked for
 * the code.
 */
import { redirect } from '@sveltejs/kit';

export const load = ({ params }) => {
	throw redirect(307, `/webfield?token=${encodeURIComponent(params.token)}`);
};
