<script lang="ts" module>
	export interface Column {
		key: string;
		label: string;
		/** Plain-text derivation for the cell. Escaped on render — never HTML. */
		format?: (row: any) => string | number;
		width?: string;
		align?: 'left' | 'right' | 'center';
		sortable?: boolean;
	}
</script>

<script lang="ts">
	import { ChevronsUpDown, Inbox } from 'lucide-svelte';
	import Spinner from './Spinner.svelte';

	/**
	 * The one table component: navy header, 12px muted cells, zebra body,
	 * horizontal scroll inside the card.
	 *
	 * Cells render as text. A column that needs markup — a badge, an avatar, a
	 * row of action icons — supplies it through the `cell` snippet, which
	 * receives (row, column). This is deliberate: the previous version rendered
	 * column output with {@html}, which put unescaped API strings straight into
	 * the page.
	 */
	let {
		columns,
		data = [],
		loading = false,
		page = 0,
		pageSize = 20,
		totalRows = 0,
		emptyMessage = 'No data available',
		onPageChange,
		onPageSizeChange,
		onSort,
		onRowClick,
		cell
	}: {
		columns: Column[];
		data: any[];
		loading?: boolean;
		page?: number;
		pageSize?: number;
		totalRows?: number;
		emptyMessage?: string;
		onPageChange?: (page: number) => void;
		onPageSizeChange?: (pageSize: number) => void;
		onSort?: (key: string) => void;
		onRowClick?: (row: any) => void;
		cell?: any;
	} = $props();

	let totalPages = $derived(Math.max(1, Math.ceil(totalRows / pageSize)));
	let firstRow = $derived(totalRows === 0 ? 0 : page * pageSize + 1);
	let lastRow = $derived(Math.min((page + 1) * pageSize, totalRows));

	const ALIGN: Record<string, string> = {
		left: 'text-left',
		right: 'text-right',
		center: 'text-center'
	};

	function valueOf(row: any, column: Column): string {
		const raw = column.format ? column.format(row) : row[column.key];
		return raw === undefined || raw === null || raw === '' ? '-' : String(raw);
	}
</script>

<div class="card" style="overflow:hidden;">
	<div class="table-wrap" style="border:none; border-radius:0;">
		<table>
			<thead>
				<tr>
					{#each columns as column}
						<th
							class={ALIGN[column.align ?? 'left']}
							style={column.width ? `width:${column.width}` : ''}
						>
							{#if column.sortable && onSort}
								<button
									type="button"
									class="inline-flex items-center gap-1 hover:opacity-80"
									onclick={() => onSort?.(column.key)}
								>
									{column.label}
									<ChevronsUpDown size={12} />
								</button>
							{:else}
								{column.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if loading}
					<tr>
						<td colspan={columns.length} class="py-10 text-center">
							<Spinner />
						</td>
					</tr>
				{:else if data.length === 0}
					<tr>
						<td colspan={columns.length} class="px-5 py-16 text-center">
							<span
								class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zebra text-muted"
								aria-hidden="true"
							>
								<Inbox size={18} />
							</span>
							<p class="text-xs text-muted">{emptyMessage}</p>
						</td>
					</tr>
				{:else}
					{#each data as row, index}
						<tr
							style={onRowClick ? 'cursor:pointer;' : ''}
							onclick={() => onRowClick?.(row)}
						>
							{#each columns as column}
								<td class={ALIGN[column.align ?? 'left']}>
									{#if cell}
										{@render cell(row, column, valueOf(row, column))}
									{:else}
										{valueOf(row, column)}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				{/if}
			</tbody>
		</table>
	</div>

	<div
		class="flex flex-wrap items-center justify-between gap-4 border-t border-line-card px-5 py-3 text-xs text-muted"
	>
		<div class="flex items-center gap-4">
			<span>Total: <span class="font-medium text-ink">{totalRows}</span></span>
			{#if onPageSizeChange}
				<label class="flex items-center gap-2">
					Rows
					<select
						class="h-8 rounded-input border border-line-input bg-surface px-2 text-xs text-ink"
						value={pageSize}
						onchange={(e) => onPageSizeChange?.(Number(e.currentTarget.value))}
					>
						{#each [10, 20, 50, 100] as size}
							<option value={size}>{size}</option>
						{/each}
					</select>
				</label>
			{/if}
		</div>

		<div class="flex items-center gap-2">
			<!-- Named buttons rather than four chevrons. On a list that fits one
			     page the arrows all look alike and disabled; "Prev" and "Next"
			     say what they do, and the count between them says where you are. -->
			<button
				type="button"
				class="rounded-btn border border-line-input px-3 py-1.5 text-xs font-medium text-navy
				       transition-colors hover:border-cyan hover:text-cyan disabled:opacity-40
				       disabled:hover:border-line-input disabled:hover:text-navy"
				disabled={page === 0}
				onclick={() => onPageChange?.(page - 1)}
			>
				Prev
			</button>
			<span class="px-1">{page + 1} / {totalPages}</span>
			<button
				type="button"
				class="rounded-btn border border-line-input px-3 py-1.5 text-xs font-medium text-navy
				       transition-colors hover:border-cyan hover:text-cyan disabled:opacity-40
				       disabled:hover:border-line-input disabled:hover:text-navy"
				disabled={page >= totalPages - 1}
				onclick={() => onPageChange?.(page + 1)}
			>
				Next
			</button>
		</div>
	</div>
</div>
