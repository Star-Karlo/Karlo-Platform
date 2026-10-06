import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// The Dockerfile runs `node build`, which needs the Node adapter's
		// server output. adapter-auto detects no platform inside the image and
		// emits nothing to run.
		adapter: adapter(),

		// Notice a deploy that happened while a tab was open.
		//
		// Built assets are immutable and named by hash, so a deploy removes
		// the ones the open tab still refers to. Its next navigation asks for
		// a chunk that is now 404 and dies with "Failed to fetch dynamically
		// imported module" — a blank page, from a tab that was working a
		// moment earlier. A planner halfway through an order sees the app
		// break for no reason they can act on.
		//
		// Polling version.json lets the client know, and the root layout turns
		// the next navigation into a full page load, which fetches the new
		// build. A minute is frequent enough that a deploy is noticed before
		// most people navigate, and cheap: the file is a few bytes.
		version: {
			pollInterval: 60_000
		}
	}
};

export default config;
