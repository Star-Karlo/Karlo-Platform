<script lang="ts">
	/**
	 * Finance — COA (prototype MasterDataCoaView) against /ledger/accounts.
	 * System accounts are the ones the automatic postings route through;
	 * the service refuses to edit or delete them.
	 */
	import { onMount } from 'svelte';
	import { Lock, Pencil, Trash2 } from 'lucide-svelte';
	import { toast } from '$lib/stores/ui';
	import { ledger, type CoaAccount } from '$lib/stores/ledger';
	import { COA_TYPE_OPTIONS, coaTypeLabel } from '$lib/revamp/coaTypes.js';
	import FieldSelect from '$lib/components/revamp/FieldSelect.svelte';
	import ConfirmModal from '$lib/components/revamp/ConfirmModal.svelte';

	let { basePath: _basePath = '/t' }: { basePath?: string } = $props();

	let items = $state<CoaAccount[]>([]);
	let loaded = $state(false);
	let accounts = $derived([...items].sort((a, b) => a.kode.localeCompare(b.kode)));

	async function load() {
		try {
			items = await ledger.accounts();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat Chart of Account');
		} finally {
			loaded = true;
		}
	}
	onMount(load);

	let showModal = $state(false);
	let editing = $state<CoaAccount | null>(null);
	let saving = $state(false);
	let form = $state({ kode: '', nama: '', tipe: '' });

	function resetForm() {
		form = { kode: '', nama: '', tipe: '' };
	}
	function openAdd() {
		editing = null;
		resetForm();
		showModal = true;
	}
	function openEdit(a: CoaAccount) {
		if (a.isSystem) return;
		editing = a;
		form = { kode: a.kode, nama: a.nama, tipe: a.tipe };
		showModal = true;
	}
	function closeModal() {
		showModal = false;
	}
	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeModal();
	}

	async function submit() {
		if (!form.kode.trim() || !form.nama.trim() || !form.tipe) {
			toast('Kode, Nama Akun, dan Tipe wajib diisi');
			return;
		}
		if (!editing && accounts.some((a) => a.kode === form.kode.trim())) {
			toast('Kode akun sudah digunakan');
			return;
		}
		saving = true;
		try {
			const payload = { kode: form.kode.trim(), nama: form.nama.trim(), tipe: form.tipe };
			if (editing) {
				await ledger.updateAccount(editing.id, payload);
				toast('Akun berhasil diperbarui');
			} else {
				await ledger.addAccount(payload);
				toast('Akun baru berhasil ditambahkan');
			}
			await load();
			closeModal();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan akun');
		} finally {
			saving = false;
		}
	}

	let removing = $state<CoaAccount | null>(null);
	let removeBusy = $state(false);
	function remove(a: CoaAccount) {
		if (a.isSystem) return;
		removing = a;
	}
	async function confirmRemove() {
		if (!removing) return;
		removeBusy = true;
		try {
			await ledger.deleteAccount(removing.id);
			toast('Akun dihapus');
			removing = null;
			await load();
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menghapus akun');
		} finally {
			removeBusy = false;
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Finance — COA</h1>
	</div>
	<button class="btn btn-primary" onclick={openAdd}>+ Tambah Akun</button>
</div>

{#if loaded && !accounts.length}
	<div class="card card-pad">
		<div class="empty">
			<div class="eic">📒</div>
			Belum ada akun.<br />
			<button class="btn btn-primary" style="margin-top:14px;" onclick={openAdd}>+ Tambah Akun</button>
		</div>
	</div>
{:else if loaded}
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Kode</th>
					<th>Nama Akun</th>
					<th>Tipe</th>
					<th>Sumber</th>
					<th>Aksi</th>
				</tr>
			</thead>
			<tbody>
				{#each accounts as a (a.id)}
					<tr>
						<td class="mono">{a.kode}</td>
						<td><b>{a.nama}</b></td>
						<td>{coaTypeLabel(a.tipe)}</td>
						<td>
							<span class="badge" class:badge-planner={a.isSystem} class:badge-self={!a.isSystem}>
								{#if a.isSystem}<Lock size={12} />{/if}
								{a.isSystem ? 'Sistem' : 'Custom'}
							</span>
						</td>
						<td>
							{#if !a.isSystem}
								<div class="action-cell">
									<button class="mini-icon-btn" title="Edit" onclick={() => openEdit(a)}
										><Pencil size={14} /></button
									>
									<button class="mini-icon-btn-del" title="Hapus" onclick={() => remove(a)}
										><Trash2 size={14} /></button
									>
								</div>
							{:else}
								<span class="hint">Tidak dapat diubah</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if showModal}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box" role="dialog" aria-modal="true">
			<h3>{editing ? 'Edit Akun' : 'Tambah Akun'}</h3>

			<div class="field">
				<label for="coa-kode">Kode Akun <span class="req">*</span></label>
				<input
					id="coa-kode"
					type="text"
					bind:value={form.kode}
					disabled={!!editing}
					placeholder="cth. 5-3000"
				/>
			</div>
			<div class="field">
				<label for="coa-nama">Nama Akun <span class="req">*</span></label>
				<input id="coa-nama" type="text" bind:value={form.nama} placeholder="cth. Beban Marketing" />
			</div>
			<div class="field">
				<label for="coa-tipe">Tipe Akun <span class="req">*</span></label>
				<FieldSelect bind:value={form.tipe} options={COA_TYPE_OPTIONS} placeholder="Pilih tipe akun" />
			</div>

			<div class="modal-actions">
				<button class="btn btn-outline" onclick={closeModal}>Batal</button>
				<button class="btn btn-primary" disabled={saving} onclick={submit}>
					{saving ? 'Menyimpan...' : 'Simpan'}
				</button>
			</div>
		</div>
	</div>
{/if}

<ConfirmModal
	open={!!removing}
	title="Hapus Akun?"
	message={`Akun <b>${removing?.nama ?? ''}</b> akan dihapus permanen dari Chart of Account. Tindakan ini tidak dapat dibatalkan.`}
	confirmLabel="Ya, Hapus"
	danger={true}
	busy={removeBusy}
	onConfirm={confirmRemove}
	onClose={() => (removing = null)}
/>
