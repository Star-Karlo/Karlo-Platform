<script lang="ts">
	/**
	 * Insight — the prototype's Dashboard (Karlo-TMS-Revamp DashboardView.vue),
	 * widget for widget. Persona templates, the period filter and the
	 * adjust/reorder mode are the prototype's; every figure is an aggregation
	 * over what the services return, never a stored analytics row.
	 *
	 * Where the prototype summed a derived journal (there is no ledger in the
	 * services), the finance widgets read invoices and trip allowances — the
	 * two money flows the business service actually records.
	 */
	import { onMount } from 'svelte';
	import {
		Lightbulb,
		ClipboardList,
		Banknote,
		Truck,
		BadgeCheck,
		FileText,
		Wallet,
		Scale,
		Handshake,
		Calendar,
		Users,
		MonitorDot,
		Settings,
		ChevronDown,
		Check,
		GripVertical,
		X,
		Plus
	} from 'lucide-svelte';
	import { api } from '$lib/utils/api';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { toast } from '$lib/stores/ui';
	import { kontrakStatus } from '$lib/revamp/kontrakStatus';
	import { atOrPassed } from '$lib/revamp/spotOrderStatus.js';
	import { agreementTypeLabel } from '$lib/revamp/agreementType.js';
	import { formatRupiah } from '$lib/revamp/currency.js';

	let { basePath: _basePath = '/t' }: { basePath?: string } = $props();

	// ---------- Data (the same lists every other page reads) ----------
	interface OrderRow {
		id: string;
		status: string;
		nilai: number;
		shipperName: string;
		truckPlate: string;
		driverId: string;
		createdAt: string;
		pickupAt: string;
		kontrak: boolean;
		vendor: { idTransporter: string; namaPerusahaan: string } | null;
		invoiceFinalized: boolean;
		billingPaid: boolean;
	}
	interface TruckRow {
		plate: string;
		active: boolean;
		driver: boolean;
	}
	interface DriverRow {
		id: string;
		status: string;
	}
	interface AgreementRow {
		id: string;
		idAgreement: string;
		customerNama: string;
		agreementType: string;
		tanggalBerakhir: string;
		active: boolean;
	}
	interface InvoiceRow {
		statusCode: string;
		total: number;
		createdAt: string;
		paidAt: string;
	}
	interface AllowanceRow {
		total: number;
		enteredAt: string;
		finalisedAt: string;
	}

	let orders = $state<OrderRow[]>([]);
	let trucks = $state<TruckRow[]>([]);
	let drivers = $state<DriverRow[]>([]);
	let agreements = $state<AgreementRow[]>([]);
	let vendors = $state<{ idTransporter: string; namaPerusahaan: string }[]>([]);
	let invoices = $state<InvoiceRow[]>([]);
	let allowances = $state<AllowanceRow[]>([]);
	let loaded = $state(false);

	function list(res: any): any[] {
		const d = res?.data?.data;
		return Array.isArray(d) ? d : (d?.items ?? []);
	}

	async function load() {
		const [o, v, d, a, t, inv, al] = await Promise.allSettled([
			api.get(ENDPOINTS.orders.list, { page: 0, pageSize: 500 }),
			api.get(ENDPOINTS.vehicles.list, { pageSize: 500 }),
			api.get(ENDPOINTS.drivers.list, { pageSize: 500 }),
			api.get(ENDPOINTS.agreements.list, { page: 0, pageSize: 500 }),
			api.get('/transporters'),
			api.get(ENDPOINTS.invoices.list, { page: 0, pageSize: 500 }),
			api.get(ENDPOINTS.orders.allowances, { page: 0, pageSize: 500 })
		]);
		if (o.status === 'fulfilled') {
			orders = list(o.value).map((x: any) => {
				const det = x.detail ?? {};
				return {
					id: x.id,
					status: kontrakStatus(x),
					nilai: Number(x.price ?? det.nilai ?? 0) || 0,
					shipperName: x.shipperCompanyName ?? det.shipperName ?? 'Tanpa Nama',
					truckPlate: x.truckPoliceNumber ?? det.assignedTruckPlate ?? '',
					driverId: x.driverId ?? '',
					createdAt: x.createdAt ?? '',
					pickupAt: x.pickupAt ?? '',
					kontrak: det.internalOrder === true,
					vendor: det.assignedVendor ?? null,
					invoiceFinalized: !!det.invoiceFinalized,
					billingPaid: det.invoiceProgress?.billing?.status === 'paid'
				};
			});
		}
		if (v.status === 'fulfilled') {
			trucks = list(v.value).map((x: any) => ({
				plate: x.licensePlate ?? x.policeNumber ?? '',
				active: (x.status ?? 'active') === 'active',
				driver: !!(x.currentDriverId || x.driverIds?.length)
			}));
		}
		if (d.status === 'fulfilled') {
			drivers = list(d.value).map((x: any) => ({ id: x.id, status: x.status ?? 'active' }));
		}
		if (a.status === 'fulfilled') {
			agreements = list(a.value).map((x: any) => ({
				id: x.id,
				idAgreement: x.agreementNumber ?? x.id,
				customerNama: x.shipperCompanyName ?? x.detail?.customerNama ?? '',
				agreementType: x.detail?.agreementType ?? '',
				tanggalBerakhir: x.detail?.tanggalBerakhir ?? String(x.validUntil ?? '').slice(0, 10),
				active: x.statusCode === 'active'
			}));
		}
		if (t.status === 'fulfilled') {
			vendors = list(t.value).map((x: any) => ({
				idTransporter: x.id ?? x.companyId,
				namaPerusahaan: x.name ?? x.companyName ?? ''
			}));
		}
		if (inv.status === 'fulfilled') {
			invoices = list(inv.value).map((x: any) => ({
				statusCode: x.statusCode ?? 'draft',
				total: Number(x.total ?? 0) || 0,
				createdAt: x.createdAt ?? x.issuedAt ?? '',
				paidAt: x.paidAt ?? ''
			}));
		}
		if (al.status === 'fulfilled') {
			allowances = list(al.value).map((x: any) => ({
				total: Number(x.total ?? 0) || 0,
				enteredAt: x.enteredAt ?? '',
				finalisedAt: x.finalisedAt ?? ''
			}));
		}
		const failed = [o, v, d, a, t, inv, al].filter((r) => r.status === 'rejected');
		if (failed.length) toast('Sebagian data dashboard gagal dimuat');
		loaded = true;
	}
	onMount(() => {
		void load();
		loadPersonaState();
	});

	// ---------- Persona templates ----------
	const PERSONAS = [
		{ key: 'management', label: 'Management/Director', icon: Lightbulb },
		{ key: 'sales', label: 'Sales', icon: Users },
		{ key: 'operation', label: 'Operation/Planner', icon: MonitorDot },
		{ key: 'finance', label: 'Finance', icon: Wallet }
	] as const;
	type PersonaKey = (typeof PERSONAS)[number]['key'];
	const PERSONA_TEMPLATE_DEFAULT: Record<PersonaKey, string[]> = {
		management: ['orderStatusOverview', 'customerTable', 'vendorTable'],
		sales: [
			'orderStatusOverview',
			'orderVolume',
			'orderValue',
			'agreementOverview',
			'agreementExpiring',
			'topCustomers'
		],
		operation: [
			'orderStatusOverview',
			'orderFunnel',
			'fleetUtilization',
			'driverStatus',
			'podBacklog',
			'fleetSize'
		],
		finance: ['orderStatusOverview', 'financeSummary', 'cashFlow', 'receivablesPayables', 'invoiceStatus']
	};
	const PERSONA_STORAGE_KEY = 'dashboard-active-persona';
	let activePersona = $state<PersonaKey>('management');
	let activePersonaMeta = $derived(PERSONAS.find((p) => p.key === activePersona) ?? PERSONAS[0]);
	let personaMenuOpen = $state(false);

	// ---------- Period filter ----------
	const PERIOD_TABS = [
		{ value: 'hari', label: 'Hari Ini' },
		{ value: 'minggu', label: 'Minggu Ini' },
		{ value: 'bulan', label: 'Bulan Ini' },
		{ value: 'tahun', label: 'Tahun Ini' },
		{ value: 'semua', label: 'Semua Periode' },
		{ value: 'custom', label: 'Custom' }
	];
	let periodFilter = $state('bulan');
	let customFrom = $state('');
	let customTo = $state('');
	function toDate(iso: string): Date | null {
		if (!iso) return null;
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? null : d;
	}
	function isoDate(d: Date) {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	}
	function startOfWeek(d: Date) {
		const day = d.getDay() === 0 ? 7 : d.getDay();
		const monday = new Date(d);
		monday.setDate(d.getDate() - (day - 1));
		monday.setHours(0, 0, 0, 0);
		return monday;
	}
	function inPeriod(date: Date | null): boolean {
		if (!date) return false;
		if (periodFilter === 'semua') return true;
		const now = new Date();
		if (periodFilter === 'hari') return date.toDateString() === now.toDateString();
		if (periodFilter === 'minggu') return date >= startOfWeek(now) && date <= now;
		if (periodFilter === 'bulan')
			return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
		if (periodFilter === 'tahun') return date.getFullYear() === now.getFullYear();
		if (periodFilter === 'custom') {
			const label = isoDate(date);
			if (customFrom && label < customFrom) return false;
			if (customTo && label > customTo) return false;
			return true;
		}
		return true;
	}
	let spotOrders = $derived(orders.filter((o) => !o.kontrak));
	let kontrakOrders = $derived(orders.filter((o) => o.kontrak));
	let spotInPeriod = $derived(spotOrders.filter((o) => inPeriod(toDate(o.createdAt))));
	let kontrakInPeriod = $derived(kontrakOrders.filter((o) => inPeriod(toDate(o.createdAt))));
	let allInPeriod = $derived([...spotInPeriod, ...kontrakInPeriod]);

	// ---------- Widget registry ----------
	interface WidgetMeta {
		key: string;
		label: string;
		icon: any;
		wide?: boolean;
		snapshot?: boolean;
		half?: boolean;
		table?: boolean;
	}
	const WIDGET_REGISTRY: WidgetMeta[] = [
		{ key: 'orderStatusOverview', label: 'Order Status Overview', icon: ClipboardList, wide: true },
		{ key: 'orderVolume', label: 'Total Order', icon: ClipboardList },
		{ key: 'orderValue', label: 'Total Nilai Order', icon: Banknote },
		{ key: 'orderFunnel', label: 'Pipeline Status Order', icon: Lightbulb },
		{ key: 'fleetUtilization', label: 'Utilisasi Armada', icon: Truck, snapshot: true },
		{ key: 'driverStatus', label: 'Status Driver', icon: BadgeCheck, snapshot: true },
		{ key: 'podBacklog', label: 'Backlog Verifikasi POD', icon: FileText, snapshot: true },
		{ key: 'financeSummary', label: 'Ringkasan Keuangan', icon: Wallet },
		{ key: 'cashFlow', label: 'Arus Kas', icon: Banknote },
		{ key: 'receivablesPayables', label: 'Piutang & Hutang', icon: Scale, snapshot: true },
		{ key: 'invoiceStatus', label: 'Status Invoice', icon: FileText },
		{ key: 'agreementOverview', label: 'Ringkasan Agreement', icon: Handshake, snapshot: true },
		{ key: 'agreementExpiring', label: 'Agreement Akan Berakhir', icon: Calendar, snapshot: true },
		{ key: 'topCustomers', label: 'Top Customer', icon: Users },
		{ key: 'fleetSize', label: 'Ukuran Armada', icon: Truck, snapshot: true },
		{ key: 'customerTable', label: 'Data Customer', icon: Users, half: true, table: true },
		{ key: 'vendorTable', label: 'Vendor Transporter', icon: Truck, half: true, table: true }
	];
	const LIST_WIDGETS = new Set(['agreementExpiring', 'topCustomers']);
	function widgetMeta(key: string): WidgetMeta {
		return WIDGET_REGISTRY.find((w) => w.key === key) ?? { key, label: key, icon: Lightbulb };
	}

	// ---------- Per-persona layout, saved per persona ----------
	const WIDGET_LAYOUT_STORAGE_PREFIX = 'dashboard-widget-layout-';
	let widgetLayout = $state<string[]>([...PERSONA_TEMPLATE_DEFAULT.management]);
	function widgetLayoutStorageKey(persona: string) {
		return WIDGET_LAYOUT_STORAGE_PREFIX + persona;
	}
	function loadWidgetLayoutFor(persona: PersonaKey): string[] {
		try {
			const saved = JSON.parse(localStorage.getItem(widgetLayoutStorageKey(persona)) || 'null');
			if (Array.isArray(saved)) {
				const valid = saved.filter((k) => WIDGET_REGISTRY.some((w) => w.key === k));
				if (valid.length) return valid;
			}
		} catch {
			/* corrupt/old-shape saved value — fall through to the template default */
		}
		return [...PERSONA_TEMPLATE_DEFAULT[persona]];
	}
	function loadPersonaState() {
		try {
			const saved = localStorage.getItem(PERSONA_STORAGE_KEY);
			if (saved && PERSONAS.some((p) => p.key === saved)) activePersona = saved as PersonaKey;
		} catch {
			/* ignore — keep the default persona */
		}
		widgetLayout = loadWidgetLayoutFor(activePersona);
	}
	function selectPersona(key: PersonaKey) {
		if (key === activePersona) return;
		activePersona = key;
		widgetLayout = loadWidgetLayoutFor(key);
		widgetAdjustMode = false;
		addWidgetMenuOpen = false;
		try {
			localStorage.setItem(PERSONA_STORAGE_KEY, key);
		} catch {
			/* private-mode/storage-blocked — persona choice just won't survive reload */
		}
	}
	let widgetLayoutSavedFlash = $state(false);
	function saveWidgetLayoutDefault() {
		try {
			localStorage.setItem(widgetLayoutStorageKey(activePersona), JSON.stringify(widgetLayout));
			widgetLayoutSavedFlash = true;
			setTimeout(() => (widgetLayoutSavedFlash = false), 1800);
			toast(`Layout dashboard "${activePersonaMeta.label}" berhasil disimpan sebagai default`);
		} catch {
			toast('Gagal menyimpan layout — coba lagi');
		}
	}

	// ---------- Adjust mode ----------
	let widgetAdjustMode = $state(false);
	let addWidgetMenuOpen = $state(false);
	let availableWidgetsToAdd = $derived(WIDGET_REGISTRY.filter((w) => !widgetLayout.includes(w.key)));
	function removeWidget(key: string) {
		widgetLayout = widgetLayout.filter((k) => k !== key);
	}
	function addWidget(key: string) {
		widgetLayout = [...widgetLayout, key];
		addWidgetMenuOpen = false;
	}
	let draggedWidgetKey = $state<string | null>(null);
	function onWidgetDrop(targetKey: string) {
		const from = widgetLayout.indexOf(draggedWidgetKey ?? '');
		const to = widgetLayout.indexOf(targetKey);
		draggedWidgetKey = null;
		if (from === -1 || to === -1 || from === to) return;
		const next = [...widgetLayout];
		next.splice(to, 0, next.splice(from, 1)[0]);
		widgetLayout = next;
	}

	// ---------- Widget data ----------
	const PLANNED = new Set(['penugasan_pengemudi', 'pengemudi_ditugaskan', 'pengemudi_menerima_order']);
	const ONDUTY = new Set([
		'menuju_lokasi_muat',
		'tiba_lokasi_muat',
		'proses_muat_barang',
		'verifikasi_pod_muat',
		'pod_muat_terverifikasi',
		'menuju_lokasi_bongkar',
		'tiba_lokasi_bongkar',
		'proses_bongkar_muatan',
		'verifikasi_pod_bongkar',
		'pod_bongkar_terverifikasi',
		'menunggu_konfirmasi_pengiriman',
		'pengiriman_terkonfirmasi'
	]);
	const STATUS_OVERVIEW_STAGES = [
		{ key: 'newOrder', label: 'New Order', statuses: ['negosiasi', 'menunggu_pembayaran'] },
		{ key: 'requestAssignment', label: 'Ready to Plan', statuses: ['penugasan_pengemudi'] },
		{
			key: 'acceptByDriver',
			label: 'Accept by Driver',
			statuses: ['pengemudi_ditugaskan', 'pengemudi_menerima_order']
		},
		{
			key: 'loading',
			label: 'Loading',
			statuses: [
				'menuju_lokasi_muat',
				'tiba_lokasi_muat',
				'proses_muat_barang',
				'verifikasi_pod_muat',
				'pod_muat_terverifikasi'
			]
		},
		{
			key: 'unloading',
			label: 'Unloading',
			statuses: [
				'menuju_lokasi_bongkar',
				'tiba_lokasi_bongkar',
				'proses_bongkar_muatan',
				'verifikasi_pod_bongkar',
				'pod_bongkar_terverifikasi'
			]
		},
		{
			key: 'delivered',
			label: 'Delivered',
			statuses: ['menunggu_konfirmasi_pengiriman', 'pengiriman_terkonfirmasi']
		},
		{ key: 'canceled', label: 'Canceled', statuses: ['dibatalkan', 'kadaluarsa'] }
	];
	let orderStatusOverview = $derived([
		{ key: 'total', label: 'Total Order', value: allInPeriod.length },
		...STATUS_OVERVIEW_STAGES.map((s) => ({
			key: s.key,
			label: s.label,
			value: allInPeriod.filter((o) => s.statuses.includes(o.status)).length
		}))
	]);

	function sum(rows: { nilai: number }[]) {
		return rows.reduce((s, o) => s + o.nilai, 0);
	}
	function truckStatusOf(t: TruckRow, sets: { planned: Set<string>; onduty: Set<string> }) {
		if (!t.active) return 'unavailable';
		if (!t.driver) return 'unpaired';
		if (sets.onduty.has(t.plate)) return 'onduty';
		if (sets.planned.has(t.plate)) return 'planned';
		return 'available';
	}
	let fleetUtilization = $derived.by(() => {
		const sets = { planned: new Set<string>(), onduty: new Set<string>() };
		for (const o of orders) {
			if (!o.truckPlate) continue;
			if (ONDUTY.has(o.status)) sets.onduty.add(o.truckPlate);
			else if (PLANNED.has(o.status)) sets.planned.add(o.truckPlate);
		}
		const counts = {
			available: 0,
			planned: 0,
			onduty: 0,
			unavailable: 0,
			unpaired: 0
		};
		for (const t of trucks) counts[truckStatusOf(t, sets) as keyof typeof counts]++;
		const activeTotal = trucks.filter((t) => t.active).length;
		const utilization = activeTotal ? Math.round(((counts.planned + counts.onduty) / activeTotal) * 100) : 0;
		return { ...counts, utilization };
	});
	// "Menunggu": an active driver no truck is paired with. "Idle ≥ 3 hari":
	// no pickup in the last three days — the closest the order history gets
	// to the prototype's per-driver idleDays counter.
	let driverStatus = $derived.by(() => {
		const active = drivers.filter((d) => d.status === 'active');
		const onOrder = new Set(
			orders.filter((o) => PLANNED.has(o.status) || ONDUTY.has(o.status)).map((o) => o.driverId)
		);
		const cutoff = Date.now() - 3 * 86400000;
		const recent = new Set(
			orders.filter((o) => (toDate(o.pickupAt)?.getTime() ?? 0) >= cutoff).map((o) => o.driverId)
		);
		return {
			active: active.length,
			waiting: active.filter((d) => !onOrder.has(d.id)).length,
			idle: active.filter((d) => !onOrder.has(d.id) && !recent.has(d.id)).length
		};
	});
	let podBacklog = $derived({
		podMuat: orders.filter((o) => o.status === 'verifikasi_pod_muat').length,
		podBongkar: orders.filter((o) => o.status === 'verifikasi_pod_bongkar').length
	});
	// Finance: revenue is what was invoiced, cost is what was paid out to
	// drivers as trip allowance — the two money flows the services record.
	let invoicesInPeriod = $derived(
		invoices.filter((i) => i.statusCode !== 'cancelled' && inPeriod(toDate(i.createdAt)))
	);
	let allowancesInPeriod = $derived(allowances.filter((a) => inPeriod(toDate(a.enteredAt))));
	let financeSummary = $derived.by(() => {
		const pendapatan = invoicesInPeriod.reduce((s, i) => s + i.total, 0);
		const beban = allowancesInPeriod.reduce((s, a) => s + a.total, 0);
		return { pendapatan, beban, labaRugi: pendapatan - beban };
	});
	let cashFlow = $derived.by(() => {
		const masuk = invoices
			.filter((i) => i.statusCode === 'paid' && inPeriod(toDate(i.paidAt || i.createdAt)))
			.reduce((s, i) => s + i.total, 0);
		const keluar = allowances
			.filter((a) => a.finalisedAt && inPeriod(toDate(a.finalisedAt)))
			.reduce((s, a) => s + a.total, 0);
		return { masuk, keluar, bersih: masuk - keluar };
	});
	let receivablesPayables = $derived({
		piutang: invoices
			.filter((i) => ['issued', 'submitted', 'verified'].includes(i.statusCode))
			.reduce((s, i) => s + i.total, 0),
		hutang: allowances.filter((a) => !a.finalisedAt).reduce((s, a) => s + a.total, 0)
	});
	let invoiceStatus = $derived.by(() => {
		const relevant = kontrakInPeriod.filter((o) => atOrPassed(o.status, 'pengemudi_ditugaskan'));
		const finalCount = relevant.filter((o) => o.invoiceFinalized).length;
		const paidCount = relevant.filter((o) => o.billingPaid).length;
		return {
			total: relevant.length,
			finalCount,
			draftCount: relevant.length - finalCount,
			paidCount,
			unpaidCount: relevant.length - paidCount
		};
	});
	function isAgreementExpired(a: AgreementRow) {
		if (!a.active) return true;
		if (!a.tanggalBerakhir) return false;
		return a.tanggalBerakhir < isoDate(new Date());
	}
	let agreementOverview = $derived.by(() => {
		const active = agreements.filter((a) => !isAgreementExpired(a));
		return {
			activeCount: active.length,
			singleCount: active.filter((a) => a.agreementType === 'single-shipment').length,
			multiCount: active.filter((a) => a.agreementType === 'multi-shipment').length,
			expiredCount: agreements.filter(isAgreementExpired).length
		};
	});
	let agreementExpiring = $derived.by(() => {
		const todayStr = isoDate(new Date());
		const in30Str = isoDate(new Date(Date.now() + 30 * 86400000));
		return agreements
			.filter((a) => a.tanggalBerakhir && a.tanggalBerakhir >= todayStr && a.tanggalBerakhir <= in30Str)
			.sort((a, b) => a.tanggalBerakhir.localeCompare(b.tanggalBerakhir))
			.slice(0, 5)
			.map((a) => ({
				id: a.id,
				label: a.customerNama || a.idAgreement,
				sub: agreementTypeLabel(a.agreementType),
				value: a.tanggalBerakhir
			}));
	});
	let customerRows = $derived.by(() => {
		const stats: Record<string, { id: string; name: string; orderCount: number; income: number }> = {};
		for (const o of allInPeriod) {
			const name = o.shipperName || 'Tanpa Nama';
			stats[name] ??= { id: name, name, orderCount: 0, income: 0 };
			stats[name].orderCount += 1;
			stats[name].income += o.nilai;
		}
		return Object.values(stats).sort((a, b) => b.income - a.income);
	});
	let topCustomers = $derived(
		customerRows
			.slice(0, 5)
			.map((r) => ({ id: r.id, label: r.name, sub: null, value: formatRupiah(r.income) }))
	);
	let customerChartData = $derived({
		rows: customerRows,
		max: customerRows.reduce((m, r) => Math.max(m, r.income), 0) || 1
	});
	let vendorChartData = $derived.by(() => {
		const stats: Record<string, { id: string; name: string; orderCount: number }> = {};
		for (const v of vendors)
			stats[v.idTransporter] = { id: v.idTransporter, name: v.namaPerusahaan, orderCount: 0 };
		for (const o of allInPeriod) {
			if (!o.vendor) continue;
			stats[o.vendor.idTransporter] ??= {
				id: o.vendor.idTransporter,
				name: o.vendor.namaPerusahaan,
				orderCount: 0
			};
			stats[o.vendor.idTransporter].orderCount += 1;
		}
		const rows = Object.values(stats).sort((a, b) => b.orderCount - a.orderCount);
		return { rows, max: rows.reduce((m, r) => Math.max(m, r.orderCount), 0) || 1 };
	});
	let fleetSize = $derived({
		total: trucks.length,
		active: trucks.filter((t) => t.active).length,
		withDriver: trucks.filter((t) => t.driver).length,
		withoutDriver: trucks.filter((t) => !t.driver).length
	});

	function widgetStatItems(key: string): { label: string; value: string | number }[] {
		switch (key) {
			case 'orderVolume':
				return [
					{ label: 'Total Order', value: allInPeriod.length },
					{ label: 'Spot Order', value: spotInPeriod.length },
					{ label: 'Order Kontrak', value: kontrakInPeriod.length }
				];
			case 'orderValue':
				return [
					{ label: 'Total Nilai Order', value: formatRupiah(sum(allInPeriod)) },
					{ label: 'Nilai Spot Order', value: formatRupiah(sum(spotInPeriod)) },
					{ label: 'Nilai Order Kontrak', value: formatRupiah(sum(kontrakInPeriod)) }
				];
			case 'orderFunnel': {
				let planned = 0,
					onduty = 0,
					selesai = 0,
					lainnya = 0;
				for (const o of allInPeriod) {
					if (o.status === 'pengiriman_terkonfirmasi') selesai++;
					else if (PLANNED.has(o.status)) planned++;
					else if (ONDUTY.has(o.status)) onduty++;
					else lainnya++;
				}
				return [
					{ label: 'Planned', value: planned },
					{ label: 'On Duty', value: onduty },
					{ label: 'Selesai', value: selesai },
					{ label: 'Lainnya', value: lainnya }
				];
			}
			case 'fleetUtilization': {
				const v = fleetUtilization;
				return [
					{ label: 'Utilisasi Armada', value: `${v.utilization}%` },
					{ label: 'Available', value: v.available },
					{ label: 'Planned', value: v.planned },
					{ label: 'On Duty', value: v.onduty },
					{ label: 'Unavailable', value: v.unavailable },
					{ label: 'Unpaired', value: v.unpaired }
				];
			}
			case 'driverStatus':
				return [
					{ label: 'Driver Aktif', value: driverStatus.active },
					{ label: 'Driver Menunggu', value: driverStatus.waiting },
					{ label: 'Idle ≥ 3 Hari', value: driverStatus.idle }
				];
			case 'podBacklog':
				return [
					{ label: 'Perlu Verifikasi POD Muat', value: podBacklog.podMuat },
					{ label: 'Perlu Verifikasi POD Bongkar', value: podBacklog.podBongkar }
				];
			case 'financeSummary':
				return [
					{ label: 'Pendapatan (Bulan Ini)', value: formatRupiah(financeSummary.pendapatan) },
					{ label: 'Beban (Bulan Ini)', value: formatRupiah(financeSummary.beban) },
					{ label: 'Laba / Rugi', value: formatRupiah(financeSummary.labaRugi) }
				];
			case 'cashFlow':
				return [
					{ label: 'Kas Masuk', value: formatRupiah(cashFlow.masuk) },
					{ label: 'Kas Keluar', value: formatRupiah(cashFlow.keluar) },
					{ label: 'Arus Bersih', value: formatRupiah(cashFlow.bersih) }
				];
			case 'receivablesPayables':
				return [
					{ label: 'Piutang Usaha', value: formatRupiah(receivablesPayables.piutang) },
					{ label: 'Hutang Usaha', value: formatRupiah(receivablesPayables.hutang) }
				];
			case 'invoiceStatus':
				return [
					{ label: 'Invoice Final', value: invoiceStatus.finalCount },
					{ label: 'Invoice Draft', value: invoiceStatus.draftCount },
					{ label: 'Sudah Dibayar', value: invoiceStatus.paidCount },
					{ label: 'Belum Dibayar', value: invoiceStatus.unpaidCount }
				];
			case 'agreementOverview':
				return [
					{ label: 'Agreement Aktif', value: agreementOverview.activeCount },
					{ label: 'Single Shipment', value: agreementOverview.singleCount },
					{ label: 'Multi Shipment', value: agreementOverview.multiCount },
					{ label: 'Expired', value: agreementOverview.expiredCount }
				];
			case 'fleetSize':
				return [
					{ label: 'Total Armada', value: fleetSize.total },
					{ label: 'Armada Aktif', value: fleetSize.active },
					{ label: 'Ada Driver', value: fleetSize.withDriver },
					{ label: 'Tanpa Driver', value: fleetSize.withoutDriver }
				];
			default:
				return [];
		}
	}
	function widgetListRows(key: string) {
		if (key === 'agreementExpiring') return agreementExpiring;
		if (key === 'topCustomers') return topCustomers;
		return [];
	}
</script>

<div class="page-head">
	<div>
		<h1>Insight</h1>
	</div>
	<div style="display:flex; gap:8px;">
		<div class="dash-persona-picker">
			<button
				type="button"
				class="btn btn-outline"
				onclick={() => {
					personaMenuOpen = !personaMenuOpen;
					addWidgetMenuOpen = false;
				}}
			>
				<activePersonaMeta.icon size={16} />
				Persona: {activePersonaMeta.label}
				<ChevronDown
					size={14}
					class="dash-persona-picker-chevron {personaMenuOpen ? 'dash-persona-picker-chevron--up' : ''}"
				/>
			</button>
			{#if personaMenuOpen}
				<div class="dash-persona-menu">
					{#each PERSONAS as p (p.key)}
						<button
							type="button"
							class="dash-persona-menu-item"
							class:dash-persona-menu-item--active={activePersona === p.key}
							onclick={() => {
								selectPersona(p.key);
								personaMenuOpen = false;
							}}
						>
							<span class="dash-persona-icon"><p.icon size={16} /></span>
							<span class="dash-persona-menu-label">{p.label}</span>
							{#if activePersona === p.key}<Check size={14} class="dash-persona-menu-check" />{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="btn btn-outline"
			class:dash-toolbar-btn--active={widgetAdjustMode}
			onclick={() => {
				widgetAdjustMode = !widgetAdjustMode;
				addWidgetMenuOpen = false;
				personaMenuOpen = false;
			}}
		>
			<Settings size={16} />
			{widgetAdjustMode ? 'Selesai' : 'Atur Widget'}
		</button>
		{#if widgetAdjustMode}
			<button type="button" class="btn btn-primary" onclick={saveWidgetLayoutDefault}>
				{widgetLayoutSavedFlash ? 'Tersimpan ✓' : 'Simpan sebagai Default'}
			</button>
		{/if}
	</div>
</div>

<div class="method-tabs dash-period-tabs">
	{#each PERIOD_TABS as p (p.value)}
		<button
			type="button"
			class="method-tab"
			class:active={periodFilter === p.value}
			onclick={() => (periodFilter = p.value)}
		>
			{p.label}
		</button>
	{/each}
</div>
{#if periodFilter === 'custom'}
	<div class="two-col dash-period-custom">
		<div class="field" style="margin-bottom:0;">
			<label for="dash-from">Dari Tanggal</label>
			<input id="dash-from" type="date" bind:value={customFrom} />
		</div>
		<div class="field" style="margin-bottom:0;">
			<label for="dash-to">Sampai Tanggal</label>
			<input id="dash-to" type="date" bind:value={customTo} />
		</div>
	</div>
{/if}

<div class="dash-grid">
	{#each widgetLayout as key (key)}
		{@const meta = widgetMeta(key)}
		<div
			class="card dash-widget"
			class:dash-widget--editing={widgetAdjustMode}
			class:dash-widget--dragging={draggedWidgetKey === key}
			class:dash-widget--wide={meta.wide}
			class:dash-widget--half={meta.half}
			draggable={widgetAdjustMode}
			role="listitem"
			ondragstart={() => (draggedWidgetKey = key)}
			ondragover={(e) => e.preventDefault()}
			ondrop={() => onWidgetDrop(key)}
		>
			{#if widgetAdjustMode}
				<div class="dash-widget-edit-bar">
					<GripVertical size={14} class="dash-widget-drag-handle" />
					<span class="dash-widget-edit-label">{meta.label}</span>
					<button
						type="button"
						class="dash-widget-remove"
						title="Hapus widget ini"
						onclick={() => removeWidget(key)}
					>
						<X size={14} />
					</button>
				</div>
			{/if}

			<div class="dash-widget-head">
				<span class="dash-widget-icon"><meta.icon size={18} /></span>
				<h4>{meta.label}</h4>
				{#if meta.snapshot}<span class="dash-widget-snapshot-pill">Saat ini</span>{/if}
			</div>

			{#if key === 'orderStatusOverview'}
				<div class="dash-status-row">
					{#each orderStatusOverview as item (item.key)}
						<div class="dash-status-pill">
							<span>{item.label}</span>
							<b>{item.value}</b>
						</div>
					{/each}
				</div>
			{:else if key === 'customerTable'}
				<div class="dash-chart-wrap">
					{#if !customerChartData.rows.length}
						<div class="dash-table-empty">Belum ada data customer.</div>
					{/if}
					{#each customerChartData.rows as row, i (row.id)}
						<div class="dash-chart-row">
							<div class="dash-chart-row-top">
								<span class="dash-table-rank">{i + 1}</span>
								<span class="dash-chart-name">{row.name}</span>
								<span class="dash-chart-value">{formatRupiah(row.income)}</span>
							</div>
							<div class="dash-chart-bar-track">
								<div
									class="dash-chart-bar-fill dash-chart-bar-fill--customer"
									style="width:{Math.round((row.income / customerChartData.max) * 100)}%"
								></div>
							</div>
							<div class="dash-chart-sub">{row.orderCount} order</div>
						</div>
					{/each}
				</div>
			{:else if key === 'vendorTable'}
				<div class="dash-chart-wrap">
					{#if !vendorChartData.rows.length}
						<div class="dash-table-empty">Belum ada data vendor.</div>
					{/if}
					{#each vendorChartData.rows as row, i (row.id)}
						<div class="dash-chart-row">
							<div class="dash-chart-row-top">
								<span class="dash-table-rank">{i + 1}</span>
								<span class="dash-chart-name">{row.name}</span>
								<span class="dash-chart-value">{row.orderCount} order</span>
							</div>
							<div class="dash-chart-bar-track">
								<div
									class="dash-chart-bar-fill dash-chart-bar-fill--vendor"
									style="width:{Math.round((row.orderCount / vendorChartData.max) * 100)}%"
								></div>
							</div>
							<div class="dash-chart-sub" title="Belum ada data biaya vendor di sistem">Pengeluaran: -</div>
						</div>
					{/each}
				</div>
			{:else if !LIST_WIDGETS.has(key)}
				<div class="dash-stat-grid">
					{#each widgetStatItems(key) as item (item.label)}
						<div class="dash-stat-item">
							<span>{item.label}</span>
							<b>{item.value}</b>
						</div>
					{/each}
				</div>
			{:else}
				<div class="dash-list">
					{#if !widgetListRows(key).length}
						<div class="dash-list-empty">Tidak ada data.</div>
					{/if}
					{#each widgetListRows(key) as row (row.id)}
						<div class="dash-list-row">
							<div class="dash-list-row-main">
								<b>{row.label}</b>
								{#if row.sub}<span>{row.sub}</span>{/if}
							</div>
							<div class="dash-list-row-value">{row.value}</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	{#if widgetAdjustMode}
		<div class="dash-widget-add">
			<button
				type="button"
				class="dash-widget-add-btn"
				onclick={() => (addWidgetMenuOpen = !addWidgetMenuOpen)}
				disabled={!availableWidgetsToAdd.length}
			>
				<Plus size={16} />
				<span>Tambah Widget</span>
			</button>
			{#if addWidgetMenuOpen}
				<div class="dash-widget-add-menu">
					{#if !availableWidgetsToAdd.length}
						<div class="dash-widget-add-menu-empty">Semua widget sudah ditampilkan</div>
					{/if}
					{#each availableWidgetsToAdd as w (w.key)}
						<button type="button" class="dash-widget-add-menu-item" onclick={() => addWidget(w.key)}>
							<w.icon size={14} />
							{w.label}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if loaded && !widgetLayout.length && !widgetAdjustMode}
		<div class="dash-empty">
			<Lightbulb size={28} />
			<p>Belum ada widget yang ditampilkan.</p>
			<button type="button" class="btn btn-outline" onclick={() => (widgetAdjustMode = true)}
				>Atur Widget</button
			>
		</div>
	{/if}
</div>
