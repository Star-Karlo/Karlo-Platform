/** The industry sectors a company picks from — the prototype's Jenis Layanan list. */
export const INDUSTRY_SECTORS = [
	'Logistik & Fulfillment',
	'Retail / Distributor',
	'E-Commerce / Online Shop',
	'Manufaktur / Produksi',
	'F&B (Makanan & Minuman)',
	'Fashion & Apparel',
	'Elektronik & Gadget',
	'Otomotif',
	'Pertanian / Peternakan',
	'Furniture',
	'Kecantikan & Personal Care',
	'Lainnya'
];
export const INDUSTRY_SECTOR_OPTIONS = INDUSTRY_SECTORS.map((v) => ({ value: v, label: v }));
