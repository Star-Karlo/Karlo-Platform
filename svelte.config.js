import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// The Dockerfile runs `node build`, which needs the Node adapter's
		// server output. adapter-auto detects no platform inside the image and
		// emits nothing to run.
		adapter: adapter()
	}
};

export default config;
