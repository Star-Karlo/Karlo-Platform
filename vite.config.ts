import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * Local development proxy.
 *
 * In production one load balancer routes /api/v1/* by path to whichever service
 * owns it, so the frontend needs a single base URL. This reproduces that
 * locally, so the application code is identical in both places and no
 * environment switch decides which host to call.
 *
 * The path-to-port map here MUST match the ALB listener rules in each service's
 * terraform/variables.tf (`path_patterns`). If they drift, a call that works
 * locally will 404 in production.
 */
const SERVICES = {
	// authentication-service :5001
	'/api/v1/auth': 'http://localhost:5001',
	'/api/v1/users': 'http://localhost:5001',
	// Karlo staff only: granting a company its modules.
	'/api/v1/admin': 'http://localhost:5001',
	// A transporter's clients. They are COMPANIES in the authentication
	// service, not master data rows — a client may have no user account at all
	// and still be a company, which is what lets a transporter order on its
	// behalf before it ever signs in.
	'/api/v1/shippers': 'http://localhost:5001',
	'/api/v1/transporters': 'http://localhost:5001',
	// The caller's own company profile (Settings, order/agreement documents)
	// and the client claim link a transporter hands its shipper.
	'/api/v1/companies': 'http://localhost:5001',
	'/api/v1/claim': 'http://localhost:5001',
	// A company's own roles, and the permission catalogue a role editor reads.
	'/api/v1/roles': 'http://localhost:5001',
	'/api/v1/permissions': 'http://localhost:5001',

	// masterdata-service :5002
	'/api/v1/catalog': 'http://localhost:5002',
	'/api/v1/trucks': 'http://localhost:5002',
	'/api/v1/vehicles': 'http://localhost:5002',
	'/api/v1/drivers/accounts': 'http://localhost:5001',
	'/api/v1/drivers': 'http://localhost:5002',
	'/api/v1/documents': 'http://localhost:5002',
	'/api/v1/sites': 'http://localhost:5002',
	'/api/v1/warehouses': 'http://localhost:5002',
	// Telematics devices, and the plate-to-IMEI link both products read.
	'/api/v1/trackers': 'http://localhost:5002',
	// A company's own consignee register — not platform users.
	'/api/v1/customers': 'http://localhost:5002',

	// business-service :5003
	'/api/v1/orders': 'http://localhost:5003',
	'/api/v1/fleet': 'http://localhost:5003',
	// Finance: chart of accounts and manual journal lines.
	'/api/v1/ledger': 'http://localhost:5003',
	'/api/v1/shipments': 'http://localhost:5003',
	// Web-Field, the receiving PIC's own pages.
	'/api/v1/field': 'http://localhost:5003',
	'/api/v1/agreements': 'http://localhost:5003',
	'/api/v1/invoices': 'http://localhost:5003',
	// MAPID routing, proxied server-side so the API key never reaches a bundle.
	'/api/v1/routing': 'http://localhost:5003',
	// Per-company form configuration: which fields an agreement or order demands.
	'/api/v1/config': 'http://localhost:5003',
	// Signed S3 URLs. The service signs; the browser uploads straight to S3,
	// so no file ever passes through here.
	'/api/v1/uploads': 'http://localhost:5003',

	// notification-service :5004
	'/api/v1/notifications': 'http://localhost:5004',
	'/api/v1/otp': 'http://localhost:5004'
};

const proxy = Object.fromEntries(
	Object.entries(SERVICES).map(([path, target]) => [
		path,
		{
			target,
			changeOrigin: true,
			// The services already serve /api/v1/... so the path passes through
			// unchanged; only the host is rewritten.
			rewrite: (p: string) => p
		}
	])
);

export default defineConfig({
	/**
	 * MapLibre must NOT be pre-bundled.
	 *
	 * v6 derives its Web Worker URL from `import.meta.url` and expects a
	 * sibling `maplibre-gl-worker.mjs`. Vite's dep optimiser rewrites the
	 * module into node_modules/.vite/deps/, where that sibling does not
	 * exist, so the worker 404s. Nothing throws: raster tiles keep loading
	 * because they bypass the worker, while VECTOR tiles — which the worker
	 * parses — are never even requested. The map then renders as a blank
	 * canvas with working controls, which is a hard failure to read backwards.
	 */
	optimizeDeps: { exclude: ['maplibre-gl'] },

	plugins: [sveltekit()],
	server: { proxy }
});
