/**
 * The company's books, as the Finance pages read them: the chart of
 * accounts and the manual journal lines (business service /ledger). The
 * automatic postings are derived in $lib/revamp/jurnal.js, never stored.
 */
import { api } from '$lib/utils/api';

export interface CoaAccount {
	id: string;
	kode: string;
	nama: string;
	tipe: string;
	isSystem: boolean;
}

export interface ManualEntry {
	id: string;
	tanggal: string;
	keterangan: string;
	akunDebitKode: string;
	akunKreditKode: string;
	jumlah: string | number;
	createdAt?: string;
}

function rows<T>(res: any): T[] {
	const d = res?.data?.data;
	return Array.isArray(d) ? d : [];
}

export const ledger = {
	async accounts(): Promise<CoaAccount[]> {
		return rows<CoaAccount>(await api.get('/ledger/accounts'));
	},
	async addAccount(a: { kode: string; nama: string; tipe: string }): Promise<CoaAccount> {
		return (await api.post('/ledger/accounts', a)).data?.data;
	},
	async updateAccount(id: string, a: { kode: string; nama: string; tipe: string }): Promise<CoaAccount> {
		return (await api.put(`/ledger/accounts/${id}`, a)).data?.data;
	},
	async deleteAccount(id: string): Promise<void> {
		await api.delete(`/ledger/accounts/${id}`);
	},
	async entries(): Promise<ManualEntry[]> {
		return rows<ManualEntry>(await api.get('/ledger/entries')).map((e) => ({
			...e,
			tanggal: String(e.tanggal ?? '').slice(0, 10)
		}));
	},
	async addEntry(e: Omit<ManualEntry, 'id'>): Promise<ManualEntry> {
		return (await api.post('/ledger/entries', e)).data?.data;
	},
	async updateEntry(id: string, e: Omit<ManualEntry, 'id'>): Promise<ManualEntry> {
		return (await api.put(`/ledger/entries/${id}`, e)).data?.data;
	},
	async deleteEntry(id: string): Promise<void> {
		await api.delete(`/ledger/entries/${id}`);
	}
};
