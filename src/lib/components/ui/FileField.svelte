<script lang="ts">
	import { onMount } from 'svelte';
	import { Upload, X, FileText, Loader2 } from 'lucide-svelte';
	import {
		uploadFile,
		uploadsAvailable,
		UploadsUnavailable,
		type UploadPurpose,
		type UploadedFile
	} from '$lib/utils/upload';

	/**
	 * One file, uploaded straight to storage, binding the stored key.
	 *
	 * The parent gets a key rather than a URL: signed URLs expire, so a stored
	 * one would rot. When the service cannot sign uploads the field renders
	 * disabled with the reason, rather than letting someone pick a file and
	 * discover on submit that it went nowhere.
	 */
	let {
		value = $bindable<UploadedFile | null>(null),
		purpose,
		label,
		accept = 'application/pdf,image/jpeg,image/png',
		maxSizeMb = 10,
		hint = ''
	}: {
		value?: UploadedFile | null;
		purpose: UploadPurpose;
		label: string;
		accept?: string;
		maxSizeMb?: number;
		hint?: string;
	} = $props();

	let available = $state<boolean | null>(null);
	let progress = $state(0);
	let busy = $state(false);
	let error = $state('');
	let input = $state<HTMLInputElement>();

	onMount(async () => {
		available = await uploadsAvailable();
	});

	async function choose(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;

		error = '';
		if (file.size > maxSizeMb * 1024 * 1024) {
			error = `${file.name} is larger than ${maxSizeMb}MB.`;
			return;
		}

		busy = true;
		progress = 0;
		try {
			value = await uploadFile(file, purpose, (p) => (progress = p));
		} catch (e: any) {
			error =
				e instanceof UploadsUnavailable
					? 'File uploads are not available yet.'
					: (e?.message ?? 'The upload failed.');
		} finally {
			busy = false;
		}
	}
</script>

<div>
	<span class="form-label">
		{label}
		{#if hint}<span class="italic text-muted-dim"> — {hint}</span>{/if}
	</span>

	{#if value}
		<div class="flex items-center gap-2 rounded-input border border-line-input bg-surface px-4 py-2">
			<FileText size={14} class="shrink-0 text-cyan" />
			<span class="truncate text-xs text-ink">{value.fileName}</span>
			<span class="ml-auto shrink-0 text-xs text-muted">
				{(value.sizeBytes / 1024).toFixed(0)} KB
			</span>
			<button
				type="button"
				class="shrink-0 text-muted hover:text-danger"
				aria-label="Remove {value.fileName}"
				onclick={() => (value = null)}
			>
				<X size={14} />
			</button>
		</div>
	{:else if available === false}
		<div class="rounded-input border border-dashed border-line-input bg-canvas px-4 py-2.5">
			<p class="text-xs text-muted">
				Uploads are not available yet — the service cannot sign them.
			</p>
		</div>
	{:else}
		<button
			type="button"
			disabled={busy || available === null}
			onclick={() => input?.click()}
			class="flex h-9 w-full items-center gap-2 rounded-input border border-line-input bg-surface
			       px-4 text-xs text-muted transition-colors hover:border-cyan disabled:opacity-60"
		>
			{#if busy}
				<Loader2 size={14} class="animate-spin text-cyan" />
				Uploading… {progress}%
			{:else}
				<Upload size={14} class="text-cyan" />
				Choose a file
			{/if}
		</button>
		<input
			bind:this={input}
			type="file"
			class="hidden"
			{accept}
			onchange={(e) => choose(e.currentTarget.files)}
		/>
	{/if}

	{#if error}
		<p class="mt-1 text-xs text-danger" role="alert">{error}</p>
	{/if}
</div>
