<script lang="ts">
	/**
	 * Port of WarehouseFormModal.vue ("Tambah Warehouse"). The Leaflet picker
	 * is replaced by the console's MapView (click to place the pin); the
	 * Nominatim address search is omitted.
	 */
	import { onMount } from 'svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { MapView } from '$lib/components/ui';
	import FieldSelect from './FieldSelect.svelte';

	export type SavedWarehouse = {
		id: string;
		name: string;
		city: string;
		address: string;
		picName: string;
		latitude: number | null;
		longitude: number | null;
	};

	let {
		show = $bindable(false),
		editing = null,
		onSaved
	}: {
		show?: boolean;
		editing?: Record<string, any> | null;
		onSaved?: (w: SavedWarehouse) => void;
	} = $props();

	/** Company members whose TMS role is warehousePic — the prototype's `warehousePics` list. */
	let picOptions = $state<{ value: string; label: string }[]>([]);
	onMount(async () => {
		try {
			const res = await api.get(ENDPOINTS.users.list, { page: 0, pageSize: 200 });
			picOptions = (res.data.data ?? [])
				.filter((u: any) => (u.role ?? '').toLowerCase() === 'warehousepic')
				.map((u: any) => {
					const nama = u.fullName ?? u.username ?? u.email ?? '';
					return { value: nama, label: nama };
				});
		} catch {
			picOptions = [];
		}
	});

	let saving = $state(false);
	let form = $state({
		nama: '',
		kota: '',
		alamat: '',
		pic: '',
		lat: null as number | null,
		lng: null as number | null
	});

	function resetForm() {
		form.nama = '';
		form.kota = '';
		form.alamat = '';
		form.pic = '';
		form.lat = null;
		form.lng = null;
	}

	$effect(() => {
		if (!show) return;
		if (editing) {
			form.nama = editing.name || '';
			form.kota = editing.city || '';
			form.alamat = editing.address || '';
			form.pic = editing.picName || '';
			form.lat = editing.latitude ?? null;
			form.lng = editing.longitude ?? null;
		} else {
			resetForm();
		}
	});

	function close() {
		show = false;
	}
	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}

	function onPick([lng, lat]: [number, number]) {
		form.lat = lat;
		form.lng = lng;
	}

	// ---------- Address search (geocode) ----------
	// The prototype's flow: type an address or place, search, the pin lands
	// there, then click the map to fine-tune. Nominatim (OpenStreetMap), as
	// the prototype used, restricted to Indonesia; a handful of matches
	// rather than the first one, since "Gudang Priok" is rarely unique.
	let searchQuery = $state('');
	let searching = $state(false);
	let searchError = $state('');
	let results = $state<{ lat: number; lon: number; label: string }[]>([]);
	let flyTo = $state<[number, number] | null>(null);

	async function onSearch() {
		const q = searchQuery.trim();
		if (!q) return;
		searching = true;
		searchError = '';
		results = [];
		try {
			const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=id&q=${encodeURIComponent(q)}`;
			const res = await fetch(url, { headers: { Accept: 'application/json' } });
			const rows: any[] = await res.json();
			if (!rows.length) {
				searchError = 'Lokasi tidak ditemukan, coba kata kunci lain.';
				return;
			}
			results = rows.map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.display_name }));
			if (results.length === 1) choose(results[0]);
		} catch {
			searchError = 'Gagal mencari lokasi. Cek koneksi internet.';
		} finally {
			searching = false;
		}
	}
	function choose(r: { lat: number; lon: number; label: string }) {
		form.lat = r.lat;
		form.lng = r.lon;
		flyTo = [r.lon, r.lat];
		if (!form.alamat.trim()) form.alamat = r.label;
		results = [];
	}

	let markers = $derived(
		form.lat != null && form.lng != null
			? [{ id: 'picked', lat: form.lat, lng: form.lng, title: form.nama || 'Warehouse' }]
			: []
	);
	let mapCenter = $derived<[number, number]>(
		form.lat != null && form.lng != null ? [form.lng, form.lat] : [118, -2.5]
	);
	let mapZoom = $derived(form.lat != null && form.lng != null ? 16 : 5);

	async function submit() {
		if (!form.nama.trim()) {
			toast('Nama Warehouse wajib diisi');
			return;
		}
		if (!form.kota.trim()) {
			toast('Kota wajib diisi');
			return;
		}
		saving = true;
		try {
			const payload = {
				name: form.nama.trim(),
				siteType: 'warehouse',
				city: form.kota.trim().toUpperCase(),
				address: form.alamat.trim(),
				picName: form.pic,
				latitude: form.lat,
				longitude: form.lng
			};
			let id: string;
			if (editing) {
				id = editing.id;
				await api.put(ENDPOINTS.warehouses.update(id), payload);
				toast('Data warehouse berhasil diperbarui');
			} else {
				const res = await api.post(ENDPOINTS.warehouses.create, payload);
				id = res.data.data?.id;
				toast('Warehouse baru berhasil ditambahkan');
			}
			onSaved?.({ id, ...payload });
			close();
		} catch (e: any) {
			toast(e?.response?.data?.message || 'Gagal menyimpan warehouse, silakan coba lagi');
		} finally {
			saving = false;
		}
	}
</script>

{#if show}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={onOverlayClick}>
		<div class="modal-box modal-box-lg" role="dialog" aria-modal="true">
			<h3>{editing ? 'Edit Warehouse' : 'Tambah Warehouse'}</h3>

			<div class="modal-scroll-body">
				<div class="two-col">
					<div class="field">
						<label>Nama Warehouse <span class="req">*</span></label>
						<input type="text" bind:value={form.nama} placeholder="cth. Gudang Priok" />
					</div>
					<div class="field">
						<label>Kota <span class="req">*</span></label>
						<input type="text" bind:value={form.kota} placeholder="cth. Kota Jakarta Utara" />
					</div>
				</div>

				<div class="field">
					<label>Titik Lokasi di Peta</label>
					<div class="map-picker">
						<div class="map-picker-search">
							<input
								type="text"
								bind:value={searchQuery}
								placeholder="Cari alamat atau nama tempat, cth. Pelabuhan Tanjung Priok"
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										void onSearch();
									}
								}}
							/>
							<button type="button" class="btn btn-outline btn-sm" disabled={searching} onclick={onSearch}>
								{searching ? 'Mencari...' : 'Cari'}
							</button>
						</div>
						{#if searchError}<div class="map-picker-error">{searchError}</div>{/if}
						{#if results.length > 1}
							<ul class="map-picker-results">
								{#each results as r (r.label)}
									<li><button type="button" onclick={() => choose(r)}>{r.label}</button></li>
								{/each}
							</ul>
						{/if}
						<MapView
							center={mapCenter}
							zoom={mapZoom}
							{markers}
							height="260px"
							{onPick}
							{flyTo}
							flyZoom={16}
						/>
						<div class="hint" style="margin-top:6px;">
							Cari alamat untuk menempatkan pin, lalu klik peta untuk menyesuaikan titik lokasi secara manual.
						</div>
					</div>
				</div>

				<div class="two-col latlng-display">
					<div class="field">
						<label>Latitude</label>
						<input type="text" value={form.lat ?? ''} placeholder="Belum ditentukan" readonly />
					</div>
					<div class="field">
						<label>Longitude</label>
						<input type="text" value={form.lng ?? ''} placeholder="Belum ditentukan" readonly />
					</div>
				</div>

				<div class="field">
					<label>Alamat Lengkap</label>
					<input
						type="text"
						bind:value={form.alamat}
						placeholder="Jl. Yos Sudarso No.88, Kec. Tanjung Priok..."
					/>
				</div>

				<div class="field" style="margin-bottom:0;">
					<label>Nama PIC</label>
					<FieldSelect
						bind:value={form.pic}
						options={picOptions}
						placeholder="Pilih PIC dari PIC Warehouse List"
					/>
				</div>
			</div>

			<div class="modal-actions">
				<button class="btn btn-outline" onclick={close}>Batal</button>
				<button class="btn btn-primary" disabled={saving} onclick={submit}>
					{saving ? 'Menyimpan...' : 'Simpan'}
				</button>
			</div>
		</div>
	</div>
{/if}
