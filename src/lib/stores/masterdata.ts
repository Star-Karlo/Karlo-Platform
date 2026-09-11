import { writable, get } from 'svelte/store';
import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/** One entry of a reference list. */
export interface CatalogEntry {
	id: string;
	kind: string;
	/** Absent on a platform-global entry; set on a company's private one. */
	companyId?: string;
	code?: string;
	name: string;
	description?: string;
	active: boolean;
	/** Everything the list carries beyond the shared fields. */
	attributes?: Record<string, unknown>;
	createdAt?: string;
	updatedAt?: string;
}

interface MasterDataState {
	entries: CatalogEntry[];
	total: number;
	page: number;
	pageSize: number;
	loading: boolean;
	saving: boolean;
	error: string;
}

const EMPTY: MasterDataState = {
	entries: [], total: 0, page: 0, pageSize: 20,
	loading: false, saving: false, error: ''
};

export const masterDataStore = writable<MasterDataState>({ ...EMPTY });

function message(e: any, fallback: string): string {
	return e?.response?.data?.message ?? fallback;
}

export const masterDataActions = {
	async list(kind: string, page = 0, search = '') {
		masterDataStore.update((s) => ({ ...s, loading: true, error: '' }));
		try {
			const res = await api.get(ENDPOINTS.catalog.list(kind), {
				page,
				pageSize: get(masterDataStore).pageSize,
				search: search || undefined
			});
			masterDataStore.update((s) => ({
				...s,
				entries: res.data?.data ?? [],
				total: res.data?.meta?.totalRows ?? 0,
				page,
				loading: false
			}));
		} catch (e: any) {
			masterDataStore.update((s) => ({
				...s,
				entries: [],
				loading: false,
				error: message(e, 'Could not load this list.')
			}));
		}
	},

	async create(kind: string, payload: Record<string, unknown>) {
		masterDataStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.post(ENDPOINTS.catalog.create(kind), payload);
			masterDataStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			masterDataStore.update((s) => ({ ...s, saving: false, error: message(e, 'Could not save.') }));
			return false;
		}
	},

	async update(kind: string, id: string, payload: Record<string, unknown>) {
		masterDataStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.put(ENDPOINTS.catalog.one(kind, id), payload);
			masterDataStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			masterDataStore.update((s) => ({ ...s, saving: false, error: message(e, 'Could not save.') }));
			return false;
		}
	},

	async remove(kind: string, id: string) {
		masterDataStore.update((s) => ({ ...s, saving: true, error: '' }));
		try {
			await api.delete(ENDPOINTS.catalog.one(kind, id));
			masterDataStore.update((s) => ({ ...s, saving: false }));
			return true;
		} catch (e: any) {
			masterDataStore.update((s) => ({ ...s, saving: false, error: message(e, 'Could not remove.') }));
			return false;
		}
	},

	reset() {
		masterDataStore.set({ ...EMPTY });
	}
};

/** One editable input on a reference list's form. */
/**
 * A company an entry can be assigned to, for the staff owner picker.
 */
export interface OwnerOption {
	value: string;
	label: string;
}

/**
 * Companies, for staff assigning an entry to one.
 *
 * Loaded once and kept: the list changes rarely and every master-data form
 * would otherwise fetch it again on open.
 */
export const companyOptions = writable<OwnerOption[]>([]);

export async function loadCompanyOptions() {
	if (get(companyOptions).length > 0) return;
	try {
		const res = await api.get(ENDPOINTS.adminCompanies, { pageSize: 500 });
		companyOptions.set(
			(res.data?.data ?? []).map((c: any) => ({
				value: c.id,
				label: c.abbreviation ? `${c.name} (${c.abbreviation})` : c.name
			}))
		);
	} catch {
		// Not staff, or the directory is unavailable. The picker then offers
		// only "shared", which is what a non-staff caller gets anyway.
		companyOptions.set([]);
	}
}

export interface FieldDef {
	key: string;
	label: string;
	type?: 'text' | 'number' | 'textarea';
	help?: string;
	/** A reference to another catalogue, rendered as a picker. */
	ref?: string;
	/**
	 * The field whose value narrows this picker.
	 *
	 * Sub-categories belong to a category, so the list is fetched with that
	 * category as `parentId` rather than showing every sub-category on the
	 * platform — a list nobody can find anything in once there are more than a
	 * handful.
	 */
	dependsOn?: string;
}

/**
 * What each reference list is, and what it holds beyond a name.
 *
 * Declared here rather than discovered from the API because the ten lists
 * genuinely differ — a brand has no dimensions, a truck body has no axles —
 * and the shared envelope carries those in `attributes`, which says nothing
 * about how to LABEL or ORDER them. The server still decides what it accepts;
 * this only decides what the form offers.
 */
export const CATALOGS: Record<
	string,
	{
		label: string;
		blurb: string;
		fields: FieldDef[];
		/**
		 * The field that identifies an entry, where it is not `name`.
		 *
		 * A tracker model is a vendor and a model; a sensor type is a code.
		 * Assuming `name` everywhere would put a required marker on a field
		 * these collections do not have.
		 */
		nameKey?: string;
		/** A second identifying field, shown beside the first. */
		label2Key?: string;
	}
> = {
	cargoType: {
		label: 'Cargo Type',
		blurb: 'What is being moved — general cargo, reefer, liquid, bulk.',
		fields: [{ key: 'description', label: 'Description', type: 'textarea' }]
	},
	itemCategory: {
		label: 'Item Category',
		blurb: 'The top level of the goods classification.',
		fields: [{ key: 'description', label: 'Description', type: 'textarea' }]
	},
	itemSubCategory: {
		label: 'Item Sub Category',
		blurb: 'Sits under a category. Optional to use — items can name a category directly.',
		fields: [
			// Required here, unlike on an item: a sub-category with no category
			// is not a sub-category of anything. The database says the same.
			{ key: 'categoryId', label: 'Category', ref: 'itemCategory', help: 'Required.' },
			{ key: 'description', label: 'Description', type: 'textarea' }
		]
	},
	item: {
		label: 'Item',
		blurb: 'A specific thing a company ships.',
		fields: [
			// Both levels are OPTIONAL, and that is deliberate. Some companies
			// classify two deep — Tekstil dan Garmen > Garmen > Roll Kain —
			// and others just name the thing. Requiring a category would make
			// the second group invent one, and an invented category is worse
			// than none: it looks like a classification and orders nothing.
			{ key: 'categoryId', label: 'Category', ref: 'itemCategory', help: 'Optional.' },
			{
				key: 'subCategoryId',
				label: 'Sub category',
				ref: 'itemSubCategory',
				dependsOn: 'categoryId',
				help: 'Optional. Choose a category first to narrow this list.'
			},
			{ key: 'cargoTypeId', label: 'Cargo type', ref: 'cargoType', help: 'Optional.' },
			{ key: 'unit', label: 'Unit', help: 'Kg, Pcs, Zak, Pallet…' },
			{ key: 'weightKg', label: 'Weight (kg)', type: 'number' },
			{ key: 'volumeM3', label: 'Volume (m³)', type: 'number' }
		]
	},
	truckHead: {
		label: 'Truck Head',
		blurb: 'A kind of tractor head. A head pulls; it carries nothing itself.',
		fields: [
			{ key: 'code', label: 'Code' },
			{ key: 'axles', label: 'Axles', type: 'number' },
			{ key: 'configuration', label: 'Configuration', help: '4x2, 6x4…' }
		]
	},
	truckBody: {
		label: 'Truck Body',
		blurb: 'A kind of body or trailer, and the spec that comes with it.',
		fields: [
			{ key: 'code', label: 'Code' },
			{ key: 'maxWeightKg', label: 'Max weight (kg)', type: 'number' },
			{ key: 'volumeM3', label: 'Volume (m³)', type: 'number' }
		]
	},
	truckClass: {
		label: 'Truck Class',
		blurb: 'The size axis — CDE, CDD, Tronton, Trailer 40FT.',
		fields: [
			{ key: 'code', label: 'Code' },
			{
				key: 'sortOrder',
				label: 'Sort order',
				type: 'number',
				help: 'Smallest to largest. These have a natural order that alphabetical sorting destroys.'
			},
			{
				key: 'typicalMaxWeightKg',
				label: 'Typical max weight (kg)',
				type: 'number',
				help: 'Indicative only — the BODY carries the figure a load is priced against.'
			},
			{ key: 'axles', label: 'Axles', type: 'number' }
		]
	},
	brand: {
		label: 'Brand',
		blurb: 'Vehicle manufacturers.',
		fields: []
	},
	vehicleGroup: {
		label: 'Vehicle Group',
		blurb: 'How a company groups its own fleet — by depot, contract or division.',
		fields: [{ key: 'description', label: 'Description', type: 'textarea' }]
	},
	trackerModel: {
		label: 'Tracker Model',
		// Identified by vendor AND model, not by a name: the unique index is on
		// the pair, and "FMB920" means nothing without "Teltonika".
		nameKey: 'vendor',
		label2Key: 'model',
		blurb: 'Telematics device models. Maintained by Karlo.',
		fields: [
			{ key: 'model', label: 'Model', help: 'Required. Unique together with the vendor.' },
			{ key: 'protocol', label: 'Protocol', help: 'How it speaks — codec8, gt06. The ingest service decodes by this.' }
		]
	},
	sensorType: {
		label: 'Sensor Type',
		nameKey: 'code',
		blurb: 'Kinds of sensor a device can carry. Maintained by Karlo.',
		fields: [
			{ key: 'name', label: 'Name', help: 'Required. e.g. Fuel level.' },
			{ key: 'unit', label: 'Unit', help: 'L, °C, %. Leave empty for a door or a switch.' },
			{
				key: 'valueKind',
				label: 'Value kind',
				help: 'number or boolean — a door is not a quantity. Defaults to number.'
			},
			{ key: 'description', label: 'Description', type: 'textarea' }
		]
	}
};

/**
 * Which lists accept a SHARED entry — one owned by nobody and visible to every
 * company.
 *
 * Mirrors the server, which refuses a shared write on the rest. A vehicle group
 * is how one company organises its own fleet and an item is a thing one company
 * ships; neither has a meaning without an owner.
 */
export const SHAREABLE: Record<string, boolean> = {
	brand: true,
	cargoType: true,
	itemCategory: true,
	itemSubCategory: true,
	truckHead: true,
	truckBody: true,
	truckClass: true,
	trackerModel: true,
	sensorType: true,
	item: false,
	vehicleGroup: false
};

/** URL slug to catalogue kind, so /a/cargo-type resolves to cargoType. */
export function kindFromSlug(slug: string): string {
	const match = Object.keys(CATALOGS).find(
		(kind) => kind.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()) === slug
	);
	return match ?? '';
}

export function slugFor(kind: string): string {
	return kind.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}
