import type { Config } from 'tailwindcss';

/**
 * Karlo design tokens.
 *
 * Every value here comes from UI_TEMPLATE/karlo.tailwind.js, which was measured
 * off the live app. Treat that file as the source of truth: if a value needs to
 * change, change it there first and mirror it here, rather than inventing a new
 * shade in a component.
 *
 * The palette is deliberately narrow — navy is structure, cyan is action, green
 * is state, red is danger, gray is data. A component that needs a colour not
 * listed below is almost always solving the wrong problem.
 */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				/*
				 * The TMS Revamp palette. Material-3 flavoured: a blue action
				 * colour rather than the old cyan, and a deeper navy chrome.
				 *
				 * Changed here rather than only in CSS so every Tailwind class
				 * already written — bg-navy, text-cyan, border-line-card —
				 * repaints with the rest instead of leaving the app looking
				 * like two products stitched together.
				 */
				navy: { DEFAULT: '#101F42', light: '#1B3268', 50: 'rgba(16,31,66,0.5)' },
				cyan: { DEFAULT: '#0B57D0', soft: '#D3E3FD' },
				/** Alias of cyan. The action colour reads as "primary" in most components. */
				primary: { DEFAULT: '#0B57D0', dark: '#0842A0', soft: '#D3E3FD' },
				success: { DEFAULT: '#146C2E', nav: '#9FDCB4', container: '#DDF3E4' },
				danger: { DEFAULT: '#B3261E', container: '#F9DEDC' },
				warning: { DEFAULT: '#8A5300', container: '#FFEACC' },
				info: { DEFAULT: '#36B9CC' },
				legacy: { DEFAULT: '#4E73DF' },
				muted: { DEFAULT: '#5B5F67', dim: '#8A8E96' },
				ink: { DEFAULT: '#1A1C1E', dark: '#101F42', alt: '#5B5F67', heading: '#1A1C1E' },
				canvas: '#F6F8FC',
				surface: '#FFFFFF',
				zebra: '#E8EDF6',
				tint: '#EBF2FD',
				cream: '#FAF9F5',
				line: { input: '#C4C9D4', card: '#DDE2EA', muted: '#5B5F67', divider: '#DDE2EA' },
				/** Truck status colours, used by the planner map and its legend. */
				truck: {
					blue: '#12C7EF',
					green: '#1CC88A',
					yellow: '#FFC107',
					purple: '#6F42C1',
					red: '#E75040',
					gray: '#CCCCCC'
				}
			},
			fontFamily: {
				sans: ['Poppins', 'sans-serif'],
				legacy: ['Roboto', 'sans-serif']
			},
			fontSize: {
				xs: ['12px', '18px'],
				sm: ['14px', '21px'],
				nav: ['15px', '22px'],
				base: ['16px', '24px'],
				lg: ['20px', '24px'],
				xl: ['24px', '28.8px']
			},
			borderRadius: {
				nav: '5px',
				legacy: '5.6px',
				stat: '9px',
				card: '10px',
				btn: '20px',
				input: '25px',
				cta: '50px',
				segment: '800px'
			},
			boxShadow: {
				card: '0 1px 4px rgba(0,0,0,0.25)',
				soft: '0 1px 4px rgba(0,0,0,0.1)',
				topbar: '0 2.4px 28px rgba(58,59,69,0.15)',
				bar: '0 2px 2px 0 #CECECE',
				btn: '0 2px 4px rgba(58,59,69,0.2)'
			},
			spacing: {
				topbar: '64px',
				actionbar: '72px',
				sidebar: '215px',
				'sidebar-min': '75px',
				gutter: '24px'
			},
			zIndex: { topbar: '1020', actionbar: '20' },
			transitionDuration: { sidebar: '500ms' }
		}
	},
	plugins: []
} satisfies Config;
