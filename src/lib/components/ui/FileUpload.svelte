<script lang="ts">
	import { Upload, X } from 'lucide-svelte';

	let {
		accept = 'image/*,.pdf',
		maxSize = 5,
		multiple = false,
		onUpload
	}: {
		accept?: string;
		maxSize?: number;
		multiple?: boolean;
		onUpload?: (files: File[]) => void;
	} = $props();

	let files: File[] = $state([]);
	let dragover = $state(false);
	let error = $state('');
	let input: HTMLInputElement;

	function handleFiles(fileList: FileList | null) {
		if (!fileList) return;
		error = '';
		const accepted: File[] = [];

		for (const file of fileList) {
			if (file.size > maxSize * 1024 * 1024) {
				error = `${file.name} exceeds the ${maxSize}MB limit`;
				continue;
			}
			accepted.push(file);
		}

		files = multiple ? [...files, ...accepted] : accepted;
		onUpload?.(files);
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		onUpload?.(files);
	}
</script>

<div
	role="button"
	tabindex="0"
	aria-label="Upload files"
	class="rounded-card border-2 border-dashed p-6 text-center transition-colors
	       {dragover ? 'border-cyan bg-cyan-soft' : 'border-line-input hover:border-cyan'}"
	ondragover={(e) => {
		e.preventDefault();
		dragover = true;
	}}
	ondragleave={() => (dragover = false)}
	ondrop={(e) => {
		e.preventDefault();
		dragover = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}}
	onclick={() => input.click()}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && input.click()}
>
	<Upload size={22} class="mx-auto mb-2 text-muted" />
	<p class="text-xs text-ink">
		Drag & drop files, or <span class="text-cyan underline">browse</span>
	</p>
	<p class="mt-1 text-xs text-muted">Max {maxSize}MB per file</p>
	<input
		bind:this={input}
		type="file"
		class="hidden"
		{accept}
		{multiple}
		onchange={(e) => handleFiles(e.currentTarget.files)}
	/>
</div>

{#if error}
	<p class="mt-2 text-xs text-danger" role="alert">{error}</p>
{/if}

{#if files.length > 0}
	<ul class="mt-3 space-y-2">
		{#each files as file, i}
			<li class="flex items-center justify-between rounded-nav bg-canvas px-3 py-2">
				<span class="truncate text-xs text-ink">{file.name}</span>
				<button
					class="text-muted hover:text-danger"
					aria-label="Remove {file.name}"
					onclick={() => removeFile(i)}
				>
					<X size={14} />
				</button>
			</li>
		{/each}
	</ul>
{/if}
