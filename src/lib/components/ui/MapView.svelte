<script lang="ts" module>
	export interface MapMarker {
		id: string;
		lat: number;
		lng: number;
		color?: string;
		/** URL of a marker image. Falls back to a coloured dot when absent. */
		icon?: string;
		/** Rendered size of `icon`, in CSS pixels. */
		iconWidth?: number;
		iconHeight?: number;
		/**
		 * Compass heading in degrees, 0 = north. Rotates the icon so a truck
		 * points the way it is travelling. Omitted when unknown — a marker
		 * pointing north because nothing told it otherwise reads as a fact.
		 */
		heading?: number;
		/** Plain text. Set as textContent, never as HTML — labels come from the API. */
		title?: string;
		subtitle?: string;
		/** A short chip drawn under the marker — a plate, a stop number. Text only. */
		label?: string;
		/** Drawn with a ring, for the truck or stop the page has picked. */
		selected?: boolean;
		/** Clicking the marker. Set, the marker gets no popup — the page owns the click. */
		onClick?: () => void;
	}

	/** A route drawn on the map. Coordinates are [longitude, latitude] pairs. */
	export interface MapLine {
		id: string;
		coordinates: [number, number][];
		color?: string;
		width?: number;
		/** Dashed, for a planned route shown against an actual one. */
		dashed?: boolean;
	}
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { MAP } from '$lib/constants/env';

	/**
	 * MapLibre GL over MAPID's vector basemap.
	 *
	 * MAPID serves OpenMapTiles-schema vector tiles with a `karlo` style built
	 * for this account, so the basemap is a style URL rather than a tile
	 * template — MapLibre fetches the style, its glyphs and its sprite itself.
	 *
	 * Everything loads lazily inside onMount: maplibre-gl touches `window` at
	 * import time and would break the server render.
	 */
	let {
		center = MAP.DEFAULT_CENTER,
		zoom = MAP.DEFAULT_ZOOM,
		markers = [],
		lines = [],
		fitToMarkers = false,
		/**
		 * Fit the markers and lines once each time this changes — a page that
		 * refreshes positions every minute wants to fit on selection, not on
		 * every refresh.
		 */
		fitKey = '',
		flyTo = null,
		flyZoom = 12,
		/**
		 * A fixed height, e.g. "260px". Set it when the map sits inside a
		 * modal or a form: the default is to fill the parent and never go
		 * below 400px, which inside a scrolling dialog made the map grow
		 * into the fields underneath it.
		 */
		height = '',
		/**
		 * Called with [longitude, latitude] when the map is clicked.
		 *
		 * GeoJSON order, matching `center` and the routing API — and the
		 * reverse of how people say a coordinate. Transposing them puts an
		 * Indonesian site in the Indian Ocean, which usually surfaces as a
		 * routing failure rather than a visibly wrong pin.
		 */
		onPick,
		class: className = ''
	}: {
		/** [longitude, latitude] — GeoJSON order, matching the routing API. */
		center?: [number, number];
		zoom?: number;
		markers?: MapMarker[];
		lines?: MapLine[];
		fitToMarkers?: boolean;
		fitKey?: string;
		/** Animate to this point whenever it changes. */
		flyTo?: [number, number] | null;
		flyZoom?: number;
		height?: string;
		onPick?: (coordinates: [number, number]) => void;
		class?: string;
	} = $props();

	let container: HTMLDivElement;
	let map: any;
	/** The maplibre-gl module namespace. v6 exports named symbols, not a default. */
	let gl: any;
	let markerInstances: any[] = [];
	/** Source/layer ids added on the last draw, so they can be removed on the next. */
	let lineIds: string[] = [];
	/**
	 * Keeps the canvas sized to its container.
	 *
	 * Required, not a nicety: the Control Tower's map is a flex child with
	 * `min-height:0`, so it measures ZERO at the moment the map is created.
	 * MapLibre caches that size and never repaints, which renders a blank
	 * canvas with the controls still visible on top of it.
	 */
	let resizeObserver: ResizeObserver | undefined;
	let ready = $state(false);
	let failed = $state('');
	/** Non-fatal notes shown under the map, e.g. a zero-size canvas. */
	let diagnostic = $state('');

	/**
	 * Whether this browser can give us a WebGL context at all.
	 *
	 * Checked BEFORE constructing the map. Without it a machine with WebGL
	 * disabled gets a canvas that paints nothing, no error event, and a fully
	 * working set of controls sitting on top — which is indistinguishable from
	 * a map that simply has no data.
	 */
	function webglAvailable(): boolean {
		try {
			const probe = document.createElement('canvas');
			return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
		} catch {
			return false;
		}
	}

	onMount(async () => {
		if (!MAP.CONFIGURED) {
			// Said plainly rather than rendering an empty grey box: an unset key
			// looks identical to a broken map, and only one of those is fixed
			// by editing an env file.
			failed = 'No basemap key configured — set PUBLIC_MAPID_BASEMAP_KEY.';
			return;
		}
		if (!webglAvailable()) {
			failed = 'This browser cannot open a WebGL context, so the map cannot draw.';
			return;
		}
		try {
			gl = await import('maplibre-gl');
			await import('maplibre-gl/dist/maplibre-gl.css');

			// Point MapLibre at its worker explicitly.
			//
			// Left alone, v6 guesses the URL from `import.meta.url` and expects
			// a sibling file. That guess is wrong under any bundler that moves
			// or renames the module, and when it is wrong the failure is
			// silent: vector tiles are simply never requested, so the map is
			// blank while raster layers and controls look perfectly healthy.
			// `new URL(..., import.meta.url)` is a form the bundler resolves
			// and emits at build time.
			//
			// The worker is served as a plain static file, next to the shared
			// chunk it imports by RELATIVE name. Letting the bundler emit it as
			// a hashed asset broke exactly that import in production: the worker
			// loaded, asked for ./maplibre-gl-shared.mjs, got a 404, and the map
			// never fired `load` — tiles drew, markers never did. `postinstall`
			// copies both files from the pinned package into static/maplibre.
			gl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

			map = new gl.Map({
				container,
				center,
				zoom,
				style: MAP.BASEMAP_STYLE,
				attributionControl: { compact: true }
			});

			map.addControl(new gl.NavigationControl(), 'top-right');
			map.on('error', (e: any) => {
				failed = e?.error?.message ?? 'The basemap failed to load.';
			});
			// A lost context leaves the canvas frozen or blank with no error.
			map.on('webglcontextlost', () => {
				failed = 'The WebGL context was lost, so the map stopped drawing.';
			});
			map.on('load', () => {
				ready = true;
				draw();

				// A zero-size drawing buffer renders nothing while every control
				// still works. Reported rather than left to look like empty data.
				const canvas = map.getCanvas();
				if (canvas.width === 0 || canvas.height === 0) {
					diagnostic = `Map canvas is ${canvas.width}x${canvas.height} — nothing can draw at that size.`;
					map.resize();
				}
			});

			if (onPick) {
				map.on('click', (event: any) => onPick([event.lngLat.lng, event.lngLat.lat]));
				map.getCanvas().style.cursor = 'crosshair';
			}

			resizeObserver = new ResizeObserver(() => map?.resize());
			resizeObserver.observe(container);
		} catch (e: any) {
			failed = e?.message ?? 'The map could not be initialised.';
		}
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		for (const instance of markerInstances) instance.remove();
		map?.remove();
	});

	function drawLines() {
		if (!map) return;

		for (const id of lineIds) {
			if (map.getLayer(id)) map.removeLayer(id);
			if (map.getSource(id)) map.removeSource(id);
		}
		lineIds = [];

		for (const line of lines) {
			if (line.coordinates.length < 2) continue;
			const id = `line-${line.id}`;
			map.addSource(id, {
				type: 'geojson',
				data: {
					type: 'Feature',
					properties: {},
					geometry: { type: 'LineString', coordinates: line.coordinates }
				}
			});
			map.addLayer({
				id,
				type: 'line',
				source: id,
				layout: { 'line-join': 'round', 'line-cap': 'round' },
				paint: {
					'line-color': line.color ?? '#0B57D0',
					'line-width': line.width ?? 4,
					'line-opacity': 0.85,
					...(line.dashed ? { 'line-dasharray': [2, 1.5] } : {})
				}
			});
			lineIds.push(id);
		}
	}

	function draw() {
		if (!map || !gl) return;

		drawLines();

		for (const instance of markerInstances) instance.remove();
		markerInstances = [];

		for (const marker of markers) {
			let element: HTMLElement;

			if (marker.icon) {
				const img = document.createElement('img');
				img.src = marker.icon;
				img.alt = '';
				img.width = marker.iconWidth ?? 18;
				img.height = marker.iconHeight ?? 40;
				img.style.display = 'block';
				element = img;
			} else {
				element = document.createElement('div');
				element.className = 'h-4 w-4 rounded-full border-2 border-white shadow-md';
				element.style.backgroundColor = marker.color ?? '#0B57D0';
			}

			// A label or a click needs a wrapper: the image itself is the icon,
			// and a chip beneath it must not shift the anchor.
			if (marker.label || marker.selected || marker.onClick) {
				const wrap = document.createElement('div');
				wrap.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:2px;';
				if (marker.selected) {
					element.style.filter = 'drop-shadow(0 0 3px #0B57D0) drop-shadow(0 0 6px #0B57D0)';
				}
				wrap.appendChild(element);
				if (marker.label) {
					const chip = document.createElement('span');
					chip.textContent = marker.label;
					chip.style.cssText =
						'font:700 10px/1 system-ui,sans-serif; letter-spacing:.02em; padding:3px 6px; border-radius:6px; background:#fff; color:#1B1C1E; border:1px solid ' +
						(marker.selected ? '#0B57D0' : 'rgba(0,0,0,.18)') +
						'; box-shadow:0 1px 3px rgba(0,0,0,.25); white-space:nowrap;';
					wrap.appendChild(chip);
				}
				if (marker.onClick) {
					wrap.style.cursor = 'pointer';
					wrap.addEventListener('click', (ev) => {
						ev.stopPropagation();
						marker.onClick?.();
					});
				}
				element = wrap;
			}

			const instance = new gl.Marker({
				element,
				// The chip hangs under the icon; push the whole thing down by
				// half its height so the icon still sits on the coordinate.
				offset: marker.label ? [0, 10] : [0, 0],
				// Rotates with the compass, not with the screen, so a heading
				// still reads correctly if the map itself is ever rotated.
				rotation: marker.heading ?? 0,
				rotationAlignment: marker.heading === undefined ? 'viewport' : 'map'
			}).setLngLat([marker.lng, marker.lat]);

			if (marker.title && !marker.onClick) {
				// Built as DOM nodes, not an HTML string, so a police number
				// from the API cannot inject markup.
				const popup = document.createElement('div');
				popup.className = 'font-sans text-xs';
				const strong = document.createElement('strong');
				strong.textContent = marker.title;
				popup.appendChild(strong);
				if (marker.subtitle) {
					const line = document.createElement('div');
					line.className = 'text-muted';
					line.textContent = marker.subtitle;
					popup.appendChild(line);
				}
				instance.setPopup(new gl.Popup({ offset: 20 }).setDOMContent(popup));
			}

			instance.addTo(map);
			markerInstances.push(instance);
		}

		if (fitToMarkers) fitAll(0);
	}

	function fitAll(duration: number) {
		if (!map || !gl || (markers.length === 0 && lines.length === 0)) return;
		const bounds = new gl.LngLatBounds();
		for (const marker of markers) bounds.extend([marker.lng, marker.lat]);
		for (const line of lines) for (const c of line.coordinates) bounds.extend(c);
		map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration });
	}

	let lastFitKey = '';
	$effect(() => {
		const key = fitKey;
		if (!ready || !key || key === lastFitKey) return;
		lastFitKey = key;
		fitAll(500);
	});

	$effect(() => {
		markers;
		lines;
		if (ready) draw();
	});

	$effect(() => {
		if (ready && !fitToMarkers) map.setCenter(center);
	});

	// A caller that wants to fly somewhere — a vehicle just picked from a
	// list — passes it here; changing `center` alone would jump without
	// animation and fight fitToMarkers.
	$effect(() => {
		if (ready && flyTo) map.flyTo({ center: flyTo, zoom: Math.max(map.getZoom(), flyZoom), duration: 700 });
	});
</script>

<div
	class="relative w-full overflow-hidden rounded-card {height ? '' : 'h-full min-h-[400px]'} {className}"
	style={height ? `height:${height}; min-height:${height};` : ''}
>
	<!-- Filled via an INLINE style, deliberately, not Tailwind classes.
	     MapLibre stamps `.maplibregl-map { position: relative }` onto this very
	     element, and because its stylesheet is imported at runtime it lands
	     after Tailwind — same specificity, later wins, so `absolute` lost and
	     `inset-0` sized nothing. The div then collapsed to 0px with
	     overflow:hidden, MapLibre's `clientHeight || 300` fallback produced a
	     300px canvas, and the map was invisible with no error raised. An inline
	     style outranks any class rule, whatever order the sheets load in. -->
	<div bind:this={container} style="position:absolute; inset:0;"></div>

	{#if failed}
		<p class="absolute inset-x-3 top-3 z-[600] rounded-card bg-danger/10 px-3 py-2 text-xs text-danger">
			{failed}
		</p>
	{:else if diagnostic}
		<p class="absolute inset-x-3 top-3 z-[600] rounded-card bg-warning/15 px-3 py-2 text-xs text-ink">
			{diagnostic}
		</p>
	{/if}
</div>
