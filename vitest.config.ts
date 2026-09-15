import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests only: pure modules under src/lib (formatters, permission
// helpers, the FMS live-fleet adapter). Screens are exercised by svelte-check
// and the build; the app's real behaviour against services is checked in
// production smoke runs, not here.
//
// SvelteKit's virtual modules are stubbed rather than loading the whole kit
// plugin: the plugin spins up a dev server for one import of `browser`.
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		pool: 'forks'
	},
	resolve: {
		alias: {
			$lib: r('./src/lib'),
			'$app/environment': r('./src/test-stubs/app-environment.ts'),
			'$app/state': r('./src/test-stubs/app-state.ts'),
			'$env/dynamic/public': r('./src/test-stubs/env-public.ts'),
			'lucide-svelte': r('./src/test-stubs/lucide.ts')
		}
	}
});
