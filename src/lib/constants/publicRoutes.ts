/**
 * Paths a person reaches before they have an account.
 *
 * Two different things consult this and they must agree: the root layout,
 * which decides whether to draw the signed-in shell, and the auth store,
 * which otherwise sends a visitor with no session to /auth. Web-Field is the
 * reason it is shared — the layout was taught about it and the store was not,
 * so the one page built for somebody with no account redirected them to Login.
 */
export const PUBLIC_PATHS = [
	'/auth',
	/** The claim link a transporter sends a new client. */
	'/claim/',
	/** The customer's tracking link. */
	'/track/',
	/** The old field link; it redirects into /webfield. */
	'/field/',
	/** Web-Field: the warehouse PIC's credential is the code on the driver's phone. */
	'/webfield'
];

export const isPublicPath = (pathname: string) => PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix));
