<script lang="ts">
	/**
	 * Trip Allowance — Configuration (prototype TripAllowanceConfigurationView
	 * with its three cards inlined). Read-only once saved; "Update Data"
	 * unlocks editing so values are never changed by accident.
	 */
	import { onMount } from 'svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import {
		loadTripAllowance,
		saveTripAllowance,
		tripAllowanceDefaults,
		type TripAllowanceSettings
	} from '$lib/revamp/tripAllowanceSettings';

	let { basePath: _basePath = '/t' }: { basePath?: string } = $props();

	let saved = $state<TripAllowanceSettings>(tripAllowanceDefaults());
	let form = $state<TripAllowanceSettings>(tripAllowanceDefaults());
	let exists = $state(false);
	let editable = $state(false);
	let truckTypes = $state<string[]>([]);

	function clone(s: TripAllowanceSettings): TripAllowanceSettings {
		return JSON.parse(JSON.stringify(s));
	}

	onMount(async () => {
		try {
			const r = await loadTripAllowance();
			saved = r.settings;
			exists = r.exists;
			form = clone(saved);
			// A config that's never been saved opens straight into edit mode.
			editable = !exists;
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal memuat pengaturan Trip Allowance');
		}
		try {
			// The truck types in the fleet, for the per-type ratio rows.
			const res = await api.get(ENDPOINTS.vehicles.list, { pageSize: 500 });
			const rows: any[] = res.data?.data?.items ?? res.data?.data ?? [];
			const set = new Set<string>();
			for (const v of rows) {
				const t = v.attributes?.type ?? v.attributes?.fmsVehicleType ?? v.unitType;
				if (t) set.add(String(t));
			}
			truckTypes = Array.from(set).sort();
		} catch {
			/* no fleet — the card says so */
		}
	});

	function ratioFor(type: string) {
		return form.fuel.ratioByTruckType[type] ?? '';
	}
	function setRatio(type: string, value: string) {
		form.fuel.ratioByTruckType = { ...form.fuel.ratioByTruckType, [type]: value === '' ? '' : Number(value) };
	}

	function startEdit() {
		editable = true;
	}
	function cancelEdit() {
		form = clone(saved);
		editable = false;
	}
	async function save() {
		try {
			await saveTripAllowance(form);
			saved = clone(form);
			exists = true;
			editable = false;
			toast('Pengaturan Trip Allowance berhasil disimpan');
		} catch (e: any) {
			toast(e?.response?.data?.message ?? 'Gagal menyimpan pengaturan');
		}
	}
</script>

<div class="page-head">
	<div>
		<h1>Trip Allowance — Configuration</h1>
	</div>
	{#if !editable}<span class="badge badge-active">Tersimpan · Read-only</span>{/if}
</div>

<!-- 1. Uang Bahan Bakar -->
<div class="section-title" style="margin-top:0;">
	<h2>1. Uang Bahan Bakar</h2>
</div>
<div class="card card-pad">
	<div class="option-card-row">
		<label class="option-card" class:selected={form.fuel.method === 'ratio'}>
			<div class="option-card-head">
				<input type="radio" value="ratio" bind:group={form.fuel.method} disabled={!editable} />
				<span class="option-card-title">Rasio per Jenis Kendaraan</span>
			</div>
			<div class="option-card-desc">
				Dihitung dari rasio konsumsi BBM (km/liter) tiap jenis truck, dikali harga BBM per liter.
			</div>
		</label>
		<label class="option-card" class:selected={form.fuel.method === 'perKm'}>
			<div class="option-card-head">
				<input type="radio" value="perKm" bind:group={form.fuel.method} disabled={!editable} />
				<span class="option-card-title">Biaya per KM</span>
			</div>
			<div class="option-card-desc">
				Dihitung langsung dari tarif tetap (Rp) untuk setiap km jarak tempuh, tanpa membedakan jenis truck.
			</div>
		</label>
	</div>

	{#if form.fuel.method === 'ratio'}
		<div class="option-detail">
			<div class="field" style="max-width:280px;">
				<label for="ta-price">Harga BBM per Liter (Rp)</label>
				<input
					id="ta-price"
					type="number"
					min="0"
					bind:value={form.fuel.pricePerLiter}
					placeholder="cth. 6800"
					disabled={!editable}
				/>
			</div>
			<div class="hint" style="margin:-6px 0 14px;">
				Rasio konsumsi BBM (km/liter) per jenis truck yang ada di armada Anda:
			</div>
			{#if truckTypes.length}
				{#each truckTypes as type (type)}
					<div class="ratio-row">
						<div class="ratio-label">{type}</div>
						<div class="field">
							<input
								type="number"
								min="0"
								step="0.1"
								value={ratioFor(type)}
								oninput={(e) => setRatio(type, (e.target as HTMLInputElement).value)}
								placeholder="km/liter"
								disabled={!editable}
							/>
						</div>
					</div>
				{/each}
			{:else}
				<div class="hint">
					Belum ada jenis truck di armada — tambahkan truck terlebih dahulu di My Fleet untuk mengatur rasio
					per jenis kendaraan.
				</div>
			{/if}
		</div>
	{:else}
		<div class="option-detail">
			<div class="field" style="max-width:280px; margin-bottom:0;">
				<label for="ta-perkm">Biaya per KM (Rp)</label>
				<input
					id="ta-perkm"
					type="number"
					min="0"
					bind:value={form.fuel.costPerKm}
					placeholder="cth. 2500"
					disabled={!editable}
				/>
			</div>
		</div>
	{/if}
</div>

<!-- 2. Uang Makan Driver -->
<div class="section-title">
	<h2>2. Uang Makan Driver</h2>
</div>
<div class="card card-pad">
	<div class="field" style="max-width:280px;">
		<label for="ta-meal">Nominal Uang Makan per Hari (Rp)</label>
		<input
			id="ta-meal"
			type="number"
			min="0"
			bind:value={form.meal.nominalPerDay}
			placeholder="cth. 75000"
			disabled={!editable}
		/>
	</div>

	<div class="hint" style="margin:-8px 0 12px;">Jumlah hari perjalanan dihitung dengan cara:</div>
	<div class="option-card-row">
		<label class="option-card" class:selected={form.meal.method === 'eta'}>
			<div class="option-card-head">
				<input type="radio" value="eta" bind:group={form.meal.method} disabled={!editable} />
				<span class="option-card-title">Dari ETA Perjalanan</span>
			</div>
			<div class="option-card-desc">
				Jumlah hari mengikuti estimasi waktu tempuh (ETA) pengiriman yang sudah dijadwalkan.
			</div>
		</label>
		<label class="option-card" class:selected={form.meal.method === 'km'}>
			<div class="option-card-head">
				<input type="radio" value="km" bind:group={form.meal.method} disabled={!editable} />
				<span class="option-card-title">Dari Jarak Tempuh (KM)</span>
			</div>
			<div class="option-card-desc">
				Jumlah hari dihitung manual berdasarkan kelipatan jarak tempuh tertentu.
			</div>
		</label>
	</div>

	{#if form.meal.method === 'km'}
		<div class="option-detail">
			<div class="field" style="max-width:280px; margin-bottom:0;">
				<label for="ta-kmday">Setiap Berapa KM = 1 Hari</label>
				<input
					id="ta-kmday"
					type="number"
					min="0"
					bind:value={form.meal.kmPerDay}
					placeholder="cth. 300"
					disabled={!editable}
				/>
				<div class="hint">
					Contoh: diisi 300 berarti setiap kelipatan 300 km jarak tempuh dihitung sebagai 1 hari uang makan.
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- 3. Biaya Inap -->
<div class="section-title">
	<h2>3. Biaya Inap</h2>
</div>
<div class="card card-pad">
	<div class="field" style="max-width:280px; margin-bottom:0;">
		<label for="ta-lodging">Nominal Biaya Inap per Malam (Rp)</label>
		<input
			id="ta-lodging"
			type="number"
			min="0"
			bind:value={form.lodging.nominalPerNight}
			placeholder="cth. 100000"
			disabled={!editable}
		/>
		<div class="hint">
			Total biaya inap = nominal ini × jumlah malam driver menginap selama perjalanan pengiriman.
		</div>
	</div>

	<div class="note-banner">
		<span class="ic">ℹ️</span>
		<div>
			<b>Bukan biaya prepay</b>
			<p>
				Biaya inap tidak dibayarkan di depan. Nominal ini hanya dipakai sebagai acuan saat perhitungan akhir
				dilakukan di menu <b>Reconciliation</b> setelah driver menyelesaikan perjalanan pengiriman.
			</p>
		</div>
	</div>
</div>

<div style="margin-top:24px; display:flex; justify-content:flex-end; gap:10px;">
	{#if editable}
		{#if exists}<button class="btn btn-outline" onclick={cancelEdit}>Batal</button>{/if}
		<button class="btn btn-primary" onclick={save}>Simpan Pengaturan</button>
	{:else}
		<button class="btn btn-primary" onclick={startEdit}>Update Data</button>
	{/if}
</div>
