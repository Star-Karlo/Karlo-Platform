// Flat config. Kept deliberately narrow: the type checker (svelte-check)
// already catches most of what a strict lint would, so this is the set that
// finds real bugs in a Svelte 5 + TypeScript app without arguing about style
// (Prettier owns style).
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } }
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: { parserOptions: { parser: ts.parser } },
		rules: {
			// A bare `markers;` inside $effect is how a rune effect declares a
			// dependency; the rule predates runes and reads it as dead code.
			'@typescript-eslint/no-unused-expressions': 'off'
		}
	},
	{
		rules: {
			// The codebase reads JSON from three services as `any` at the edges;
			// forbidding it would mean typing every wire shape before anything else.
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Svelte 5 runes: a $state declared after a $derived that reads it is
			// fine at runtime; the rule predates runes.
			'svelte/no-at-html-tags': 'error',
			// Keyed {#each} is good practice; unkeyed lists over static option
			// arrays are not bugs. Warn, so new code sees it without failing CI.
			'svelte/require-each-key': 'warn',
			// resolve() for hrefs is a SvelteKit-paths nicety; this app has no
			// base path and uses plain routes everywhere.
			'svelte/no-navigation-without-resolve': 'off',
			'svelte/prefer-svelte-reactivity': 'warn',
			'no-empty': ['error', { allowEmptyCatch: true }]
		}
	},
	{ ignores: ['build/', '.svelte-kit/', 'node_modules/', 'static/maplibre/', 'dist/'] }
];
