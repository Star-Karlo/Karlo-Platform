<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Truck as TruckIcon, ArrowLeft } from 'lucide-svelte';
	import { truckActions } from '$lib/stores/trucks';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { asOptions, catalog, loadCatalogs } from '$lib/stores/catalog';
	import { Button, Card, FileField, Input, PageHeader, Select, Spinner, Toggle } from '$lib/components/ui';
	import type { UploadedFile } from '$lib/utils/upload';

	/**
	 * Add / edit a truck.
	 *
	 * Documents and photos upload straight to storage and are persisted as keys
	 * on `documents`, which the service models as a free-form object.
	 *
	 * Still absent: hull number, current city, axle, colour, bed dimensions and
	 * max cargo weight/volume. Those are not on the truck model and are being
	 * added as real columns as part of the master-data merge, so they are not
	 * smuggled into `documents` here.
	 */
	let { basePath, id = '' }: { basePath: string; id?: string } = $props();

	let loading = $state(true);
	let saving = $state(false);
	let error = $state('');

	let form = $state({
		policeNumber: '',
		chassisNumber: '',
		engineNumber: '',
		year: '',
		truckTypeId: '',
		truckHeadId: '',
		truckBodyId: '',
		brandId: '',
		status: 'active' as 'active' | 'maintenance' | 'inactive',
		isAvailable: true,
		driverIds: [] as string[],
		stnkNumber: '',
		stnkValidFrom: '',
		stnkValidUntil: '',
		kirNumber: '',
		kirValidFrom: '',
		kirValidUntil: ''
	});

	/** Uploaded files, held as storage keys until the truck is saved. */
	let docs = $state<Record<string, UploadedFile | null>>({
		stnk: null,
		kir: null,
		photoFront: null,
		photoBack: null,
		photoRight: null,
		photoLeft: null
	});

	let drivers = $state<{ value: string; label: string }[]>([]);

	onMount(async () => {
		await loadCatalogs(['truckType', 'truckHead', 'truckBody', 'brand']);
		try {
			const res = await api.get(ENDPOINTS.users.list, { page: 0, pageSize: 200 });
			drivers = (res.data.data ?? [])
				.filter((u: any) => (u.role ?? '').toLowerCase() === 'driver')
				.map((u: any) => ({ value: u.id, label: u.fullName ?? u.username ?? u.email }));
		} catch {
			drivers = [];
		}

		if (id) {
			try {
				const res = await api.get(ENDPOINTS.trucks.one(id));
				const t = res.data.data;
				form = {
					policeNumber: t.policeNumber ?? '',
					chassisNumber: t.chassisNumber ?? '',
					engineNumber: t.engineNumber ?? '',
					year: t.year ? String(t.year) : '',
					truckTypeId: t.truckTypeId ?? '',
					truckHeadId: t.truckHeadId ?? '',
					truckBodyId: t.truckBodyId ?? '',
					brandId: t.brandId ?? '',
					status: (t.status ?? 'active') as 'active' | 'maintenance' | 'inactive',
					isAvailable: t.isAvailable ?? true,
					driverIds: t.driverIds ?? [],
					stnkNumber: t.documents?.stnkNumber ?? '',
					stnkValidFrom: t.documents?.stnkValidFrom ?? '',
					stnkValidUntil: t.documents?.stnkValidUntil ?? '',
					kirNumber: t.documents?.kirNumber ?? '',
					kirValidFrom: t.documents?.kirValidFrom ?? '',
					kirValidUntil: t.documents?.kirValidUntil ?? ''
				};
				for (const slot of Object.keys(docs)) {
					docs[slot] = t.documents?.[slot] ?? null;
				}
			} catch {
				error = 'Could not load this truck.';
			}
		}
		loading = false;
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (!form.policeNumber.trim()) {
			error = 'A police number is required.';
			return;
		}
		saving = true;
		error = '';
		const {
			stnkNumber, stnkValidFrom, stnkValidUntil,
			kirNumber, kirValidFrom, kirValidUntil,
			...truck
		} = form;

		const payload = {
			...truck,
			// The service expects a number; an empty field means "not recorded".
			year: form.year ? Number(form.year) : undefined,
			// `documents` is a free-form object on the model. Files are stored as
			// keys, never as URLs — a signed URL expires and would rot on the record.
			documents: {
				stnkNumber: stnkNumber || undefined,
				stnkValidFrom: stnkValidFrom || undefined,
				stnkValidUntil: stnkValidUntil || undefined,
				kirNumber: kirNumber || undefined,
				kirValidFrom: kirValidFrom || undefined,
				kirValidUntil: kirValidUntil || undefined,
				...Object.fromEntries(Object.entries(docs).filter(([, f]) => f))
			}
		};
		try {
			if (id) await truckActions.update(id, payload);
			else await truckActions.create(payload);
			goto(basePath);
		} catch (e: any) {
			error = e?.response?.data?.message ?? 'Could not save this truck.';
			saving = false;
		}
	}
</script>

<div class="space-y-gutter">
	<PageHeader title={id ? 'Edit Truck' : 'Add Truck'} icon={TruckIcon}>
		{#snippet actions()}
			<Button variant="ghost" href={basePath}><ArrowLeft size={14} /> Back</Button>
		{/snippet}
	</PageHeader>

	{#if error}
		<p class="rounded-card bg-danger/10 px-4 py-3 text-xs text-danger" role="alert">{error}</p>
	{/if}

	{#if loading}
		<div class="flex justify-center py-16"><Spinner size={32} /></div>
	{:else}
		<form onsubmit={submit} class="space-y-gutter">
			<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
				<Card title="Info Kendaraan">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="md:col-span-2">
							<label for="policeNumber" class="form-label">
								No Plat Polisi Truk <span class="req">*</span>
							</label>
							<Input id="policeNumber" bind:value={form.policeNumber} placeholder="B 1234 XYZ" />
						</div>
						<div>
							<label for="truckTypeId" class="form-label">Truck Type</label>
							<Select id="truckTypeId" bind:value={form.truckTypeId} options={asOptions($catalog.truckType)} placeholder="Pilih tipe truk" />
						</div>
						<div>
							<label for="truckHeadId" class="form-label">Truck Head</label>
							<Select id="truckHeadId" bind:value={form.truckHeadId} options={asOptions($catalog.truckHead)} placeholder="Pilih truck head" />
						</div>
						<div>
							<label for="truckBodyId" class="form-label">Truck Body</label>
							<Select id="truckBodyId" bind:value={form.truckBodyId} options={asOptions($catalog.truckBody)} placeholder="Pilih body" />
						</div>
						<div>
							<label for="brandId" class="form-label">Brand</label>
							<Select id="brandId" bind:value={form.brandId} options={asOptions($catalog.brand)} placeholder="Masukkan nama brand" />
						</div>
					</div>
				</Card>

				<Card title="Detail Kendaraan">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div>
							<label for="chassisNumber" class="form-label">No Rangka</label>
							<Input id="chassisNumber" bind:value={form.chassisNumber} />
						</div>
						<div>
							<label for="engineNumber" class="form-label">No Mesin</label>
							<Input id="engineNumber" bind:value={form.engineNumber} />
						</div>
						<div>
							<label for="year" class="form-label">Tahun</label>
							<Input id="year" type="number" bind:value={form.year} placeholder="2021" />
						</div>
						<div>
							<label for="status" class="form-label">Status</label>
							<Select
								id="status"
								bind:value={form.status}
								placeholder="Pilih status"
								options={[
									{ value: 'active', label: 'Active' },
									{ value: 'maintenance', label: 'Maintenance' },
									{ value: 'inactive', label: 'Inactive' }
								]}
							/>
						</div>
						<div class="md:col-span-2">
							<span class="mb-2 block text-xs text-muted">Tersedia untuk order</span>
							<Toggle bind:checked={form.isAvailable} ariaLabel="Available for orders" />
						</div>
					</div>
				</Card>
			</div>

			<Card title="Driver">
				{#if drivers.length === 0}
					<p class="text-xs text-muted">
						No driver accounts in this company yet. A truck can be saved without one and paired
						later.
					</p>
				{:else}
					<div class="grid grid-cols-1 gap-2 md:grid-cols-3">
						{#each drivers as driver}
							<label class="flex items-center gap-2 rounded-nav border border-line-card p-3 text-xs">
								<input
									type="checkbox"
									class="accent-cyan"
									checked={form.driverIds.includes(driver.value)}
									onchange={(e) => {
										form.driverIds = e.currentTarget.checked
											? [...form.driverIds, driver.value]
											: form.driverIds.filter((d) => d !== driver.value);
									}}
								/>
								{driver.label}
							</label>
						{/each}
					</div>
				{/if}
			</Card>

			<div class="grid grid-cols-1 gap-gutter lg:grid-cols-2">
				<Card title="Surat Kendaraan">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<div class="md:col-span-2">
							<FileField bind:value={docs.stnk} purpose="truckDocument" label="Foto STNK" hint="PDF or image" />
						</div>
						<div class="md:col-span-2">
							<label for="stnkNumber" class="form-label">No STNK</label>
							<Input id="stnkNumber" bind:value={form.stnkNumber} />
						</div>
						<div>
							<label for="stnkFrom" class="form-label">Periode Aktif STNK — From</label>
							<Input id="stnkFrom" type="date" bind:value={form.stnkValidFrom} />
						</div>
						<div>
							<label for="stnkUntil" class="form-label">Sampai</label>
							<Input id="stnkUntil" type="date" bind:value={form.stnkValidUntil} />
						</div>

						<div class="md:col-span-2">
							<FileField bind:value={docs.kir} purpose="truckDocument" label="Foto KIR BED" hint="PDF or image" />
						</div>
						<div class="md:col-span-2">
							<label for="kirNumber" class="form-label">No KIR BED</label>
							<Input id="kirNumber" bind:value={form.kirNumber} />
						</div>
						<div>
							<label for="kirFrom" class="form-label">Periode Aktif KIR — From</label>
							<Input id="kirFrom" type="date" bind:value={form.kirValidFrom} />
						</div>
						<div>
							<label for="kirUntil" class="form-label">Sampai</label>
							<Input id="kirUntil" type="date" bind:value={form.kirValidUntil} />
						</div>
					</div>
				</Card>

				<Card title="Fisik Kendaraan">
					<div class="grid grid-cols-1 gap-4">
						<FileField bind:value={docs.photoFront} purpose="truckPhoto" label="Foto Truk (Tampak Depan)" accept="image/jpeg,image/png" />
						<FileField bind:value={docs.photoBack} purpose="truckPhoto" label="Foto Truk (Tampak Belakang)" accept="image/jpeg,image/png" />
						<FileField bind:value={docs.photoRight} purpose="truckPhoto" label="Foto Truk (Tampak Kanan)" accept="image/jpeg,image/png" />
						<FileField bind:value={docs.photoLeft} purpose="truckPhoto" label="Foto Truk (Tampak Kiri)" accept="image/jpeg,image/png" />
					</div>
					<p class="mt-4 text-xs italic text-muted">
						Hull number, current city, axle, colour, bed dimensions and maximum cargo
						weight/volume are not on the truck model yet — they are being added as real
						columns rather than stored here.
					</p>
				</Card>
			</div>

			<div class="flex justify-end gap-3">
				<Button variant="outline" href={basePath}>Cancel</Button>
				<Button type="submit" variant="primary" loading={saving}>
					{id ? 'Save Changes' : 'Confirm'}
				</Button>
			</div>
		</form>
	{/if}
</div>
