/**
 * The communication service's paths, relative to its `/api` base.
 *
 * Separate from `$lib/constants/endpoints` because this service is not behind
 * the TMS load balancer and does not use the `/api/v1` prefix the four TMS
 * services share. Mixing the two files would invite someone to give a TMS call
 * this base path, or the reverse.
 */
export const ENDPOINTS = {
	tickets: {
		list: '/tickets',
		one: (id: string) => `/tickets/${id}`,
		assign: (id: string) => `/tickets/${id}/assign`,
		resolve: (id: string) => `/tickets/${id}/resolve`,
		transfer: (id: string) => `/tickets/${id}/transfer`,
		messages: (id: string) => `/tickets/${id}/messages`
	},
	otp: {
		send: '/otp/send',
		verify: '/otp/verify'
	}
};
