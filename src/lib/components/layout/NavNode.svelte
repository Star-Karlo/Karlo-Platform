<script lang="ts">
	/**
	 * One navigation entry, at any depth.
	 *
	 * Recursive because the tree is now three deep — Master Data > Vehicles >
	 * Truck Head — and the previous version rendered exactly two levels, so a
	 * grandchild silently did not appear. A component that calls itself cannot
	 * develop that kind of blind spot.
	 */
	import { ChevronDown, ExternalLink } from 'lucide-svelte';
	import type { NavItem } from '$lib/constants/nav';
	import NavNode from './NavNode.svelte';

	let {
		item,
		depth = 0,
		collapsed = false,
		pathname = '',
		open,
		onToggle
	}: {
		item: NavItem;
		depth?: number;
		collapsed?: boolean;
		pathname?: string;
		open: Record<string, boolean>;
		onToggle: (name: string, next: boolean) => void;
	} = $props();

	const Icon = $derived(item.icon);

	function isActive(url?: string): boolean {
		if (!url) return false;
		return pathname === url || pathname.startsWith(url + '/');
	}

	/** True when this branch contains the current page, at any depth. */
	function containsActive(node: NavItem): boolean {
		if (isActive(node.url)) return true;
		return (node.children ?? []).some(containsActive);
	}

	let expanded = $derived(open[item.name] ?? containsActive(item));
	let active = $derived(isActive(item.url));

	// Indentation comes from .nav-sub's own padding in the ported stylesheet,
	// so depth is used only to choose between a top-level and a sub link.
</script>

{#if item.dividerBefore}
	<div style="height:1px; background:var(--outline-variant); margin:10px 4px;"></div>
{/if}

{#if item.children && item.children.length > 0}
	<button
		type="button"
		onclick={() => onToggle(item.name, !expanded)}
		title={collapsed ? item.name : undefined}
		class="nav-parent {containsActive(item) ? 'active' : ''} {expanded ? 'open' : ''}"
	>
		<span class="nav-icon">{#if Icon}<Icon size={18} />{/if}</span>
		{#if !collapsed}
			<span class="nav-label">{item.name}</span>
			<span class="chev"><ChevronDown size={14} /></span>
		{/if}
	</button>

	{#if expanded && !collapsed}
		<div class="nav-sub" style="max-height:600px; opacity:1;">
			{#each item.children as child (child.name)}
				<NavNode item={child} depth={depth + 1} {collapsed} {pathname} {open} {onToggle} />
			{/each}
		</div>
	{/if}
{:else if item.external}
	<!-- Leaves the app entirely, so it says so and opens in its own tab rather
	     than replacing the console the person is working in. -->
	<a
		href={item.url}
		target="_blank"
		rel="noopener noreferrer"
		title={collapsed ? item.name : undefined}
		class={depth > 0 ? 'sub-link' : ''}
	>
		{#if depth === 0}<span class="nav-icon">{#if Icon}<Icon size={18} />{/if}</span>{/if}
		{#if !collapsed}
			<span class="nav-label">{item.name}</span>
			<ExternalLink size={12} style="margin-left:auto; flex-shrink:0; opacity:.6;" />
		{/if}
	</a>
{:else}
	<a
		href={item.url}
		title={collapsed ? item.name : undefined}
		class={depth > 0 ? `sub-link ${active ? 'sub-active' : ''}` : active ? 'active' : ''}
	>
		{#if depth === 0}<span class="nav-icon">{#if Icon}<Icon size={18} />{/if}</span>{/if}
		{#if !collapsed}<span class="nav-label">{item.name}</span>{/if}
	</a>
{/if}
